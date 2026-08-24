"use client";

import { useState } from "react";
import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { notifications } from "@mantine/notifications";

import { baseCurrencySchema } from "@/lib/validations";
import { CURRENCY_OPTIONS, type CurrencyCode } from "@/lib/currency";
import { updateBaseCurrency } from "@/actions/settings";

interface BaseCurrencyFormProps {
  current: CurrencyCode;
}

/**
 * Formulário fora de modal, diferente dos outros domínios: aqui não há lista
 * para "adicionar" nem linha para editar — é um único campo que pertence à
 * própria tela.
 */
export function BaseCurrencyForm(props: BaseCurrencyFormProps) {
  const { current } = props;

  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: { baseCurrency: current },
    validate: zod4Resolver(baseCurrencySchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);

    try {
      const result = await updateBaseCurrency(values);

      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });

        return;
      }

      notifications.show({ color: "teal", message: "Moeda base atualizada" });
      // `resetDirty` e não `reset`: o valor salvo é o novo ponto de partida, e
      // `reset` voltaria ao `current` do render anterior — o que a tela já
      // reescreve, mas por outro caminho.
      form.resetDirty(values);
    } finally {
      setLoading(false);
    }
  });

  return (
    <form onSubmit={handleSubmit}>
      {/* Largura limitada de propósito: a explicação abaixo do campo é texto
          corrido, e num viewport largo ela viraria uma linha de 1500px de tipo
          miúdo — ilegível justamente onde precisa ser lida. */}
      <Stack gap="md" maw={620}>
        <Select
          label="Moeda base"
          description="Moeda em que painel, relatórios, patrimônio e posição com terceiros são totalizados."
          data={CURRENCY_OPTIONS}
          allowDeselect={false}
          key={form.key("baseCurrency")}
          {...form.getInputProps("baseCurrency")}
        />

        <Text size="xs" c="dimmed">
          Trocar a moeda base não altera nenhum valor lançado: a moeda de cada
          conta, cartão e dívida continua a mesma, e nada é reescrito. O que muda é
          a moeda em que os totais são somados. Os relatórios de meses passados
          são reexpressos pela <strong>cotação de hoje</strong> — não pela cotação
          da época —, então o total de um mês fechado pode variar de um dia para
          o outro conforme o câmbio.
        </Text>

        <Group>
          <Button type="submit" loading={loading}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
