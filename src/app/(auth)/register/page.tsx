"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
    Anchor,
    Button,
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

import { registerSchema } from "@/lib/validations";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: { name: "", email: "", password: "" },
    validate: zod4Resolver(registerSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setLoading(false);
      notifications.show({
        color: "red",
        title: "Falha no cadastro",
        message: data.error ?? "Não foi possível criar a conta.",
      });
      return;
    }

    // Auto sign-in after successful registration.
    const signInRes = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    setLoading(false);

    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  });

  return (
    <Paper withBorder shadow="md" p="xl" radius="md" w={420} maw="100%">
      <Title order={2} ta="center" mb="lg">
        Criar sua conta
      </Title>

      <form onSubmit={handleSubmit}>
        <Stack>
          <TextInput
            label="Nome"
            placeholder="Seu nome"
            key={form.key("name")}
            {...form.getInputProps("name")}
          />
          <TextInput
            label="Email"
            placeholder="voce@exemplo.com"
            key={form.key("email")}
            {...form.getInputProps("email")}
          />
          <PasswordInput
            label="Senha"
            placeholder="Pelo menos 8 caracteres"
            key={form.key("password")}
            {...form.getInputProps("password")}
          />
          <Button type="submit" loading={loading} fullWidth mt="sm">
            Cadastrar
          </Button>
        </Stack>
      </form>

      <Text c="dimmed" size="sm" ta="center" mt="md">
        Já tem uma conta?{" "}
        <Anchor component={Link} href="/login" size="sm">
          Entrar
        </Anchor>
      </Text>
    </Paper>
  );
}
