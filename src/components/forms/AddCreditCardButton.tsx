"use client";

import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { creditCardSchema } from "@/lib/validations";
import type { CurrencyCode } from "@/lib/currency";
import { createCreditCard } from "@/actions/creditCards";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { CreditCardFields, type CreditCardFormValues } from "./CreditCardFields";
import type { Option } from "@/lib/options";

/**
 * Valores iniciais. Função e não constante de módulo porque a moeda de partida
 * é a moeda base do usuário, que só é conhecida em tempo de render.
 */
function empty(baseCurrency: CurrencyCode): CreditCardFormValues {
  return {
    name: "",
    institution: "",
    closingDay: 1,
    dueDay: 10,
    currency: baseCurrency,
    creditLimit: null,
    defaultPaymentAccountId: "",
  };
}

interface AddCreditCardButtonProps {
  accounts: Option[];
  /** Último recurso do campo de moeda: a moeda base do usuário. */
  baseCurrency: CurrencyCode;
}

export function AddCreditCardButton(props: AddCreditCardButtonProps) {
  const { accounts, baseCurrency } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Cartão criado",
  });

  const initialValues = empty(baseCurrency);

  const form = useForm<CreditCardFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: zod4Resolver(creditCardSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createCreditCard(values), { onSuccess: () => form.setValues(initialValues) });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar cartão
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Adicionar cartão"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <CreditCardFields form={form} accounts={accounts} />
      </FormModal>
    </>
  );
}
