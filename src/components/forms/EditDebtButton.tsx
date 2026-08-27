"use client";

import { useState } from "react";
import { useForm } from "@mantine/form";
import { Pencil } from "lucide-react";

import type { CurrencyCode } from "@/lib/currency";
import type { DebtTypeCode } from "@/lib/debtTypes";
import { splitTarget } from "@/lib/paymentTarget";
import { updateDebt } from "@/actions/debts";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/IconButton";
import { useActionModal } from "@/components/ui/useActionModal";
import {
  DebtFields,
  resolveDebtTarget,
  type DebtFormValues,
  type DebtSubmitValues,
  validateDebt,
} from "./DebtFields";
import type { AccountOption, CardOption, Option } from "@/lib/options";

interface EditDebtButtonProps {
  id: string;
  values: DebtFormValues;
  people: Option[];
  categories: Option[];
  accounts: AccountOption[];
  /** Opcional só até as páginas passarem os cartões na Task 14. */
  cards?: CardOption[];
  type: DebtTypeCode;
  currency: CurrencyCode;
  /** Opcional só até as páginas calcularem o bloqueio na Task 14. */
  originLocked?: boolean;
}

export function EditDebtButton(props: EditDebtButtonProps) {
  const {
    id,
    values,
    people,
    categories,
    accounts,
    cards = [],
    type,
    currency,
    originLocked = false,
  } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Dívida atualizada",
  });
  const [showManualFx, setShowManualFx] = useState(false);
  const initialValues: DebtFormValues = {
    ...values,
    target: resolveDebtTarget(values),
    installments: values.installments ?? 1,
  };

  const form = useForm<DebtFormValues, DebtSubmitValues>({
    mode: "uncontrolled",
    initialValues,
    validate: validateDebt,
    transformValues: (submitted) => ({
      ...submitted,
      installments: submitted.installments ?? 1,
      ...splitTarget(resolveDebtTarget(submitted)),
    }),
  });

  const handleOpen = () => {
    form.setValues(initialValues);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (submitted) => {
    await run(() => updateDebt(id, submitted), {
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  return (
    <>
      <IconButton
        label={
          originLocked
            ? "A origem desta dívida está em uma fatura paga"
            : "Editar dívida"
        }
        onClick={handleOpen}
        disabled={originLocked}
      >
        <Pencil size={16} />
      </IconButton>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar dívida"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <DebtFields
          form={form}
          people={people}
          categories={categories}
          accounts={accounts}
          cards={cards}
          locked={{ type, currency }}
          showManualFx={showManualFx}
        />
      </FormModal>
    </>
  );
}
