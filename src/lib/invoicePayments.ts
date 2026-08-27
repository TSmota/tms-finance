import type { InvoiceStatus, Prisma, Transaction } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { getExchangeRate, FX_RATE_SCALE } from "@/lib/fxService";
import { convertMoney, isPositive, money, toStorage } from "@/lib/money";
import { parseCalendarDate } from "@/lib/dates";
import { applyToBalance, type Tx } from "@/lib/accountBalance";
import { requireInvoice } from "@/lib/invoices";
import { requireAccount } from "@/lib/ownership";
import type { InvoicePaymentInput } from "@/lib/validations";

/**
 * Pagamento da fatura.
 *
 * Uma única transação `INVOICE_PAYMENT` debita a conta pelo total da fatura.
 *
 * As parcelas não recebem marca individual de quitação: o estado `PAID` da
 * fatura já responde por todas, e um flag por linha seria uma segunda fonte de
 * verdade para o mesmo fato.
 */

/**
 * Trava a linha da fatura e devolve status **e** total já sob o lock.
 *
 * `SELECT ... FOR UPDATE` cru, e não `findUnique`: em READ COMMITTED releitura
 * sem lock não impede nada — dois cliques no botão de pagar leem `OPEN` em
 * paralelo e a conta é debitada duas vezes. Não há `@@unique` em
 * `transactions(invoice_id)` que derrube o segundo.
 *
 * O total vem junto porque uma compra lançada entre a leitura e o lock muda o
 * que a fatura deve: pagar o valor lido antes deixaria a diferença sem cobrir.
 */
async function lockInvoice(
  tx: Tx,
  invoiceId: string,
): Promise<{ status: InvoiceStatus; totalAmount: Prisma.Decimal }> {
  const rows = await tx.$queryRaw<
    { status: InvoiceStatus; totalAmount: Prisma.Decimal }[]
  >`SELECT status, total_amount AS "totalAmount" FROM finance.invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;

  const row = rows[0];

  if (!row) {
    throw new NotFoundError("Fatura não encontrada");
  }

  return row;
}

export async function payInvoice(
  userId: string,
  invoiceId: string,
  input: InvoicePaymentInput,
): Promise<Transaction> {
  const invoice = await requireInvoice(userId, invoiceId);

  if (invoice.status === "PAID") {
    throw new InvalidOperationError("Esta fatura já foi paga");
  }

  if (!isPositive(money(invoice.totalAmount))) {
    throw new InvalidOperationError("Não há valor a pagar nesta fatura");
  }

  const account = await requireAccount(userId, input.accountId);

  const date = parseCalendarDate(input.date);

  // A fatura está na moeda do cartão; a conta pode estar em outra. A taxa é
  // resolvida aqui de propósito: chamada de rede dentro do `$transaction`
  // seguraria o lock esperando a API.
  const rate = await getExchangeRate({
    from: invoice.currency,
    to: account.currency,
    date,
    manualRate: input.manualFxRate,
  });

  return prisma.$transaction(async (tx) => {
    const current = await lockInvoice(tx, invoiceId);

    if (current.status === "PAID") {
      throw new InvalidOperationError("Esta fatura já foi paga");
    }

    const total = money(current.totalAmount);

    if (!isPositive(total)) {
      throw new InvalidOperationError("Não há valor a pagar nesta fatura");
    }

    const convertedAmount = convertMoney(total, rate);

    const payment = await tx.transaction.create({
      data: {
        userId,
        type: "INVOICE_PAYMENT",
        status: "CONFIRMED",
        description: `Pagamento da fatura ${String(invoice.month).padStart(2, "0")}/${invoice.year} — ${invoice.creditCard.name}`,
        date,
        amount: toStorage(total),
        currency: invoice.currency,
        exchangeRate: rate.toFixed(FX_RATE_SCALE),
        convertedAmount: toStorage(convertedAmount),
        accountId: account.id,
        invoiceId: invoice.id,
      },
    });

    await applyToBalance(tx, account.id, convertedAmount.negated());

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        paidAt: date,
        paymentAccountId: account.id,
      },
    });

    return payment;
  });
}

/**
 * Desfaz o pagamento da fatura, devolvendo o valor à conta de origem.
 *
 * Sem isto, um pagamento feito na conta errada só seria corrigível no banco.
 */
export async function undoInvoicePayment(userId: string, invoiceId: string): Promise<void> {
  const invoice = await requireInvoice(userId, invoiceId);

  if (invoice.status !== "PAID") {
    throw new InvalidOperationError("Esta fatura não está paga");
  }

  await prisma.$transaction(async (tx) => {
    const current = await lockInvoice(tx, invoiceId);

    if (current.status !== "PAID") {
      throw new InvalidOperationError("Esta fatura não está paga");
    }

    const payments = await tx.transaction.findMany({
      where: { userId, invoiceId, type: "INVOICE_PAYMENT" },
    });

    for (const payment of payments) {
      if (payment.accountId) {
        await applyToBalance(tx, payment.accountId, money(payment.convertedAmount));
      }
    }

    await tx.transaction.deleteMany({
      where: { id: { in: payments.map((payment) => payment.id) } },
    });

    await tx.invoice.update({
      where: { id: invoiceId },
      // Volta para OPEN: a competência pode receber lançamentos novamente.
      data: { status: "OPEN", paidAt: null, paymentAccountId: null },
    });
  });
}
