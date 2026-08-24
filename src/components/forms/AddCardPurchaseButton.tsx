"use client";

import { useState } from "react";
import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { cardPurchaseSchema } from "@/lib/validations";
import type { CurrencyCode } from "@/lib/currency";
import { todayCalendarDate } from "@/lib/dates";
import { createCardPurchase } from "@/actions/cardPurchases";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { CardPurchaseFields, type CardPurchaseFormValues } from "./CardPurchaseFields";
import type { AccountOption, Option } from "./options";

interface AddCardPurchaseButtonProps {
  /** Cartões com a moeda, para sugerir a moeda do lançamento. */
  cards: AccountOption[];
  categories: Option[];
  /** Pré-seleciona um cartão quando o botão vive na página de um cartão só. */
  defaultCardId?: string;
  label?: string;
  /** Último recurso do campo de moeda: a moeda base do usuário. */
  baseCurrency: CurrencyCode;
}

export function AddCardPurchaseButton(props: AddCardPurchaseButtonProps) {
  const { cards, categories, defaultCardId, label = "Lançar compra", baseCurrency } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Compra lançada na fatura",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const initialCard = cards.find((card) => card.value === defaultCardId) ?? cards[0];

  const initialValues: CardPurchaseFormValues = {
    creditCardId: initialCard?.value ?? "",
    categoryId: "",
    description: "",
    amount: 0,
    currency: initialCard?.currency ?? baseCurrency,
    date: todayCalendarDate(),
    installments: 1,
    manualFxRate: undefined,
  };

  const form = useForm<CardPurchaseFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: zod4Resolver(cardPurchaseSchema),
  });

  const handleOpen = () => {
    form.setValues(initialValues);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createCardPurchase(values), {
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
      <Button leftSection={<Plus size={16} />} onClick={handleOpen}>
        {label}
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Lançar compra no cartão"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <CardPurchaseFields
          form={form}
          cards={cards}
          categories={categories}
          showManualFx={showManualFx}
        />
      </FormModal>
    </>
  );
}
