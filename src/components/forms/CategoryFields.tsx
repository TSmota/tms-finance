"use client";

import { ColorInput, Select, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";

import type { Option } from "@/lib/options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type CategoryFormValues = {
  name: string;
  color: string;
  icon: string;
  parentId: string;
};

interface CategoryFieldsProps {
  form: UseFormReturnType<CategoryFormValues>;
  /** Apenas categorias raiz: a hierarquia é de dois níveis. */
  rootCategories: Option[];
}

export function CategoryFields(props: CategoryFieldsProps) {
  const { form, rootCategories } = props;

  return (
    <>
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
      <ColorInput
        label="Cor"
        // O conta-gotas do Mantine é um botão só de ícone e nasce sem nome acessível.
        eyeDropperButtonProps={{ "aria-label": "Escolher uma cor da tela" }}
        key={form.key("color")}
        {...form.getInputProps("color")}
      />
    </>
  );
}
