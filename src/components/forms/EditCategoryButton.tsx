"use client";

import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { updateCategory } from "@/actions/categories";
import { categorySchema } from "@/lib/validations";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/currency";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/IconButton";
import { useActionModal } from "@/components/ui/useActionModal";
import { CategoryFields, type CategoryFormValues } from "./CategoryFields";
import type { Option } from "@/lib/options";

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

  const values: CategoryFormValues = {
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
      <IconButton label="Editar categoria" onClick={handleOpen}>
        <Pencil size={16} />
      </IconButton>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar categoria"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <CategoryFields
          form={form}
          rootCategories={rootCategories.filter((option) => option.value !== id)}
        />
      </FormModal>
    </>
  );
}
