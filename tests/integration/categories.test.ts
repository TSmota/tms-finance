import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import {
  createCategory,
  deleteCategory,
  listCategoryOptions,
  listCategoryTree,
  updateCategory,
} from "@/lib/categories";
import { createTransaction } from "@/lib/transactions";
import { createRecurringExpense } from "@/lib/recurring";
import { createDebt } from "@/lib/debts";
import { makeAccount, makeCategory, makePerson, makeUser } from "@tests/support/factories";
import { categoryInput } from "@tests/support/inputs";

describe("hierarquia de dois níveis", () => {
  it("cria categoria raiz e subcategoria", async () => {
    const user = await makeUser();

    const root = await createCategory(user.id, categoryInput({ name: "Moradia" }));
    const child = await createCategory(
      user.id,
      categoryInput({ name: "Luz", parentId: root.id }),
    );

    expect(root.parentId).toBeNull();
    expect(child.parentId).toBe(root.id);
  });

  it("recusa subcategoria de subcategoria", async () => {
    const user = await makeUser();
    const root = await createCategory(user.id, categoryInput({ name: "Moradia" }));
    const child = await createCategory(
      user.id,
      categoryInput({ name: "Luz", parentId: root.id }),
    );

    await expect(
      createCategory(user.id, categoryInput({ name: "Neto", parentId: child.id })),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("recusa pai de outro usuário", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const foreignRoot = await makeCategory(other.id);

    await expect(
      createCategory(user.id, categoryInput({ parentId: foreignRoot.id })),
    ).rejects.toThrow(NotFoundError);
  });

  it("recusa pai inexistente", async () => {
    const user = await makeUser();

    await expect(
      createCategory(
        user.id,
        categoryInput({ parentId: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("recusa a categoria como pai de si mesma", async () => {
    const user = await makeUser();
    const root = await createCategory(user.id, categoryInput({ name: "Moradia" }));

    await expect(
      updateCategory(user.id, root.id, categoryInput({ name: "Moradia", parentId: root.id })),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("recusa transformar em subcategoria uma categoria que já tem filhos", async () => {
    const user = await makeUser();
    const first = await createCategory(user.id, categoryInput({ name: "Alimentação" }));
    await createCategory(user.id, categoryInput({ name: "Mercado", parentId: first.id }));
    const second = await createCategory(user.id, categoryInput({ name: "Lazer" }));

    // Mover "Alimentação" para dentro de "Lazer" criaria 3 níveis.
    await expect(
      updateCategory(
        user.id,
        first.id,
        categoryInput({ name: "Alimentação", parentId: second.id }),
      ),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("permite promover subcategoria a raiz", async () => {
    const user = await makeUser();
    const root = await createCategory(user.id, categoryInput({ name: "Moradia" }));
    const child = await createCategory(
      user.id,
      categoryInput({ name: "Luz", parentId: root.id }),
    );

    const updated = await updateCategory(
      user.id,
      child.id,
      categoryInput({ name: "Luz", parentId: null }),
    );

    expect(updated.parentId).toBeNull();
  });
});

describe("exclusão", () => {
  it("apaga as subcategorias em cascata", async () => {
    const user = await makeUser();
    const root = await createCategory(user.id, categoryInput({ name: "Moradia" }));
    await createCategory(user.id, categoryInput({ name: "Luz", parentId: root.id }));
    await createCategory(user.id, categoryInput({ name: "Água", parentId: root.id }));

    await deleteCategory(user.id, root.id);

    await expect(prisma.category.count()).resolves.toBe(0);
  });

  it("preserva a transação, deixando-a sem categoria", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await createCategory(user.id, categoryInput({ name: "Mercado" }));

    const transaction = await createTransaction(user.id, {
      accountId: account.id,
      categoryId: category.id,
      type: "EXPENSE",
      amount: 100,
      currency: "BRL",
      date: "2026-08-10",
      description: "Compra",
      manualFxRate: null,
    });

    await deleteCategory(user.id, category.id);

    const after = await prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } });

    // Apagar a categoria não pode apagar o dinheiro que saiu da conta.
    expect(after.categoryId).toBeNull();
    expect(after.convertedAmount.toFixed(2)).toBe("100.00");

    const stored = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { currentBalance: true },
    });
    expect(stored.currentBalance.toFixed(2)).toBe("900.00");
  });

  it("recusa categoria de outro usuário", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const category = await makeCategory(owner.id);

    await expect(deleteCategory(intruder.id, category.id)).rejects.toThrow(NotFoundError);
    await expect(prisma.category.count()).resolves.toBe(1);
  });

  // Sem guarda de domínio a recusa viria do banco por FK, em inglês.
  it("recusa com mensagem de domínio quando um recorrente depende dela", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const category = await createCategory(user.id, categoryInput({ name: "Moradia" }));

    await createRecurringExpense(user.id, {
      description: "Aluguel",
      amount: 1200,
      currency: "BRL",
      frequency: "MONTHLY",
      dueDay: 5,
      isEstimated: false,
      startDate: "2026-08-01",
      endDate: null,
      categoryId: category.id,
      accountId: account.id,
      creditCardId: null,
    });

    await expect(deleteCategory(user.id, category.id)).rejects.toThrow(InvalidOperationError);
    await expect(prisma.category.count()).resolves.toBe(1);
  });

  it("recusa também quando a dependência está numa subcategoria", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id);
    const person = await makePerson(user.id);
    const root = await createCategory(user.id, categoryInput({ name: "Moradia" }));
    const child = await createCategory(
      user.id,
      categoryInput({ name: "Luz", parentId: root.id }),
    );

    await createDebt(user.id, {
      personId: person.id,
      categoryId: child.id,
      accountId: account.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 200,
      currency: "BRL",
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    // A raiz levaria a subcategoria junto, então o bloqueio dela vale para a raiz.
    await expect(deleteCategory(user.id, root.id)).rejects.toThrow(InvalidOperationError);
    await expect(prisma.category.count()).resolves.toBe(2);
  });
});

describe("leitura em árvore", () => {
  it("agrupa subcategorias sob a raiz, tudo em ordem alfabética", async () => {
    const user = await makeUser();
    const moradia = await createCategory(user.id, categoryInput({ name: "Moradia" }));
    await createCategory(user.id, categoryInput({ name: "Luz", parentId: moradia.id }));
    await createCategory(user.id, categoryInput({ name: "Água", parentId: moradia.id }));
    await createCategory(user.id, categoryInput({ name: "Alimentação" }));

    const tree = await listCategoryTree(user.id);

    expect(tree.map((node) => node.name)).toEqual(["Alimentação", "Moradia"]);
    // Ordem alfabética pt-BR: "Água" antes de "Luz". Com o ORDER BY do
    // Postgres em collation C.UTF-8 sairia invertido — ver `@/lib/sorting`.
    expect(tree[1]?.subcategories.map((child) => child.name)).toEqual(["Água", "Luz"]);
  });

  it("não mistura categorias de outros usuários", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await createCategory(user.id, categoryInput({ name: "Minha" }));
    await makeCategory(other.id, { name: "De outro" });

    const tree = await listCategoryTree(user.id);

    expect(tree.map((node) => node.name)).toEqual(["Minha"]);
  });

  it("rotula subcategoria como 'Pai > Filho' nas opções de Select", async () => {
    const user = await makeUser();
    const moradia = await createCategory(user.id, categoryInput({ name: "Moradia" }));
    await createCategory(user.id, categoryInput({ name: "Luz", parentId: moradia.id }));

    const options = await listCategoryOptions(user.id);

    expect(options.map((option) => option.label)).toEqual(["Moradia", "Moradia > Luz"]);
  });

  it("desambigua subcategorias homônimas de pais diferentes", async () => {
    const user = await makeUser();
    const casa = await createCategory(user.id, categoryInput({ name: "Casa" }));
    const trabalho = await createCategory(user.id, categoryInput({ name: "Trabalho" }));
    await createCategory(user.id, categoryInput({ name: "Internet", parentId: casa.id }));
    await createCategory(user.id, categoryInput({ name: "Internet", parentId: trabalho.id }));

    const options = await listCategoryOptions(user.id);

    expect(options.map((option) => option.label)).toEqual([
      "Casa",
      "Casa > Internet",
      "Trabalho",
      "Trabalho > Internet",
    ]);
  });
});
