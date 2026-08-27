import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

/**
 * Fixture de desenvolvimento.
 *
 * Os valores denormalizados (`currentBalance`, `invoice.totalAmount`,
 * `debt.remainingAmount`) são escritos já calculados à mão. As contas estão
 * conferidas nos comentários; se mexer nos lançamentos, refaça a soma.
 */

const environment = process.env.NODE_ENV ?? "development";

if (environment !== "development" || process.env.VERCEL) {
  console.log(
    `Refusing to seed: NODE_ENV=${environment}` +
      (process.env.VERCEL ? `, VERCEL_ENV=${process.env.VERCEL_ENV ?? "set"}` : ""),
  );
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const now = new Date();

/**
 * Data no mês corrente, ancorada em meia-noite **UTC**.
 *
 * `new Date(ano, mês, dia)` usaria componentes locais e gravaria 03:00Z nesta
 * máquina contra 00:00Z em UTC. A fixture segue a mesma regra do app, ou os
 * valores semeados não correspondem aos que o app produz.
 */
function thisMonth(day: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
}

/** Competência (ano/mês 1-12) deslocada em `offset` meses a partir do mês atual. */
function competency(offset: number): { year: number; month: number } {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));

  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

async function main() {
  const email = "demo@tms.finance";

  // Seed idempotente: o cascade do User limpa todo o resto.
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      name: "Usuário Demo",
      passwordHash: await bcrypt.hash("demo1234", 10),
      baseCurrency: "BRL",
    },
  });

  // ---------------------------------------------------------------
  // Categorias com subcategorias
  // ---------------------------------------------------------------
  const moradia = await prisma.category.create({
    data: { userId: user.id, name: "Moradia", color: "#4c6ef5" },
  });
  const luz = await prisma.category.create({
    data: { userId: user.id, name: "Luz", parentId: moradia.id, color: "#4c6ef5" },
  });

  const alimentacao = await prisma.category.create({
    data: { userId: user.id, name: "Alimentação", color: "#40c057" },
  });
  const mercado = await prisma.category.create({
    data: { userId: user.id, name: "Mercado", parentId: alimentacao.id, color: "#40c057" },
  });
  const restaurante = await prisma.category.create({
    data: { userId: user.id, name: "Restaurante", parentId: alimentacao.id, color: "#40c057" },
  });

  const lazer = await prisma.category.create({
    data: { userId: user.id, name: "Lazer", color: "#f76707" },
  });
  const viagem = await prisma.category.create({
    data: { userId: user.id, name: "Viagem", parentId: lazer.id, color: "#f76707" },
  });

  const assinaturas = await prisma.category.create({
    data: { userId: user.id, name: "Assinaturas", color: "#7950f2" },
  });
  const eletronicos = await prisma.category.create({
    data: { userId: user.id, name: "Eletrônicos", color: "#adb5bd" },
  });
  const salario = await prisma.category.create({
    data: { userId: user.id, name: "Salário", color: "#228be6" },
  });

  // ---------------------------------------------------------------
  // Contas
  // ---------------------------------------------------------------
  // Nubank: 1000,00 + 8000,00 − 450,30 − 120,00 − 81,00 − 200,00 + 80,00 = 8228,70
  const nubank = await prisma.financialAccount.create({
    data: {
      userId: user.id,
      name: "Conta corrente",
      type: "CHECKING",
      institution: "Nubank",
      currency: "BRL",
      initialBalance: "1000.00",
      currentBalance: "8228.70",
    },
  });

  // Wise: 2000,00 − 25,00 = 1975,00
  const wise = await prisma.financialAccount.create({
    data: {
      userId: user.id,
      name: "Conta internacional",
      type: "CHECKING",
      institution: "Wise",
      currency: "USD",
      initialBalance: "2000.00",
      currentBalance: "1975.00",
    },
  });

  // ---------------------------------------------------------------
  // Fluxo de caixa
  // ---------------------------------------------------------------
  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "INCOME",
      description: "Salário mensal",
      date: thisMonth(5),
      amount: "8000.00",
      currency: "BRL",
      convertedAmount: "8000.00",
      accountId: nubank.id,
      categoryId: salario.id,
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      description: "Supermercado",
      date: thisMonth(8),
      amount: "450.30",
      currency: "BRL",
      convertedAmount: "450.30",
      accountId: nubank.id,
      categoryId: mercado.id,
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      description: "Almoço",
      date: thisMonth(12),
      amount: "120.00",
      currency: "BRL",
      convertedAmount: "120.00",
      accountId: nubank.id,
      categoryId: restaurante.id,
    },
  });

  // Lançamento em moeda estrangeira numa conta BRL:
  // 15,00 USD × 5,40 = 81,00 BRL, e é o convertedAmount que move o saldo.
  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      description: "Spotify (cobrado em USD)",
      date: thisMonth(14),
      amount: "15.00",
      currency: "USD",
      exchangeRate: "5.4000",
      convertedAmount: "81.00",
      accountId: nubank.id,
      categoryId: assinaturas.id,
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      description: "Coworking",
      date: thisMonth(9),
      amount: "25.00",
      currency: "USD",
      convertedAmount: "25.00",
      accountId: wise.id,
    },
  });

  // ---------------------------------------------------------------
  // Cartão, faturas e compra parcelada
  // ---------------------------------------------------------------
  // Poupança na mesma instituição da conta corrente, para exercitar o
  // agrupamento por banco na tela de contas.
  await prisma.financialAccount.create({
    data: {
      userId: user.id,
      name: "Poupança",
      type: "SAVINGS",
      institution: "Nubank",
      currency: "BRL",
      initialBalance: "5000.00",
      currentBalance: "5000.00",
    },
  });

  await prisma.financialAccount.create({
    data: {
      userId: user.id,
      name: "Carteira física",
      type: "CASH",
      currency: "BRL",
      initialBalance: "150.00",
      currentBalance: "150.00",
    },
  });

  const card = await prisma.creditCard.create({
    data: {
      userId: user.id,
      name: "Cartão de crédito",
      institution: "Nubank",
      creditLimit: "5000.00",
      // Fatura debitada da conta corrente do mesmo banco, por padrão.
      defaultPaymentAccountId: nubank.id,
      closingDay: 20,
      dueDay: 5,
      currency: "BRL",
    },
  });

  // R$ 100,00 em 3x: 33,34 na primeira (resto dos centavos) + 33,33 + 33,33.
  const installmentAmounts = ["33.34", "33.33", "33.33"];
  let firstInstallmentId: string | null = null;

  for (const [index, amount] of installmentAmounts.entries()) {
    const { year, month } = competency(index);

    const invoice = await prisma.invoice.create({
      data: {
        userId: user.id,
        creditCardId: card.id,
        year,
        month,
        // closingDay 20 e dueDay 5: como 5 < 20, o vencimento cai no mês seguinte.
        closingDate: new Date(Date.UTC(year, month - 1, 20)),
        dueDate: new Date(Date.UTC(year, month, 5)),
        currency: "BRL",
        totalAmount: amount,
      },
    });

    // A anotação explícita quebra o ciclo de inferência: o tipo de `installment`
    // dependeria de `firstInstallmentId`, que é atribuído a partir dele (TS7022).
    const installment: { id: string } = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "EXPENSE",
        description: "Fone de ouvido",
        date: thisMonth(15),
        amount,
        currency: "BRL",
        convertedAmount: amount,
        creditCardId: card.id,
        invoiceId: invoice.id,
        categoryId: eletronicos.id,
        installmentNumber: index + 1,
        totalInstallments: installmentAmounts.length,
        // Convenção: a 1ª parcela é a âncora; as seguintes apontam para ela.
        parentInstallmentId: firstInstallmentId,
      },
    });

    if (firstInstallmentId === null) {
      firstInstallmentId = installment.id;
    }
  }

  // ---------------------------------------------------------------
  // Gastos recorrentes — apenas a definição
  // ---------------------------------------------------------------
  await prisma.recurringExpense.create({
    data: {
      userId: user.id,
      description: "Netflix",
      amount: "39.90",
      currency: "BRL",
      frequency: "MONTHLY",
      dueDay: 10,
      startDate: thisMonth(1),
      categoryId: assinaturas.id,
      creditCardId: card.id,
    },
  });

  await prisma.recurringExpense.create({
    data: {
      userId: user.id,
      description: "Conta de luz",
      amount: "180.00",
      currency: "BRL",
      frequency: "MONTHLY",
      dueDay: 15,
      // Valor variável: o usuário confirma o real no vencimento.
      isEstimated: true,
      startDate: thisMonth(1),
      categoryId: luz.id,
      accountId: nubank.id,
    },
  });

  // ---------------------------------------------------------------
  // Pessoas e dívidas
  // ---------------------------------------------------------------
  const alice = await prisma.person.create({
    data: { userId: user.id, name: "Alice", notes: "Colega de trabalho" },
  });
  await prisma.person.create({
    data: { userId: user.id, name: "Bob" },
  });

  // Emprestado 200,00 e recebido 80,00 de volta: restam 120,00.
  const debt = await prisma.debt.create({
    data: {
      userId: user.id,
      personId: alice.id,
      categoryId: viagem.id,
      type: "LENT",
      status: "PARTIALLY_PAID",
      description: "Passagens para a viagem de grupo",
      originalAmount: "200.00",
      remainingAmount: "120.00",
      currency: "BRL",
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      description: "Empréstimo para Alice",
      date: thisMonth(6),
      amount: "200.00",
      currency: "BRL",
      convertedAmount: "200.00",
      accountId: nubank.id,
      categoryId: viagem.id,
      debtId: debt.id,
    },
  });

  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "INCOME",
      description: "Alice devolveu parte",
      date: thisMonth(16),
      amount: "80.00",
      currency: "BRL",
      convertedAmount: "80.00",
      accountId: nubank.id,
      categoryId: viagem.id,
      debtId: debt.id,
    },
  });

  console.log(`Seed concluído para ${user.email} (senha: demo1234)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
