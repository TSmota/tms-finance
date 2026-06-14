"use client";

import { useState } from "react";
import {
    Button,
    ColorInput,
    Modal,
    Stack,
    Switch,
    TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Plus } from "lucide-react";

import { categorySchema } from "@/lib/validations";
import { createCategory } from "@/actions/categories";

export function AddCategoryButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      color: "#40c057",
      isRecurring: false,
    },
    validate: zod4Resolver(categorySchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    const res = await createCategory(values);
    setLoading(false);
    if (!res.ok) {
      notifications.show({ color: "red", message: res.error ?? "Falha ao salvar" });
      return;
    }
    notifications.show({ color: "teal", message: "Categoria criada" });
    form.reset();
    close();
  });

  return (
    <>
      <Button variant="default" leftSection={<Plus size={16} />} onClick={open}>
        Adicionar categoria
      </Button>
      <Modal opened={opened} onClose={close} title="Adicionar categoria" centered>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Nome"
              key={form.key("name")}
              {...form.getInputProps("name")}
            />
            <ColorInput
              label="Cor"
              key={form.key("color")}
              {...form.getInputProps("color")}
            />
            <Switch
              label="Categoria recorrente"
              key={form.key("isRecurring")}
              {...form.getInputProps("isRecurring", { type: "checkbox" })}
            />
            <Button type="submit" loading={loading}>
              Salvar
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
