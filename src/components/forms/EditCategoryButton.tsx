"use client";

import { useState } from "react";
import {
    ActionIcon,
    Button,
    ColorInput,
    Modal,
    Stack,
    TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Pencil } from "lucide-react";

import { updateCategory } from "@/actions/categories";
import { categorySchema } from "@/lib/validations";

interface EditCategoryButtonProps {
  id: string;
  name: string;
  color: string;
}

export function EditCategoryButton(props: EditCategoryButtonProps) {
  const { id, name, color } = props;
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name,
      color,
    },
    validate: zod4Resolver(categorySchema),
  });

  const handleOpen = () => {
    form.setValues({ name, color });
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    const result = await updateCategory(id, values);
    setLoading(false);

    if (!result.ok) {
      notifications.show({ color: "red", message: result.error ?? "Falha ao salvar" });
      return;
    }

    notifications.show({ color: "teal", message: "Categoria atualizada" });
    close();
  });

  return (
    <>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Editar categoria"
        onClick={handleOpen}
      >
        <Pencil size={16} />
      </ActionIcon>

      <Modal opened={opened} onClose={close} title="Editar categoria" centered>
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
            <Button type="submit" loading={loading}>
              Salvar
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
