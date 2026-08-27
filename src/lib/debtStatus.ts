import { money, type MoneyInput } from "@/lib/money";
import type { DebtStatusCode } from "@/lib/debtTypes";

/**
 * Situação da dívida derivada dos valores, nunca gravada à mão.
 *
 * O status é função pura de `originalAmount` e `remainingAmount`. Como campo
 * independente, convidaria à divergência: uma amortização que atualizasse o
 * saldo e esquecesse o status deixaria uma dívida quitada aparecendo como
 * pendente.
 *
 * A comparação é em decimal exato: com `number`, um restante de 0,1 + 0,2
 * contra um total de 0,3 não bateria.
 */
export function deriveDebtStatus(
  originalAmount: MoneyInput,
  remainingAmount: MoneyInput,
): DebtStatusCode {
  const original = money(originalAmount);
  const remaining = money(remainingAmount);

  if (remaining.lessThanOrEqualTo(0)) {
    return "PAID";
  }

  // `>=` e não `===`: se o restante ultrapassar o total por qualquer motivo, a
  // leitura honesta é "nada foi abatido", não um estado inventado.
  if (remaining.greaterThanOrEqualTo(original)) {
    return "PENDING";
  }

  return "PARTIALLY_PAID";
}
