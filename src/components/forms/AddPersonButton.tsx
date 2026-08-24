"use client";

import { Button } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Plus } from "lucide-react";

import { personSchema } from "@/lib/validations";
import { createPerson } from "@/actions/people";
import { FormModal } from "@/components/ui/FormModal";
import { useActionModal } from "@/components/ui/useActionModal";
import { PersonFields, type PersonFormValues } from "./PersonFields";

const EMPTY: PersonFormValues = { name: "", notes: "" };

export function AddPersonButton() {
  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Pessoa adicionada",
  });

  const form = useForm<PersonFormValues>({
    mode: "uncontrolled",
    initialValues: EMPTY,
    validate: zod4Resolver(personSchema),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await run(() => createPerson(values), { onSuccess: () => form.setValues(EMPTY) });
  });

  return (
    <>
      <Button leftSection={<Plus size={16} />} onClick={open}>
        Nova pessoa
      </Button>
      <FormModal
        opened={opened}
        onClose={close}
        title="Nova pessoa"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <PersonFields form={form} />
      </FormModal>
    </>
  );
}
