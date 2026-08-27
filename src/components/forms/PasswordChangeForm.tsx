"use client";

import { useState } from "react";
import { Button, Group, PasswordInput, Stack } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { notifications } from "@mantine/notifications";

import { passwordChangeSchema, PASSWORD_REQUIREMENT } from "@/lib/validations";
import { changePassword } from "@/actions/userAccount";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

/**
 * Troca de senha do próprio usuário.
 *
 * Trocar a senha derruba as sessões abertas, inclusive esta: a marca de troca
 * é comparada com o instante do login. O aviso está na `description` do campo
 * porque é consequência da ação, não uma regra de formato.
 */
export function PasswordChangeForm() {
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: EMPTY,
    validate: zod4Resolver(passwordChangeSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);

    try {
      const result = await changePassword(values);

      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });

        return;
      }

      form.setValues(EMPTY);
      notifications.show({
        color: "teal",
        message: "Senha alterada. As outras sessões foram encerradas.",
      });
    } finally {
      setLoading(false);
    }
  });

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md" maw={420}>
        <PasswordInput
          label="Senha atual"
          autoComplete="current-password"
          key={form.key("currentPassword")}
          {...form.getInputProps("currentPassword")}
        />
        <PasswordInput
          label="Nova senha"
          description={PASSWORD_REQUIREMENT}
          autoComplete="new-password"
          key={form.key("newPassword")}
          {...form.getInputProps("newPassword")}
        />
        <PasswordInput
          label="Repita a nova senha"
          autoComplete="new-password"
          key={form.key("confirmPassword")}
          {...form.getInputProps("confirmPassword")}
        />

        <Group>
          <Button type="submit" loading={loading}>
            Alterar senha
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
