"use client";

import { ActionIcon, ColorInput, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { updateCategory } from "@/actions/categories";
import { categorySchema } from "@/lib/validations";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";

interface EditCategoryButtonProps {
  id: string;
  name: string;
  color: string;
}

export function EditCategoryButton(props: EditCategoryButtonProps) {
  const { id, name, color } = props;
  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Categoria atualizada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: { name, color },
    validate: zod4Resolver(categorySchema),
  });

  const handleOpen = () => {
    form.setValues({ name, color });
    open();
  };

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => updateCategory(id, values));
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

      <FormModal
        opened={opened}
        onClose={close}
        title="Editar categoria"
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
