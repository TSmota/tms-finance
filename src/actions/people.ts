"use server";

import { requireUser } from "@/lib/session";
import { personSchema } from "@/lib/validations";
import * as service from "@/lib/people";
import { parseId, revalidateDomain, runAction } from "./guard";
import type { ActionResult } from "./types";

function revalidateAll() {
  revalidateDomain("people");
}

export async function createPerson(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = personSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createPerson(user.id, parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function updatePerson(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = personSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.updatePerson(user.id, parseId(id), parsed.data));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}

export async function deletePerson(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => service.deletePerson(user.id, parseId(id)));

  if (result.ok) {
    revalidateAll();
  }

  return result;
}
