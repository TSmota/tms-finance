import type { DebtListItem } from "@/lib/debts";
import type { Option } from "@/lib/options";
import { toCalendarDate } from "@/lib/dates";
import { defaultAccountTarget, joinTarget } from "@/lib/paymentTarget";
import type { DebtFormValues } from "./DebtFields";

/**
 * Valores iniciais do formulário de edição, a partir da dívida gravada.
 *
 * O destino e a data vêm da **movimentação de origem**, não de um palpite:
 * salvar sem mexer nesses campos precisa deixar o lançamento exatamente onde
 * ele está. Sem `"use client"` porque quem monta os valores é Server Component.
 */
export function toDebtFormValues(debt: DebtListItem, accounts: Option[]): DebtFormValues {
  const { originTarget } = debt;

  return {
    personId: debt.personId,
    categoryId: debt.categoryId,
    type: debt.type,
    description: debt.description,
    amount: debt.originalAmount,
    currency: debt.currency,
    target: originTarget
      ? joinTarget(
          originTarget.kind === "account" ? originTarget.id : null,
          originTarget.kind === "card" ? originTarget.id : null,
        )
      : defaultAccountTarget(accounts),
    installments: debt.originInstallments,
    date: toCalendarDate(debt.originDate ?? debt.createdAt),
    dueDate: debt.dueDate ? toCalendarDate(debt.dueDate) : null,
    manualFxRate: undefined,
  };
}
