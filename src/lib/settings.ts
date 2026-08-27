import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { BaseCurrencyInput } from "@/lib/validations";

/**
 * Configuração do usuário.
 *
 * A moeda base é o oposto da moeda de conta, cartão e dívida: aquelas são
 * imutáveis porque trocá-las reinterpretaria o histórico (R$ 100 viraria
 * US$ 100), esta só é **lida**, na agregação. Trocar não reescreve valor nenhum
 * no banco — muda a moeda em que os agregadores expressam o total, e a
 * conversão passa a usar a cotação de hoje.
 */
export async function updateBaseCurrency(
  userId: string,
  input: BaseCurrencyInput,
): Promise<void> {
  // `updateMany` e não `update`: escopar por `userId` num único statement faz o
  // usuário inexistente e o de outra pessoa caírem no mesmo `NotFoundError`, em
  // vez de um `P2025` cru do Prisma.
  const { count } = await prisma.user.updateMany({
    where: { id: userId },
    data: { baseCurrency: input.baseCurrency },
  });

  if (count === 0) {
    throw new NotFoundError("Usuário não encontrado");
  }
}
