"use client";

import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Pencil } from "lucide-react";

import { personSchema } from "@/lib/validations";
import { updatePerson } from "@/actions/people";
import { FormModal } from "@/components/ui/FormModal";
import { IconButton } from "@/components/ui/IconButton";
import { useActionModal } from "@/components/ui/useActionModal";
import { PersonFields, type PersonFormValues } from "./PersonFields";

interface EditPersonButtonProps {
  id: string;
  values: PersonFormValues;
}

export function EditPersonButton(props: EditPersonButtonProps) {
  const { id, values } = props;
  const { opened, open, close, loading, run } = useActionModal({
    successMessage: "Pessoa atualizada",
  });

  const form = useForm<PersonFormValues>({
    mode: "uncontrolled",
    initialValues: values,
    validate: zod4Resolver(personSchema),
  });

  const handleOpen = () => {
    form.setValues(values);
    open();
  };

  const handleSubmit = form.onSubmit(async (submitted) => {
    await run(() => updatePerson(id, submitted));
  });

  return (
    <>
      <IconButton label="Editar pessoa" onClick={handleOpen}>
        <Pencil size={16} />
      </IconButton>
      <FormModal
        opened={opened}
        onClose={close}
        title="Editar pessoa"
        onSubmit={handleSubmit}
        loading={loading}
      >
        <PersonFields form={form} />
      </FormModal>
    </>
  );
}
