"use client";

import { Button, ColorInput, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { categorySchema } from "@/lib/validations";
import { createCategory } from "@/actions/categories";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import type { Option } from "./options";

interface AddCategoryButtonProps {
  /** Apenas categorias raiz: a hierarquia é de dois níveis. */
  rootCategories: Option[];
}

export function AddCategoryButton(props: AddCategoryButtonProps) {
  const { rootCategories } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Categoria criada",
  });

  const form = useForm({
    mode: "uncontrolled",
    initialValues: { name: "", color: "#40c057", icon: "", parentId: "" },
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
        <TextInput label="Nome" key={form.key("name")} {...form.getInputProps("name")} />
        <Select
          label="Categoria pai"
          placeholder="Nenhuma (categoria raiz)"
          description="Escolher um pai transforma esta em subcategoria"
          data={rootCategories}
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
