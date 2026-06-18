"use client";

import { Button, ColorInput, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { categorySchema } from "@/lib/validations";
import { createCategory } from "@/actions/categories";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

export function AddCategoryButton() {
  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Categoria criada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      color: "#40c057",
    },
    validate: zod4Resolver(categorySchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createCategory(values), { onSuccess: () => form.reset() });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Adicionar categoria
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Adicionar categoria"
        onSubmit={handleSubmit}
        loading={loading}
      >
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
      </FormModal>
    </>
  );
}
