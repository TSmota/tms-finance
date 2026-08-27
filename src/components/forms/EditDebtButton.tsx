"use client";

import { useState } from "react";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { debtSchema } from "@/lib/validations";
import type { CurrencyCode } from "@/lib/currency";
import type { DebtTypeCode } from "@/lib/debtTypes";
import { updateDebt } from "@/actions/debts";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/IconButton";
import { useActionModal } from "@/components/ui/useActionModal";
import { DebtFields, type DebtFormValues } from "./DebtFields";
import type { AccountOption, Option } from "@/lib/options";

interface EditDebtButtonProps {
  id: string;
  values: DebtFormValues;
  people: Option[];
  categories: Option[];
  accounts: AccountOption[];
  type: DebtTypeCode;
  currency: CurrencyCode;
}

export function EditDebtButton(props: EditDebtButtonProps) {
  const { id, values, people, categories, accounts, type, currency } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Dívida atualizada",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const form = useForm<DebtFormValues>({
    mode: "uncontrolled",
    initialValues: values,
    validate: zod4Resolver(debtSchema),
  });

  const handleOpen = () => {
    form.setValues(values);
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
      <IconButton label="Editar dívida" onClick={handleOpen}>
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
          locked={{ type, currency }}
          showManualFx={showManualFx}
        />
      </FormModal>
    </>
  );
}
