import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { makeAccount, makeCategory, makeCreditCard, makePerson, makeUser } from "@tests/support/factories";

/**
 * Prova que a migration baseline produz um banco utilizável, que o isolamento
 * entre testes funciona, e que as CHECK constraints realmente barram estado
 * inválido.
 */

describe("baseline do schema", () => {
  it("cria todas as tabelas esperadas no schema finance", async () => {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'finance' ORDER BY tablename
    `;

    expect(rows.map((row) => row.tablename)).toEqual([
      "accounts",
      "agent_audit_log",
      "agent_tokens",
      "categories",
      "credit_cards",
      "debts",
      "financial_accounts",
      "invoices",
      "people",
      "rate_limit_hits",
      "recurring_expenses",
      "sessions",
      "transactions",
      "users",
      "verification_tokens",
    ]);
  });

  it("mantém as CHECK constraints escritas à mão nas migrations", async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'finance' AND c.contype = 'c'
    `;

    // Lista literal, e não uma contagem: a contagem em prosa já divergiu do
    // banco uma vez. Constraint nova sem entrada aqui reprova, e removida também.
    expect(rows.map((row) => row.conname).sort()).toEqual([
      "agent_audit_log_duration_non_negative",
      "agent_audit_log_verdict_known",
      "agent_tokens_scopes_known",
      "agent_tokens_scopes_not_empty",
      "categories_no_self_parent_check",
      "credit_cards_credit_limit_check",
      "credit_cards_days_check",
      "credit_cards_institution_check",
      "debts_amounts_check",
      "financial_accounts_institution_check",
      "invoices_month_check",
      "invoices_paid_consistency_check",
      "invoices_total_check",
      "rate_limit_hits_key_not_blank_check",
      "rate_limit_hits_scope_not_blank_check",
      "recurring_expenses_amount_check",
      "recurring_expenses_due_day_check",
      "recurring_expenses_payment_target_check",
      "recurring_expenses_period_check",
      "transactions_exchange_rate_check",
      "transactions_installments_check",
      "transactions_payment_target_check",
      "transactions_positive_amounts_check",
    ]);
  });
  it("registra o histórico de migrations em public, fora do schema finance", async () => {
    const rows = await prisma.$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`
      SELECT migration_name, finished_at, rolled_back_at
      FROM public._prisma_migrations ORDER BY migration_name
    `;

    // Afirmações sobre propriedades, não sobre a lista literal: fixar os nomes
    // faria este teste quebrar a cada migration nova, sem indicar defeito algum.
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.migration_name).toMatch(/_init$/);
    expect(rows.every((row) => row.finished_at !== null)).toBe(true);
    expect(rows.every((row) => row.rolled_back_at === null)).toBe(true);
  });

  it("gera UUID pelo banco, sem o cliente informar id", async () => {
    const user = await makeUser();

    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("isola cada teste: o banco começa vazio", async () => {
    // O teste anterior criou um usuário; o TRUNCATE do beforeEach deve tê-lo removido.
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it("apaga em cascata tudo que pertence ao usuário", async () => {
    const user = await makeUser();
    await makeAccount(user.id);
    await makeCategory(user.id);
    await makeCreditCard(user.id);

    await prisma.user.delete({ where: { id: user.id } });

    await expect(prisma.financialAccount.count()).resolves.toBe(0);
    await expect(prisma.category.count()).resolves.toBe(0);
    await expect(prisma.creditCard.count()).resolves.toBe(0);
  });

  it("guarda dinheiro como Decimal exato, sem passar por float", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1234567890.12" });

    const found = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
    });

    expect(found.initialBalance.toFixed(2)).toBe("1234567890.12");
  });
});

describe("invariantes protegidos pelo banco", () => {
  it("recusa transação sem conta nem cartão", async () => {
    const user = await makeUser();

    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          description: "sem meio de pagamento",
          date: new Date(),
          amount: "10.00",
          convertedAmount: "10.00",
        },
      }),
    ).rejects.toThrow(/transactions_payment_target_check/);
  });

  it("recusa transação com conta E cartão ao mesmo tempo", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const card = await makeCreditCard(user.id);

    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          description: "dois meios de pagamento",
          date: new Date(),
          amount: "10.00",
          convertedAmount: "10.00",
          accountId: account.id,
          creditCardId: card.id,
        },
      }),
    ).rejects.toThrow(/transactions_payment_target_check/);
  });

  it("recusa valor convertido que não é o lançado vezes a taxa", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);

    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          description: "convertido incoerente com a taxa",
          date: new Date(),
          amount: "100.00",
          exchangeRate: "5.1234",
          // A conversão correta seria 512.34: o cenário é gravar a taxa
          // arredondada e converter com a taxa cheia.
          convertedAmount: "512.38",
          accountId: account.id,
        },
      }),
    ).rejects.toThrow(/transactions_exchange_rate_check/);
  });

  it("aceita a taxa arredondada antes de multiplicar", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);

    const created = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "EXPENSE",
        description: "convertido coerente",
        date: new Date(),
        amount: "100.00",
        exchangeRate: "5.1234",
        convertedAmount: "512.34",
        accountId: account.id,
      },
    });

    expect(created.convertedAmount.toFixed(2)).toBe("512.34");
  });

  it("recusa valor negativo ou zero: a direção vem do type", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);

    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          description: "valor negativo",
          date: new Date(),
          amount: "-10.00",
          convertedAmount: "-10.00",
          accountId: account.id,
        },
      }),
    ).rejects.toThrow(/transactions_positive_amounts_check/);
  });

  it("recusa parcela fora do total (4 de 3)", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);

    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          description: "parcela impossível",
          date: new Date(),
          amount: "10.00",
          convertedAmount: "10.00",
          creditCardId: card.id,
          installmentNumber: 4,
          totalInstallments: 3,
        },
      }),
    ).rejects.toThrow(/transactions_installments_check/);
  });

  it("recusa dívida com restante maior que o valor original", async () => {
    const user = await makeUser();
    const person = await makePerson(user.id);
    const category = await makeCategory(user.id);

    await expect(
      prisma.debt.create({
        data: {
          userId: user.id,
          personId: person.id,
          categoryId: category.id,
          type: "LENT",
          description: "restante acima do original",
          originalAmount: "100.00",
          remainingAmount: "150.00",
        },
      }),
    ).rejects.toThrow(/debts_amounts_check/);
  });

  it("recusa recorrente sem conta nem cartão", async () => {
    const user = await makeUser();
    const category = await makeCategory(user.id);

    await expect(
      prisma.recurringExpense.create({
        data: {
          userId: user.id,
          categoryId: category.id,
          description: "sem meio de pagamento",
          amount: "50.00",
          dueDay: 10,
          startDate: new Date(),
        },
      }),
    ).rejects.toThrow(/recurring_expenses_payment_target_check/);
  });

  it("recusa fatura marcada como paga sem data e conta de pagamento", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);

    await expect(
      prisma.invoice.create({
        data: {
          userId: user.id,
          creditCardId: card.id,
          month: 8,
          year: 2026,
          closingDate: new Date("2026-08-20"),
          dueDate: new Date("2026-09-05"),
          status: "PAID",
        },
      }),
    ).rejects.toThrow(/invoices_paid_consistency_check/);
  });

  it("garante uma única fatura por cartão/mês/ano", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);
    const data = {
      userId: user.id,
      creditCardId: card.id,
      month: 8,
      year: 2026,
      closingDate: new Date("2026-08-20"),
      dueDate: new Date("2026-09-05"),
    };

    await prisma.invoice.create({ data });

    await expect(prisma.invoice.create({ data })).rejects.toThrow();
  });
});

