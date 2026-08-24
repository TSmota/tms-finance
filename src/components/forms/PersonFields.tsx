"use client";

import { Textarea, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type PersonFormValues = {
  name: string;
  notes: string;
};

interface PersonFieldsProps {
  form: UseFormReturnType<PersonFormValues>;
}

export function PersonFields(props: PersonFieldsProps) {
  const { form } = props;

  return (
    <>
      <TextInput
        label="Nome"
        placeholder="Alice"
        key={form.key("name")}
        {...form.getInputProps("name")}
      />
      <Textarea
        label="Observações"
        description="Opcional"
        placeholder="Colega de trabalho"
        autosize
        minRows={2}
        key={form.key("notes")}
        {...form.getInputProps("notes")}
      />
    </>
  );
}
