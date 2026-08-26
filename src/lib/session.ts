import { cache } from "react";
import { redirect } from "next/navigation";
import type { Currency } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { UUID_PATTERN } from "@/lib/uuid";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  /** Moeda de referência dos relatórios. */
  baseCurrency: Currency;
}

/**
 * Usuário autenticado, ou redirect para `/login`.
 *
 * Confere no banco que o usuário do token ainda existe: o JWT é auto-contido e
 * sobrevive ao dado. Sem esta checagem, uma sessão órfã leria listas vazias e
 * quebraria toda escrita com violação de chave estrangeira.
 *
 * `cache()` é por requisição, não entre requisições: o layout e a página de
 * `/dashboard` chamam os dois, e sem ele toda navegação custava duas idas ao
 * banco pelo mesmo usuário. Nada aqui é revalidado ou compartilhado — a memória
 * morre com a resposta.
 */
export const requireUser = cache(async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  const id = session?.user?.id;

  if (!id || !UUID_PATTERN.test(id)) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, image: true, baseCurrency: true },
  });

  if (!user) {
    redirect("/login");
  }

  return user;
});
