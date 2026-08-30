"use client";

import { useState } from "react";
import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { Plus } from "lucide-react";

import type { CurrencyCode } from "@/lib/currency";
import { todayCalendarDate } from "@/lib/dates";
import { joinTarget, splitTarget } from "@/lib/paymentTarget";
import { createDebt } from "@/actions/debts";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import {
  DebtFields,
  type DebtFormValues,
  validateDebt,
} from "./DebtFields";
import type { AccountOption, CardOption, Option } from "@/lib/options";

interface AddDebtButtonProps {
  people: Option[];
  categories: Option[];
  accounts: AccountOption[];
  cards: CardOption[];
  /** Pré-seleciona a pessoa quando o botão vive na linha de alguém. */
  defaultPersonId?: string;
  label?: string;
  /** Último recurso do campo de moeda: a moeda base do usuário. */
  baseCurrency: CurrencyCode;
}

export function AddDebtButton(props: AddDebtButtonProps) {
  const {
    people,
    categories,
    accounts,
    cards,
    defaultPersonId,
    label = "Nova dívida",
    baseCurrency,
  } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Dívida registrada",
  });
  const [showManualFx, setShowManualFx] = useState(false);
  const initialAccount = accounts[0];
  const initialCard = initialAccount ? undefined : cards[0];

  const initialValues: DebtFormValues = {
    personId: defaultPersonId ?? people[0]?.value ?? "",
    categoryId: categories[0]?.value ?? "",
    type: "LENT",
    description: "",
    amount: 0,
    currency: initialAccount?.currency ?? initialCard?.currency ?? baseCurrency,
    target: joinTarget(initialAccount?.value ?? null, initialCard?.value ?? null),
    installments: 1,
    date: todayCalendarDate(),
    dueDate: null,
    manualFxRate: undefined,
  };

  const form = useForm<DebtFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: validateDebt,
    transformValues: (values) => ({
      ...values,
      ...splitTarget(values.target),
    }),
  });

  const handleOpen = () => {
    form.setValues(initialValues);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createDebt(values), {
      onSuccess: () => {
        form.setValues(initialValues);
        setShowManualFx(false);
      },
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  return (
    <>
      <Button
        leftSection={<Plus size={16} />}
        onClick={handleOpen}
        disabled={
          people.length === 0 ||
          (accounts.length === 0 && cards.length === 0) ||
          categories.length === 0
        }
      >
        {label}
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Registrar dívida"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <DebtFields
          form={form}
          people={people}
          categories={categories}
          accounts={accounts}
          cards={cards}
          showManualFx={showManualFx}
        />
      </FormModal>
    </>
  );
}
