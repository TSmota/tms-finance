"use client";

import { useState } from "react";
import { ActionIcon, Alert, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { cardPurchaseSchema } from "@/lib/validations";
import { updateCardPurchase } from "@/actions/cardPurchases";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { CardPurchaseFields, type CardPurchaseFormValues } from "./CardPurchaseFields";
import type { AccountOption, Option } from "./options";

interface EditCardPurchaseButtonProps {
  /** Qualquer parcela do grupo: a edição é sempre sobre a compra inteira. */
  id: string;
  values: CardPurchaseFormValues;
  cards: AccountOption[];
  categories: Option[];
  /** Quantidade de parcelas atual, para avisar que todas serão reescritas. */
  totalInstallments: number | null;
  /** Cobrança gerada por um recorrente: o aviso muda de tom. */
  fromRecurring: boolean;
}

/**
 * Edita uma compra do cartão, incluindo o valor real de uma cobrança estimada.
 *
 * A compra é substituída por inteiro no servidor, então o formulário abre com o
 * **total** do grupo, não com o valor da parcela clicada.
 */
export function EditCardPurchaseButton(props: EditCardPurchaseButtonProps) {
  const { id, values, cards, categories, totalInstallments, fromRecurring } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Compra atualizada",
  });
  const [showManualFx, setShowManualFx] = useState(false);

  const form = useForm<CardPurchaseFormValues>({
    mode: "uncontrolled",
    initialValues: values,
    validate: zod4Resolver(cardPurchaseSchema),
  });

  const handleOpen = () => {
    form.setValues(values);
    setShowManualFx(false);
    open();
  };

  const handleSubmit = form.onSubmit(async (submitted) => {
    await run(() => updateCardPurchase(id, submitted), {
      onError: (result) => {
        if (result.needsManualFxRate) {
          setShowManualFx(true);
        }
      },
    });
  });

  const isInstalled = (totalInstallments ?? 1) > 1;

  return (
    <>
      <ActionIcon variant="subtle" color="gray" aria-label="Editar compra" onClick={handleOpen}>
        <Pencil size={16} />
      </ActionIcon>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar compra do cartão"
        onSubmit={handleSubmit}
        loading={loading}
      >
        {fromRecurring && (
          <Alert color="blue" variant="light">
            <Text size="sm">
              Esta cobrança foi gerada por um gasto recorrente. Ajustar aqui corrige apenas este
              ciclo; para mudar os próximos, edite a recorrência.
            </Text>
          </Alert>
        )}
        {isInstalled && (
          <Alert color="yellow" variant="light">
            <Text size="sm">
              Compra parcelada em {totalInstallments}x. Salvar reescreve todas as parcelas, em
              todas as faturas.
            </Text>
          </Alert>
        )}
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
