"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  Anchor,
  Button,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { notifications } from "@mantine/notifications";

import { loginSchema } from "@/lib/validations";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: { email: "", password: "" },
    validate: zod4Resolver(loginSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    const res = await signIn("credentials", {
      ...values,
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      // Só `CredentialsSignin` significa "não confere". Qualquer outro tipo é
      // falha nossa — banco fora, configuração quebrada — e culpar a senha
      // manda o usuário trocar uma senha que está certa.
      const wrongCredentials = res.error === "CredentialsSignin";

      notifications.show({
        color: "red",
        title: wrongCredentials ? "Falha ao entrar" : "Serviço indisponível",
        message: wrongCredentials
          ? "Email ou senha inválidos."
          : "Não foi possível entrar agora. Tente de novo em alguns instantes.",
      });
      return;
    }
    router.push("/dashboard");
    router.refresh();
  });

  return (
    <Paper withBorder shadow="md" p="xl" radius="md" w={420} maw="100%">
      <Title order={1} size="h2" ta="center" mb="lg">
        TMS Finance
      </Title>

      <Group grow mb="md">
        <Button
          variant="default"
          onClick={() => signIn("google", { redirectTo: "/dashboard" })}
        >
          Google
        </Button>
      </Group>

      <Divider label="ou continue com email" labelPosition="center" my="md" />

      <form onSubmit={handleSubmit}>
        <Stack>
          <TextInput
            label="Email"
            placeholder="voce@exemplo.com"
            key={form.key("email")}
            {...form.getInputProps("email")}
          />
          <PasswordInput
            label="Senha"
            placeholder="Sua senha"
            key={form.key("password")}
            {...form.getInputProps("password")}
          />
          <Button type="submit" loading={loading} fullWidth mt="sm">
            Entrar
          </Button>
        </Stack>
      </form>

      <Text c="dimmed" size="sm" ta="center" mt="md">
        Ainda não tem uma conta?{" "}
        <Anchor component={Link} href="/register" size="sm" underline="always">
          Criar conta
        </Anchor>
      </Text>
    </Paper>
  );
}
