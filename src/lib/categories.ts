import { cache } from "react";
import type { Category } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { byName } from "@/lib/sorting";
import type { CategoryInput } from "@/lib/validations";

/**
 * Categorias e subcategorias.
 *
 * A hierarquia é de exatamente 2 níveis — "Moradia > Luz". O banco não sabe
 * expressar esse limite (a auto-relação permitiria profundidade infinita), então
 * é validado aqui: o pai indicado tem de ser uma categoria raiz.
 */

/** Pai válido: existe, é do usuário, e é raiz. */
async function assertValidParent(userId: string, parentId: string, childId?: string) {
  if (parentId === childId) {
    throw new InvalidOperationError("Uma categoria não pode ser pai de si mesma");
  }

  const parent = await prisma.category.findFirst({
    where: { id: parentId, userId },
    select: { parentId: true },
  });

  if (!parent) {
    throw new NotFoundError("Categoria pai não encontrada");
  }

  if (parent.parentId !== null) {
    throw new InvalidOperationError(
      "Subcategoria não pode ter subcategorias: a hierarquia é de dois níveis",
    );
  }
}

/** Uma categoria com filhos não pode virar subcategoria (viraria 3 níveis). */
async function assertHasNoChildren(id: string) {
  const children = await prisma.category.count({ where: { parentId: id } });

  if (children > 0) {
    throw new InvalidOperationError(
      "Esta categoria já tem subcategorias e por isso não pode virar subcategoria",
    );
  }
}

export async function createCategory(userId: string, input: CategoryInput): Promise<Category> {
  if (input.parentId) {
    await assertValidParent(userId, input.parentId);
  }

  return prisma.category.create({
    data: {
      userId,
      name: input.name,
      color: input.color ?? null,
      icon: input.icon ?? null,
      parentId: input.parentId,
    },
  });
}

export async function updateCategory(
  userId: string,
  id: string,
  input: CategoryInput,
): Promise<Category> {
  const existing = await prisma.category.findFirst({
    where: { id, userId },
    select: { parentId: true },
  });

  if (!existing) {
    throw new NotFoundError("Categoria não encontrada");
  }

  if (input.parentId) {
    await assertValidParent(userId, input.parentId, id);
    await assertHasNoChildren(id);
  }

  return prisma.category.update({
    where: { id },
    data: {
      name: input.name,
      color: input.color ?? null,
      icon: input.icon ?? null,
      parentId: input.parentId,
    },
  });
}

/** Ids da categoria e das suas subcategorias — a hierarquia é de dois níveis. */
async function categoryFamily(userId: string, id: string): Promise<string[]> {
  const children = await prisma.category.findMany({
    where: { userId, parentId: id },
    select: { id: true },
  });

  return [id, ...children.map((child) => child.id)];
}

/**
 * Motivo pelo qual a categoria não pode ser removida, ou `null`. Fonte única,
 * como `accountDeletionBlocker`.
 *
 * `categoryId` é obrigatório em `RecurringExpense` e em `Debt`, sem `onDelete`:
 * sem a guarda a recusa vem do banco por FK, em inglês.
 */
export async function categoryDeletionBlocker(
  userId: string,
  id: string,
): Promise<string | null> {
  const affectedIds = await categoryFamily(userId, id);

  const [recurring, debts] = await Promise.all([
    prisma.recurringExpense.count({ where: { userId, categoryId: { in: affectedIds } } }),
    prisma.debt.count({ where: { userId, categoryId: { in: affectedIds } } }),
  ]);

  const blockers: string[] = [];

  if (recurring > 0) {
    blockers.push(`${recurring} gasto(s) recorrente(s)`);
  }

  if (debts > 0) {
    blockers.push(`${debts} dívida(s)`);
  }

  return blockers.length > 0
    ? `Esta categoria é obrigatória para ${blockers.join(" e ")}. Reaponte-os antes de remover.`
    : null;
}

/**
 * Remove a categoria e, em cascata, suas subcategorias. As transações que a
 * usavam ficam com `categoryId` nulo (`onDelete: SetNull`); recorrentes e
 * dívidas recusam a remoção, por {@link categoryDeletionBlocker}.
 */
export async function deleteCategory(userId: string, id: string): Promise<void> {
  const category = await prisma.category.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!category) {
    throw new NotFoundError("Categoria não encontrada");
  }

  const blocker = await categoryDeletionBlocker(userId, id);

  if (blocker) {
    throw new InvalidOperationError(blocker);
  }

  await prisma.category.delete({ where: { id } });
}

export interface CategoryNode {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  subcategories: Array<{ id: string; name: string; color: string | null; icon: string | null }>;
}

/** Categorias em árvore de 2 níveis, ordenadas por nome. */
export async function listCategoryTree(userId: string): Promise<CategoryNode[]> {
  // Ordenado na aplicação, não em `ORDER BY`: ver `@/lib/sorting`.
  const categories = (await prisma.category.findMany({ where: { userId } })).sort(byName);

  const roots = categories.filter((category) => category.parentId === null);

  return roots.map((root) => ({
    id: root.id,
    name: root.name,
    color: root.color,
    icon: root.icon,
    subcategories: categories
      .filter((category) => category.parentId === root.id)
      .map((child) => ({
        id: child.id,
        name: child.name,
        color: child.color,
        icon: child.icon,
      })),
  }));
}

/**
 * Categorias em lista plana para `Select`, com a subcategoria rotulada como
 * "Pai > Filho" para ficar inequívoca quando dois pais têm filhos homônimos.
 *
 * `cache()` por requisição: o painel lê esta lista por três caminhos distintos
 * numa única renderização.
 */
export const listCategoryOptions = cache(async function listCategoryOptions(
  userId: string,
): Promise<Array<{ value: string; label: string }>> {
  const tree = await listCategoryTree(userId);

  return tree.flatMap((root) => [
    { value: root.id, label: root.name },
    ...root.subcategories.map((child) => ({
      value: child.id,
      label: `${root.name} > ${child.name}`,
    })),
  ]);
});
