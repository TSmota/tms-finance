import { redirect } from "next/navigation";
import type { Currency } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  /** Moeda de referência dos relatórios. */
  baseCurrency: Currency;
}

/**
 * IDs de usuário são UUID. A versão anterior do schema usava `cuid`, e um JWT
 * assinado com o mesmo `AUTH_SECRET` continua válido depois da migração —
 * carregando um id em formato antigo. Consultar o Postgres com ele levantaria
 * `invalid input syntax for type uuid` em vez de simplesmente não encontrar.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Usuário autenticado, ou redirect para `/login`.
 *
 * Confere no banco que o usuário do token ainda existe: o JWT é auto-contido e
 * sobrevive ao dado. Sem esta checagem, uma sessão órfã leria listas vazias e
 * quebraria toda escrita com violação de chave estrangeira.
 */
export async function requireUser(): Promise<CurrentUser> {
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
}
