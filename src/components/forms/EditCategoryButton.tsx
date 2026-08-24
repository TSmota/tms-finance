"use client";

import { ActionIcon, ColorInput, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { updateCategory } from "@/actions/categories";
import { categorySchema } from "@/lib/validations";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/currency";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import type { Option } from "./options";

interface EditCategoryButtonProps {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  /** Categorias raiz elegíveis como pai, já sem a própria categoria. */
  rootCategories: Option[];
}

export function EditCategoryButton(props: EditCategoryButtonProps) {
  const { id, name, color, parentId, rootCategories } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Categoria atualizada",
  });

  const values = {
    name,
    color: color ?? DEFAULT_CATEGORY_COLOR,
    icon: "",
    parentId: parentId ?? "",
  };

  const form = useForm({
    mode: "uncontrolled",
    initialValues: values,
    validate: zod4Resolver(categorySchema),
  });

  const handleOpen = () => {
    form.setValues(values);
    open();
  };

  const handleSubmit = form.onSubmit(async (submitted) => {
    await run(() => updateCategory(id, submitted));
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
        <TextInput label="Nome" key={form.key("name")} {...form.getInputProps("name")} />
        <Select
          label="Categoria pai"
          placeholder="Nenhuma (categoria raiz)"
          data={rootCategories.filter((option) => option.value !== id)}
          clearable
          searchable
          key={form.key("parentId")}
          {...form.getInputProps("parentId")}
        />
        <ColorInput label="Cor" key={form.key("color")} {...form.getInputProps("color")} />
      </FormModal>
    </>
  );
}
