"use client";

import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { categorySchema } from "@/lib/validations";
import { createCategory } from "@/actions/categories";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { CategoryFields, type CategoryFormValues } from "./CategoryFields";
import type { Option } from "@/lib/options";

interface AddCategoryButtonProps {
  /** Apenas categorias raiz: a hierarquia é de dois níveis. */
  rootCategories: Option[];
}

export function AddCategoryButton(props: AddCategoryButtonProps) {
  const { rootCategories } = props;

  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Categoria criada",
  });

  const initialValues: CategoryFormValues = { name: "", color: "#40c057", icon: "", parentId: "" };

  const form = useForm({
    mode: "uncontrolled",
    initialValues,
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
        <CategoryFields form={form} rootCategories={rootCategories} />
      </FormModal>
    </>
  );
}
