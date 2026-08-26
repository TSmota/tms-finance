import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cronAuth";
import { materializeAllUsers } from "@/lib/recurring";

/**
 * Gera as ocorrências devidas de todos os usuários.
 *
 * A materialização é escrita multi-passo, com lock de fatura: não pode voltar
 * para dentro da renderização de um Server Component. Roda uma vez por dia,
 * fora do caminho do usuário, e as escritas de `src/actions/recurring.ts` a
 * chamam também, para que a recorrência recém-criada não espere até amanhã.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  return NextResponse.json(await materializeAllUsers());
}
