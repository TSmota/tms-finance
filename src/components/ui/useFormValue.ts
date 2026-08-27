"use client";

import { useState } from "react";
import type { UseFormReturnType } from "@mantine/form";

/**
 * Lê um campo e re-renderiza quando ele muda.
 *
 * Em `mode: "uncontrolled"` o `onChange` de `getInputProps` grava com
 * `forceUpdate: false`, então digitar não re-renderiza ninguém e
 * `form.getValues()` no corpo do render devolve para sempre o valor do último
 * re-render — em geral o inicial. Qualquer UI derivada de um campo (prévia,
 * aviso de conversão, rótulo que depende do tipo) precisa passar por aqui.
 */
export function useFormValue<
  Values extends Record<string, unknown>,
  Field extends keyof Values & string,
>(form: UseFormReturnType<Values>, path: Field): Values[Field] {
  const [value, setValue] = useState<Values[Field]>(form.getValues()[path]);

  form.watch(path, ({ value: next }) => setValue(next as Values[Field]));

  return value;
}
