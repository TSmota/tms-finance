import { InvalidOperationError } from "@/lib/errors";
import { splitCents } from "@/lib/installmentSplit";
import { MAX_INSTALLMENTS } from "@/lib/limits";
import { money, MONEY_SCALE, roundMoney, type Money, type MoneyInput } from "@/lib/money";

/**
 * Divisão de compra parcelada.
 *
 * Divide pelo número de parcelas e coloca os centavos restantes **na primeira**.
 * A soma das parcelas é sempre exatamente o total — é o que impede a fatura de
 * fechar com um centavo de diferença.
 */

export { MAX_INSTALLMENTS };

/**
 * Divide `total` em `count` parcelas.
 *
 * @throws {InvalidOperationError} se `count` for inválido, ou se o total for
 * pequeno demais para render pelo menos um centavo por parcela — R$ 0,01 em 3x
 * geraria parcelas de zero, que o banco recusa (`transactions_positive_amounts_check`).
 */
export function splitInstallments(total: MoneyInput, count: number): Money[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new InvalidOperationError("O número de parcelas deve ser um inteiro maior que zero");
  }

  if (count > MAX_INSTALLMENTS) {
    throw new InvalidOperationError(`O número de parcelas não pode passar de ${MAX_INSTALLMENTS}`);
  }

  const amount = money(total);

  if (amount.lessThanOrEqualTo(0)) {
    throw new InvalidOperationError("O valor da compra deve ser positivo");
  }

  // Converte para centavos inteiros e delega a `splitCents`, para que a prévia
  // no formulário e o valor gravado nunca divirjam.
  const totalCents = Number(roundMoney(amount).times(100).toFixed(0));

  if (totalCents < count) {
    throw new InvalidOperationError(
      `Não é possível dividir ${amount.toFixed(MONEY_SCALE)} em ${count} parcelas: ` +
        "cada parcela ficaria abaixo de um centavo",
    );
  }

  return splitCents(totalCents, count).map((cents) => money(cents).dividedBy(100));
}
