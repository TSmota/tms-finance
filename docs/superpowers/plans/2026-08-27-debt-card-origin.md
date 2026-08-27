# Cartão como origem de empréstimo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir que a movimentação que origina uma dívida `LENT` seja uma compra no cartão de crédito — à vista ou parcelada em N faturas — e que a origem de uma dívida já registrada seja editada entre conta e cartão nos dois sentidos.

**Architecture:** a origem não ganha coluna nenhuma: ela já mora na `Transaction` vinculada por `debtId`, que tem o XOR `account_id`/`credit_card_id`. O grupo de origem passa a ser **derivado do tipo** (`type === originType(debt.type)`, porque origem e amortização têm sempre tipos opostos), e um módulo novo — `src/lib/debtOrigin.ts` — vira o dono do ciclo de vida desse grupo. `updateDebt` sempre apaga e recria a origem, o que faz um caminho único cobrir as quatro transições conta→conta, conta→cartão, cartão→conta e cartão→cartão.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 7 + PostgreSQL (schema `finance`), Zod 4, Mantine 9, Vitest (projects `unit` e `integration`), `Prisma.Decimal` para dinheiro.

**Spec:** [docs/superpowers/specs/2026-08-27-debt-card-origin-design.md](../specs/2026-08-27-debt-card-origin-design.md)

## Global Constraints

Valem em **toda** tarefa. Vêm de [AGENTS.md](../../../AGENTS.md) e [ARCHITECTURE.md](../../../ARCHITECTURE.md).

- **Nunca `number` do JS em operação monetária.** No servidor, `Prisma.Decimal` via `@/lib/money`; no cliente, centavos inteiros via `@/lib/installmentSplit`.
- **Parcelamento:** chamar `splitInstallments` de `@/lib/installments` no servidor e `splitCents`/`describeSplit` de `@/lib/installmentSplit` só na prévia do cliente. **Nunca** reimplementar o arredondamento.
- **Atomicidade:** toda operação multi-passo dentro de `prisma.$transaction`.
- **Rede fora da transação:** `getExchangeRate` nunca é chamada com a `$transaction` aberta (ARCHITECTURE §4).
- **Ordem de lock em `debts.ts`:** dívida primeiro (`lockDebt`), movimentação depois (`lockTransaction`). Nunca inverter.
- **Faturas travadas em ordem crescente de competência** — é o que `recalcInvoiceTotals` já garante; usar sempre ela, nunca `recalcInvoiceTotal` num laço próprio.
- **Comentários e UI em pt-BR; identificadores e mensagens de commit em inglês.**
- **Comentário explica o *porquê*, enxuto.** O porquê longo mora no `ARCHITECTURE.md`, não em docblock.
- **Commits:** Conventional Commits, **só o assunto** — sem corpo e sem trailer `Co-Authored-By`.
- **Portão canônico**, verde ao fim de cada tarefa, com `npm run dev` parado:
  ```bash
  npm run typecheck && npm run lint && npm test && npm run build
  ```
- **Validação é fonte única:** todo campo novo entra em `src/lib/validations.ts`, e no mesmo commit muda a API do agente (`src/mcp/serializers.ts`).
- **Camadas:** `src/lib/<domínio>.ts` = serviço com `userId` explícito; `src/actions/<domínio>.ts` = auth → zod → serviço → revalidate, **sem `if` de regra de negócio**; `page.tsx` só lê.

**Fora do escopo, não implementar:** `BORROWED` com origem em cartão, e amortização lançada no cartão. Os dois pela mesma razão: `recalcInvoiceTotal` soma `convertedAmount` **sem sinal**, então um `INCOME` no cartão aumentaria a fatura em vez de reduzi-la.

---

## Estrutura de arquivos

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `prisma/migrations/20260827HHMMSS_debt_card_origin/migration.sql` | A `CHECK` que barra `INCOME` de dívida no cartão |
| `src/lib/debtOrigin.ts` | Ciclo de vida do grupo de origem: carregar, recusar, criar, apagar |
| `src/lib/debtOrigin.test.ts` | Unitários da resolução de destino |
| `src/lib/paymentTarget.ts` | Renomeado de `recurringTarget.ts` — codificação conta/cartão num `Select` |
| `src/lib/paymentTarget.test.ts` | Renomeado de `recurringTarget.test.ts` |
| `src/lib/managedBy.ts` | Rótulo e tooltip de "pertence a outro serviço", compartilhado por duas telas |
| `src/components/forms/invoiceHint.ts` | `describeTargetInvoices`, movida de `CardPurchaseFields.tsx` para ser usada também pelo formulário de dívida |

**Modificados:**

| Arquivo | O que muda |
|---|---|
| `src/lib/validations.ts` | `debtSchema` ganha `creditCardId`, `installments` e três `.refine` |
| `src/lib/debts.ts` | Delega a origem ao `debtOrigin.ts`; `updateDebt` cobre as 4 transições; `deleteDebt` ganha portão de fatura paga; leituras ganham `originTarget` |
| `src/lib/cardPurchases.ts` | `updateCardPurchase`/`deleteCardPurchase` recusam linha com `debtId` |
| `src/lib/invoices.ts` | `InvoiceItem` ganha `debtId` |
| `src/lib/revalidation.ts` | Domínio `debts` ganha `CARDS` e `CARD_DETAIL` |
| `src/lib/deletionImpact.ts` | `creditCardImpact` e `accountImpact` relatam dívidas que perdem a origem |
| `src/lib/creditCards.ts` | `listCreditCardOptions` devolve `CardOption[]` |
| `src/mcp/serializers.ts` | `debtDto` ganha `origin`; movimentos ganham parcela |
| `src/mcp/tools/write.ts` | Descrições de `create_debt` e `update_debt` |
| `src/components/forms/DebtFields.tsx` | `Select` "Pago com", campo de parcelas, `validateDebt` |
| `src/components/forms/AddDebtButton.tsx`, `EditDebtButton.tsx` | Valores iniciais e `validate` novos |
| `src/components/TransactionsTable.tsx` | Importa `MANAGED_BY_LABEL` do módulo novo |
| `src/app/dashboard/debts/page.tsx`, `debts/[id]/page.tsx` | Carregam cartões; `toFormValues` novo |
| `src/app/dashboard/cards/[id]/page.tsx` | Badge "Dívida" no lugar de editar/apagar |
| `docs/business-rules.md` | RN-05.5 |
| `ARCHITECTURE.md` | Subseção sobre o grupo de origem derivado |
| `tests/integration/schema.test.ts` | Lista de `CHECK` + teste da constraint nova |
| `tests/integration/debts.test.ts` | Cenários de cartão e as 4 transições |
| `tests/integration/cardPurchases.test.ts` | Recusa de origem de dívida |
| `tests/integration/deletionImpact.test.ts` | Entradas novas |
| `src/mcp/serializers.test.ts` | Fixture e snapshots |

---

## Task 1: A `CHECK` que barra `INCOME` de dívida no cartão

**Files:**
- Create: `prisma/migrations/<timestamp>_debt_card_origin/migration.sql`
- Modify: `tests/integration/schema.test.ts:37-75` (a lista literal de constraints)
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: a constraint `transactions_debt_card_expense_check`, na qual as Tasks 6 e 7 confiam como último backstop.

**Contexto que você precisa:** o Prisma Schema não representa `CHECK`, então elas são escritas à mão e ficam sob controle da migration — leia [.github/skills/prisma-migration](../../../.github/skills/prisma-migration). `recalcInvoiceTotal` (`src/lib/invoices.ts:124`) soma `convertedAmount` de tudo que não é `INVOICE_PAYMENT`, **sem olhar o sinal**: um `INCOME` numa fatura aumentaria o total em vez de reduzi-lo. Esta constraint é essa invariante de sinal, nada mais — ela não expressa "cartão só origina `LENT`", porque o tipo da dívida não está na linha da transação.

- [ ] **Step 1: Acrescentar a constraint à lista afirmada pelo teste**

Em `tests/integration/schema.test.ts`, no array do teste "mantém as CHECK constraints escritas à mão nas migrations", inserir em ordem alfabética entre `"transactions_positive_amounts_check"` e o fim:

A lista é comparada depois de `sort()`, que é lexicográfico: `debt` < `exchange` < `installments` < `payment` < `positive`. A entrada nova vai **antes** de `"transactions_exchange_rate_check"`:

```ts
      "recurring_expenses_period_check",
      "transactions_debt_card_expense_check",
      "transactions_exchange_rate_check",
      "transactions_installments_check",
```

- [ ] **Step 2: Escrever o teste da constraint**

Em `tests/integration/schema.test.ts`, dentro do `describe("invariantes protegidos pelo banco")`, depois do teste "recusa transação com conta E cartão ao mesmo tempo":

```ts
  it("recusa entrada de dívida lançada no cartão", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id);
    const person = await makePerson(user.id);
    const category = await makeCategory(user.id);

    const debt = await prisma.debt.create({
      data: {
        userId: user.id,
        personId: person.id,
        categoryId: category.id,
        type: "BORROWED",
        description: "Empréstimo recebido",
        originalAmount: "100.00",
        remainingAmount: "100.00",
        currency: "BRL",
      },
    });

    // O total da fatura é somado sem sinal: um INCOME aqui inflaria a fatura.
    await expect(
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "INCOME",
          description: "Origem de BORROWED no cartão",
          date: new Date("2026-08-10T00:00:00Z"),
          amount: "100.00",
          currency: "BRL",
          exchangeRate: "1.0000",
          convertedAmount: "100.00",
          creditCardId: card.id,
          debtId: debt.id,
        },
      }),
    ).rejects.toThrow(/transactions_debt_card_expense_check/);
  });
```

Confira o bloco de imports do arquivo: se `makeCreditCard`, `makePerson` ou `makeCategory` não estiverem importados de `"../factories"`, acrescente.

- [ ] **Step 3: Rodar e ver falhar**

```bash
npm run test:integration -- schema
```

Esperado: FAIL nos dois testes — a lista literal não bate com o banco (constraint ainda não existe) e o `INSERT` de `INCOME` no cartão passa em vez de ser recusado.

- [ ] **Step 4: Escrever a migration**

Descubra o timestamp no formato das existentes (`AAAAMMDDHHMMSS`) e crie o diretório:

```bash
ls prisma/migrations
mkdir -p prisma/migrations/20260827120000_debt_card_origin
```

`prisma/migrations/20260827120000_debt_card_origin/migration.sql`:

```sql
-- Escrita à mão: o Prisma Schema não expressa CHECK.

-- Movimentação de dívida no cartão só existe como saída (RN-05.5).
--
-- `recalcInvoiceTotal` soma os lançamentos da fatura sem olhar o sinal, então um
-- INCOME no cartão aumentaria a fatura em vez de reduzi-la. É o que barra a
-- origem de um BORROWED, que é INCOME, no cartão.
ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_debt_card_expense_check"
  CHECK (
    "debt_id" IS NULL
    OR "credit_card_id" IS NULL
    OR "type" = 'EXPENSE'::"finance"."TransactionType"
  );
```

Nenhuma mudança em `prisma/schema.prisma`: a migration não altera coluna nenhuma.

- [ ] **Step 5: Aplicar e rodar os testes**

```bash
npx prisma migrate dev
npm run test:integration -- schema
```

Esperado: PASS. `ADD CONSTRAINT` valida as linhas existentes — se falhar, há dado violando a premissa e isso precisa ser investigado antes de seguir, não contornado.

- [ ] **Step 6: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add prisma/migrations tests/integration/schema.test.ts
git commit -m "feat(debts): forbid debt income on credit card at the database level"
```

---

## Task 2: RN-05.5 e a decisão registrada no ARCHITECTURE

**Files:**
- Modify: `docs/business-rules.md` (fim da seção RN-05)
- Modify: `ARCHITECTURE.md` (§6, Modelo de dados e migrations)

**Interfaces:**
- Consumes: a constraint da Task 1 (citada como `(RN-05.5)` no SQL).
- Produces: a referência `RN-05.5`, citada por comentários e mensagens de erro das tarefas seguintes.

**Contexto:** `docs/business-rules.md` é fonte de verdade do domínio; migration cita a regra por código (`(RN-05.5)`) porque migration é append-only e a citação não pode divergir do código ao lado. Código TypeScript **não** cita regra.

- [ ] **Step 1: Acrescentar RN-05.5**

Em `docs/business-rules.md`, ao fim da seção `## RN-05`, depois de RN-05.4:

```markdown
- **RN-05.5 (Origem em conta ou cartão):** a movimentação que origina a dívida
  sai de uma conta bancária **ou** entra numa fatura de cartão — exatamente uma
  das duas. No cartão ela é uma compra como qualquer outra: cai na fatura da sua
  competência (RN-03.2), pode ser dividida em parcelas sequenciais (RN-03.3) e
  não altera saldo de conta nenhum até a fatura ser paga. Só a dívida do tipo
  `LENT` aceita origem em cartão — a origem de `BORROWED` é uma entrada, e o
  total da fatura não tem sinal. Enquanto qualquer parcela da origem estiver em
  fatura paga, a dívida não é editada nem removida (RN-03.5). A **amortização** é
  sempre em conta, nos dois tipos.
```

- [ ] **Step 2: Registrar a decisão do grupo derivado**

Em `ARCHITECTURE.md`, ao fim da §6, uma subseção nova:

```markdown
### O grupo de origem de uma dívida é derivado, não marcado

A movimentação que origina uma dívida pode ser mais de uma linha: no cartão ela
é uma compra parcelada, com uma parcela por fatura (RN-05.5). Identificar esse
grupo não precisou de coluna: `originType` e `settlementType` são **sempre
opostos**, então o grupo de origem é toda transação daquela dívida cujo `type` é
`originType(debt.type)`, e as amortizações são o resto.

Uma coluna `is_origin` gravaria o que o tipo já diz, na tabela mais escrita do
sistema, e criaria a chance de divergir dele. O que a heurística antiga fazia —
"a **primeira** movimentação do tipo da origem" — só valia com origem de uma
linha, e passou a estar errada.

A consequência prática está em `updateDebt`: ele apaga o grupo inteiro e recria,
como `updateCardPurchase` faz com uma compra. Casar linha por linha não serviria,
porque trocar o número de parcelas, a data ou o cartão redistribui as parcelas
por outras faturas.
```

- [ ] **Step 3: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add docs/business-rules.md ARCHITECTURE.md
git commit -m "docs(debts): document card origin rule and derived origin group"
```

---

## Task 3: `recurringTarget.ts` → `paymentTarget.ts`

**Files:**
- Create: `src/lib/paymentTarget.ts` (conteúdo movido)
- Create: `src/lib/paymentTarget.test.ts` (conteúdo movido)
- Delete: `src/lib/recurringTarget.ts`, `src/lib/recurringTarget.test.ts`
- Modify: `src/app/dashboard/recurring/page.tsx`, `src/components/forms/RecurringFields.tsx`, `src/components/forms/AddRecurringButton.tsx`, `src/components/forms/EditRecurringButton.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `TARGET_ACCOUNT_PREFIX`, `TARGET_CARD_PREFIX`, `splitTarget(target: string): { accountId: string | null; creditCardId: string | null }`, `joinTarget(accountId: string | null, creditCardId: string | null): string` — de `@/lib/paymentTarget`. A Task 13 depende deles.

**Contexto:** o módulo codifica o XOR conta/cartão num único valor de `Select`, e vive em `src/lib/` **sem `"use client"`** de propósito: o formulário é client, mas a página que monta os valores iniciais é Server Component, e num módulo client a chamada do servidor levantaria em runtime um erro invisível ao build, ao typecheck e aos testes. Esse comentário de topo precisa sobreviver ao renomeio. Renomeio puro: nenhuma assinatura muda.

- [ ] **Step 1: Mover os dois arquivos preservando o histórico**

```bash
git mv src/lib/recurringTarget.ts src/lib/paymentTarget.ts
git mv src/lib/recurringTarget.test.ts src/lib/paymentTarget.test.ts
```

- [ ] **Step 2: Ajustar o comentário de topo**

Em `src/lib/paymentTarget.ts`, a primeira linha do docblock diz "Codificação do destino de uma recorrência num único valor de `Select`." Trocar por:

```ts
/**
 * Codificação do destino de pagamento num único valor de `Select`.
 *
 * Usado por gastos recorrentes e pela origem de uma dívida. O destino é um XOR:
 * conta bancária **ou** cartão. Dois campos separados convidariam a preencher os
 * dois e só descobrir o erro na submissão.
 *
```

O resto do docblock — o parágrafo sobre não ser `"use client"` — fica como está.

- [ ] **Step 3: Atualizar os importadores**

Quatro arquivos importam de `@/lib/recurringTarget`. Trocar o caminho para `@/lib/paymentTarget` em:

```bash
grep -rln "recurringTarget" src/
```

Esperado: `src/app/dashboard/recurring/page.tsx`, `src/components/forms/RecurringFields.tsx`, `src/components/forms/AddRecurringButton.tsx`, `src/components/forms/EditRecurringButton.tsx`. Em `src/lib/paymentTarget.test.ts` o import é relativo (`./recurringTarget`) — trocar para `./paymentTarget`.

- [ ] **Step 4: Confirmar que não sobrou referência**

```bash
grep -rn "recurringTarget" src/ tests/
```

Esperado: nenhuma saída.

- [ ] **Step 5: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add -A src/
git commit -m "refactor: rename recurringTarget to paymentTarget"
```

---

## Task 4: `debtSchema` com destino XOR e parcelas

**Files:**
- Modify: `src/lib/validations.ts:321-339` (`debtSchema`)
- Test: `src/lib/validations.test.ts` (se não existir, criar)

**Interfaces:**
- Consumes: nada.
- Produces: `DebtInput` com a forma nova —
  ```ts
  {
    personId: string; categoryId: string; type: "LENT" | "BORROWED";
    description: string; amount: number; currency: Currency;
    accountId: string | null; creditCardId: string | null; installments: number;
    date: string; dueDate: string | null; manualFxRate?: number | null;
  }
  ```
  Todas as tarefas seguintes consomem esse tipo.

**Contexto:** `src/lib/validations.ts` é fonte única do formulário e do MCP — o agente não consegue gravar nada que a UI recusaria. `MAX_INSTALLMENTS` (120) vem de `@/lib/limits`, já importado no arquivo. `optionalIdSchema` (linha 45) é o helper para id que pode ser nulo. O `.refine` com `path` faz o Mantine apontar o campo certo, e o banco tem `CHECK` equivalente — validar aqui devolve mensagem em vez de erro de constraint.

- [ ] **Step 1: Escrever os testes que falham**

Verifique se `src/lib/validations.test.ts` existe (`ls src/lib/validations.test.ts`). Se não, crie com este cabeçalho; se sim, acrescente o `describe`:

```ts
import { describe, expect, it } from "vitest";

import { debtSchema } from "./validations";

/**
 * O `debtSchema` é a fronteira que o formulário e o MCP compartilham. O que
 * estes testes protegem são os três `refine`: o XOR de destino, a restrição do
 * cartão a `LENT` e o parcelamento só no cartão.
 */

const base = {
  personId: "00000000-0000-4000-8000-000000000001",
  categoryId: "00000000-0000-4000-8000-000000000002",
  type: "LENT",
  description: "Passagens do grupo",
  amount: 300,
  currency: "BRL",
  date: "2026-08-06",
  dueDate: null,
  manualFxRate: null,
};

const accountId = "00000000-0000-4000-8000-000000000003";
const creditCardId = "00000000-0000-4000-8000-000000000004";

describe("debtSchema: destino da origem", () => {
  it("aceita origem em conta", () => {
    const result = debtSchema.safeParse({ ...base, accountId, creditCardId: null });

    expect(result.success).toBe(true);
    expect(result.data?.installments).toBe(1);
  });

  it("aceita origem em cartão parcelada", () => {
    const result = debtSchema.safeParse({
      ...base,
      accountId: null,
      creditCardId,
      installments: 6,
    });

    expect(result.success).toBe(true);
    expect(result.data?.installments).toBe(6);
  });

  it("recusa os dois destinos ao mesmo tempo", () => {
    const result = debtSchema.safeParse({ ...base, accountId, creditCardId });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  });

  it("recusa nenhum destino", () => {
    const result = debtSchema.safeParse({ ...base, accountId: null, creditCardId: null });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["accountId"]);
  });

  it("recusa cartão em dívida BORROWED", () => {
    const result = debtSchema.safeParse({
      ...base,
      type: "BORROWED",
      accountId: null,
      creditCardId,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Só empréstimo feito pelo usuário pode ter origem no cartão",
    );
  });

  it("recusa parcelamento em origem de conta", () => {
    const result = debtSchema.safeParse({
      ...base,
      accountId,
      creditCardId: null,
      installments: 3,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["installments"]);
  });

  it("recusa mais parcelas do que o limite", () => {
    const result = debtSchema.safeParse({
      ...base,
      accountId: null,
      creditCardId,
      installments: 121,
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:unit -- validations
```

Esperado: FAIL — o schema atual exige `accountId` e não conhece `creditCardId` nem `installments`.

- [ ] **Step 3: Reescrever o `debtSchema`**

Em `src/lib/validations.ts`, substituir o `debtSchema` inteiro:

```ts
export const debtSchema = z
  .object({
    personId: idSchema,
    /** Motivo/origem: obrigatória, diferente das transações comuns. */
    categoryId: idSchema,
    type: z.enum(DEBT_TYPE_CODES, { message: "Tipo de dívida inválido" }),
    description: requiredText(TEXT_LIMITS.description, "Descrição é obrigatória"),
    amount: positiveAmountSchema,
    currency: currencySchema,
    /** Origem do dinheiro: conta pela qual ele passou, ou cartão em que foi lançado. */
    accountId: optionalIdSchema,
    creditCardId: optionalIdSchema,
    /** Só no cartão: divide a origem em parcelas sequenciais. */
    installments: z.coerce
      .number()
      .int("O número de parcelas deve ser inteiro")
      .min(1, "Mínimo de 1 parcela")
      .max(MAX_INSTALLMENTS, `Máximo de ${MAX_INSTALLMENTS} parcelas`)
      .default(1),
    date: calendarDateSchema,
    dueDate: optionalCalendarDateSchema,
    manualFxRate: z.coerce
      .number()
      .positive("A taxa de câmbio deve ser positiva")
      .optional()
      .nullable(),
  })
  // O banco tem CHECK equivalente; validar aqui devolve mensagem em vez de erro
  // de constraint, e o formulário aponta o campo certo.
  .refine((value) => (value.accountId === null) !== (value.creditCardId === null), {
    message: "Escolha a origem: conta bancária ou cartão de crédito",
    path: ["accountId"],
  })
  // A origem de BORROWED é uma entrada, e o total da fatura não tem sinal.
  .refine((value) => value.creditCardId === null || value.type === "LENT", {
    message: "Só empréstimo feito pelo usuário pode ter origem no cartão",
    path: ["creditCardId"],
  })
  .refine((value) => value.installments === 1 || value.creditCardId !== null, {
    message: "Parcelamento só existe na origem em cartão",
    path: ["installments"],
  });
```

Confirme que `MAX_INSTALLMENTS` já está importado no topo do arquivo (o `cardPurchaseSchema` usa). Se não, importe de `@/lib/limits`.

- [ ] **Step 4: Rodar os testes unitários**

```bash
npm run test:unit -- validations
```

Esperado: PASS, 7 testes.

- [ ] **Step 5: Adaptar o que quebrou por tipo**

`debtSchema` deixou de ser `ZodObject` e `DebtInput` mudou de forma. Rode:

```bash
npm run typecheck
```

Espere erros em `src/lib/debts.ts` (usa `input.accountId` como `string`) e em `tests/integration/debts.test.ts` (a fábrica `debtInput` exige `accountId`). **Não conserte `debts.ts` agora** — é a Task 5. Conserte só a fábrica do teste, para a suíte continuar legível:

Em `tests/integration/debts.test.ts`, trocar a assinatura de `debtInput`:

```ts
function debtInput(
  overrides: Partial<DebtInput> & { personId: string; categoryId: string },
): DebtInput {
  return {
    type: "LENT",
    description: "Empréstimo de teste",
    amount: 200,
    currency: "BRL",
    accountId: null,
    creditCardId: null,
    installments: 1,
    date: "2026-08-06",
    dueDate: null,
    manualFxRate: null,
    ...overrides,
  };
}
```

As chamadas existentes já passam `accountId: account.id` nos overrides, então continuam válidas.

Em `src/lib/debts.ts`, o mínimo para o typecheck passar: `requireAccount(userId, input.accountId)` recebe `string | null`. Ponha um `if (!input.accountId) throw new InvalidOperationError("Escolha a origem: conta bancária ou cartão de crédito");` antes, com o comentário `// Temporário: a origem em cartão chega na tarefa seguinte.` A Task 6 remove.

- [ ] **Step 6: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/validations.ts src/lib/validations.test.ts src/lib/debts.ts tests/integration/debts.test.ts
git commit -m "feat(debts): accept credit card and installments in debt schema"
```

---

## Task 5: `debtOrigin.ts` — extração sem mudar comportamento

**Files:**
- Create: `src/lib/debtOrigin.ts`
- Modify: `src/lib/debts.ts` (`createDebt`, `updateDebt`, `deleteDebt`)
- Test: `tests/integration/debts.test.ts` (os existentes, que devem seguir verdes sem edição)

**Interfaces:**
- Consumes: `DebtInput` (Task 4); `Tx`, `applyToBalance`, `balanceDelta`, `affectsBalance`, `lockTransaction` de `@/lib/accountBalance`; `originType` de `@/lib/debts`.
- Produces, de `@/lib/debtOrigin`:
  ```ts
  export type OriginTarget = { kind: "account"; id: string } | { kind: "card"; id: string };

  export interface LoadedOrigin {
    transactions: Array<{
      id: string;
      accountId: string | null;
      creditCardId: string | null;
      invoiceId: string | null;
      status: TransactionStatus;
      type: TransactionType;
      installmentNumber: number | null;
    }>;
    target: OriginTarget | null;
    date: Date | null;
    installments: number;
    /** Ids das faturas tocadas, para o recálculo depois de apagar. */
    invoiceIds: string[];
    /** Alguma parcela está em fatura paga: editar e remover são recusados. */
    locked: boolean;
  }

  export async function loadOrigin(userId: string, debt: { id: string; type: DebtTypeCode }): Promise<LoadedOrigin>;
  export function originTargetOf(row: { accountId: string | null; creditCardId: string | null } | undefined): OriginTarget | null;
  export function assertOriginEditable(origin: LoadedOrigin, action: "editar" | "remover"): void;
  export async function deleteOrigin(tx: Tx, origin: LoadedOrigin): Promise<void>;
  export async function createOrigin(tx: Tx, params: CreateOriginParams): Promise<Transaction[]>;

  export interface CreateOriginParams {
    userId: string;
    debtId: string;
    type: TransactionType;
    input: DebtInput;
    date: Date;
    /** Taxa já resolvida: `getExchangeRate` é rede e não roda com a transação aberta. */
    rate: Money;
    /** Status da origem anterior, preservado ao recriar. */
    status?: TransactionStatus;
  }
  ```
  As Tasks 6, 7, 8 e 9 consomem tudo isso. **A Task 6 acrescenta `card?: CreditCard | null` a `CreateOriginParams`** — nesta tarefa o módulo só sabe fazer origem em conta.

**Contexto e por que esta tarefa não muda comportamento:** `src/lib/debts.ts` tem ~600 linhas e é dono de duas invariantes densas — o par `remainingAmount`/`status` e a ordem de lock. A origem vai virar uma coisa de duas formas com quatro pontos de uso, então ganha módulo. **Nesta tarefa o módulo só sabe fazer origem em conta**, replicando exatamente o que `debts.ts` já faz; o cartão chega na Task 6. É por isso que os testes de integração existentes precisam passar **sem edição alguma** — é essa a prova de que a extração foi fiel.

- [ ] **Step 1: Rodar a suíte de dívidas e guardar o baseline**

```bash
npm run test:integration -- debts
```

Esperado: PASS. Anote a contagem de testes: é o número que precisa continuar igual ao fim da tarefa.

- [ ] **Step 2: Criar `src/lib/debtOrigin.ts`**

```ts
import type { Transaction, TransactionStatus, TransactionType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError } from "@/lib/errors";
import { FX_RATE_SCALE } from "@/lib/fxService";
import { convertMoney, toStorage, type Money } from "@/lib/money";
import {
  affectsBalance,
  applyToBalance,
  balanceDelta,
  type Tx,
} from "@/lib/accountBalance";
import { originType } from "@/lib/debts";
import type { DebtTypeCode } from "@/lib/debtTypes";
import type { DebtInput } from "@/lib/validations";

/**
 * A movimentação que origina uma dívida, do lado do dinheiro.
 *
 * Ela tem duas formas: um lançamento numa conta bancária, que move saldo na
 * hora, ou uma compra no cartão, que só acumula na fatura. E pode ser mais de
 * uma linha — no cartão, uma parcela por fatura.
 *
 * O grupo é **derivado do tipo**: `originType` e `settlementType` são sempre
 * opostos, então a origem é toda transação da dívida com o tipo da origem, e as
 * amortizações são o resto. O porquê está no ARCHITECTURE.md, §6.
 *
 * `debts.ts` continua dono das invariantes da dívida; este módulo é dono de onde
 * o dinheiro da origem mora.
 */

export type OriginTarget = { kind: "account"; id: string } | { kind: "card"; id: string };

export interface LoadedOrigin {
  transactions: Array<{
    id: string;
    accountId: string | null;
    creditCardId: string | null;
    invoiceId: string | null;
    status: TransactionStatus;
    type: TransactionType;
    installmentNumber: number | null;
  }>;
  target: OriginTarget | null;
  date: Date | null;
  installments: number;
  invoiceIds: string[];
  locked: boolean;
}

/**
 * O grupo de origem gravado, com o destino resolvido.
 *
 * Fora de `$transaction` de propósito: é a leitura que decide o caminho, e quem
 * escreve trava as linhas de novo depois.
 */
export async function loadOrigin(
  userId: string,
  debt: { id: string; type: DebtTypeCode },
): Promise<LoadedOrigin> {
  const rows = await prisma.transaction.findMany({
    where: { userId, debtId: debt.id, type: originType(debt.type) },
    orderBy: [{ installmentNumber: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      accountId: true,
      creditCardId: true,
      invoiceId: true,
      status: true,
      type: true,
      date: true,
      installmentNumber: true,
      invoice: { select: { status: true } },
    },
  });

  const first = rows[0];

  return {
    transactions: rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      creditCardId: row.creditCardId,
      invoiceId: row.invoiceId,
      status: row.status,
      type: row.type,
      installmentNumber: row.installmentNumber,
    })),
    target: originTargetOf(first),
    date: first?.date ?? null,
    installments: rows.length,
    invoiceIds: rows
      .map((row) => row.invoiceId)
      .filter((id): id is string => id !== null),
    locked: rows.some((row) => row.invoice?.status === "PAID"),
  };
}

/**
 * Destino de uma linha de origem. Exportada porque `debts.ts` monta o mesmo
 * campo nas leituras, e duas cópias divergiriam.
 */
export function originTargetOf(
  row: { accountId: string | null; creditCardId: string | null } | undefined,
): OriginTarget | null {
  if (!row) {
    return null;
  }

  if (row.accountId) {
    return { kind: "account", id: row.accountId };
  }

  return row.creditCardId ? { kind: "card", id: row.creditCardId } : null;
}

/**
 * Recusa mexer numa origem que está em fatura paga (RN-03.5).
 *
 * O dinheiro já saiu pelo total antigo daquela fatura: apagar ou alterar a
 * parcela deixaria `total_amount` menor que o valor pago, com a fatura ainda
 * `PAID`.
 */
export function assertOriginEditable(
  origin: LoadedOrigin,
  action: "editar" | "remover",
): void {
  if (origin.locked) {
    throw new InvalidOperationError(
      `A origem desta dívida está em uma fatura paga. Desfaça o pagamento antes de ${action}.`,
    );
  }
}

export interface CreateOriginParams {
  userId: string;
  debtId: string;
  type: TransactionType;
  input: DebtInput;
  date: Date;
  rate: Money;
  status?: TransactionStatus;
}

/**
 * Cria o grupo de origem no destino escolhido.
 *
 * `rate` chega resolvida: `getExchangeRate` é rede, e uma cotação lenta com a
 * `$transaction` aberta prenderia o lock da dívida e das faturas.
 */
export async function createOrigin(
  tx: Tx,
  params: CreateOriginParams,
): Promise<Transaction[]> {
  const { userId, debtId, type, input, date, rate, status } = params;

  if (!input.accountId) {
    throw new InvalidOperationError(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  }

  const created = await tx.transaction.create({
    data: {
      userId,
      type,
      status: status ?? "CONFIRMED",
      description: input.description,
      date,
      amount: toStorage(input.amount),
      currency: input.currency,
      exchangeRate: rate.toFixed(FX_RATE_SCALE),
      convertedAmount: toStorage(convertMoney(input.amount, rate)),
      accountId: input.accountId,
      categoryId: input.categoryId,
      debtId,
    },
  });

  if (affectsBalance(created)) {
    await applyToBalance(tx, input.accountId, balanceDelta(created.type, created.convertedAmount));
  }

  return [created];
}

/** Apaga o grupo de origem, desfazendo o efeito de cada linha. */
export async function deleteOrigin(tx: Tx, origin: LoadedOrigin): Promise<void> {
  for (const row of origin.transactions) {
    if (row.accountId && row.status === "CONFIRMED") {
      const locked = await tx.transaction.findUniqueOrThrow({
        where: { id: row.id },
        select: { type: true, convertedAmount: true },
      });

      await applyToBalance(
        tx,
        row.accountId,
        balanceDelta(locked.type, locked.convertedAmount).negated(),
      );
    }
  }

  await tx.transaction.deleteMany({
    where: { id: { in: origin.transactions.map((row) => row.id) } },
  });
}
```

**Nota sobre o `deleteOrigin` acima:** ele relê a linha em vez de usar `lockTransaction`. Isso é deliberadamente provisório e a Task 7 substitui pelo `lockTransaction` que `updateDebt` já usa, mantendo a ordem de lock do módulo. Deixe o comentário `// A Task 7 troca por lockTransaction, junto com a ordem de lock de updateDebt.` no corpo.

- [ ] **Step 3: Fazer `createDebt` delegar**

Em `src/lib/debts.ts`, dentro de `createDebt`, trocar o bloco que cria a transação de origem e aplica o saldo por:

```ts
    await createOrigin(tx, {
      userId,
      debtId: debt.id,
      type: originType(input.type),
      input,
      date,
      rate,
    });
```

Remova o `if (!input.accountId) throw ...` temporário da Task 4 — `createOrigin` faz essa recusa agora. Acrescente o import:

```ts
import { createOrigin, deleteOrigin, loadOrigin, assertOriginEditable } from "@/lib/debtOrigin";
```

Atenção ao ciclo de imports: `debtOrigin.ts` importa `originType` de `debts.ts`, e `debts.ts` importa de `debtOrigin.ts`. Em ESM isso funciona porque as duas são funções chamadas em runtime, não valores lidos no topo do módulo. Se o `lint` ou o build reclamar de ciclo, mova `originType`/`settlementType` para `src/lib/debtTypes.ts` — que não importa nada — e atualize os dois lados; é a saída limpa e cabe nesta tarefa.

- [ ] **Step 4: Fazer `updateDebt` e `deleteDebt` usarem `loadOrigin`**

Em `updateDebt`, trocar a busca manual da origem:

```ts
  const origin = await prisma.transaction.findFirst({
    where: { userId, debtId, type: originType(debt.type) },
    orderBy: { createdAt: "asc" },
  });
```

por:

```ts
  const origin = await loadOrigin(userId, debt);

  if (origin.transactions.length === 0) {
    throw new NotFoundError("Movimentação de origem não encontrada");
  }
```

e ajustar os usos de `origin.id` para `origin.transactions[0]!.id`. **Nesta tarefa o corpo de `updateDebt` continua o mesmo no resto** — a reescrita para as quatro transições é a Task 7.

Em `deleteDebt`, nenhuma mudança nesta tarefa.

- [ ] **Step 5: Rodar a suíte de dívidas — precisa passar sem editar teste nenhum**

```bash
npm run test:integration -- debts
```

Esperado: PASS, mesma contagem do Step 1. Qualquer falha aqui é regressão da extração, não teste desatualizado: conserte o código, não o teste.

- [ ] **Step 6: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/debtOrigin.ts src/lib/debts.ts
git commit -m "refactor(debts): extract origin movement lifecycle into debtOrigin"
```

---

## Task 6: origem em cartão em `createDebt`

**Files:**
- Modify: `src/lib/debtOrigin.ts` (`createOrigin`, `deleteOrigin`)
- Modify: `src/lib/debts.ts` (`createDebt`)
- Test: `tests/integration/debts.test.ts`

**Interfaces:**
- Consumes: `CreateOriginParams`, `LoadedOrigin` (Task 5); `splitInstallments` de `@/lib/installments`; `invoiceCompetencyFor`, `consecutiveCompetencies` de `@/lib/invoiceCycle`; `resolveInvoice`, `recalcInvoiceTotals` de `@/lib/invoices`; `requireCreditCard` de `@/lib/creditCards`.
- Produces: `createOrigin` passa a criar N parcelas quando `input.creditCardId` está preenchido, e `deleteOrigin` passa a recalcular faturas. A Task 7 depende disso.

**Contexto:** `createCardPurchase` (`src/lib/cardPurchases.ts:42`) é o molde exato — a diferença é que a origem de dívida não tem vínculo com recorrência. Duas coisas que ele ensina e que você precisa repetir:

1. `INSTALLMENT_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 }`. O default do Prisma é 5 s, e uma origem no teto de `MAX_INSTALLMENTS` faz centenas de idas ao banco: estourar daria `P2028` com todas as faturas travadas até lá.
2. Todas as parcelas ficam com a **data da compra**; é o `invoiceId` que determina a que mês cada uma pertence.

E uma coisa que já está pronta: `resolveInvoice` **já recusa fatura paga** e devolve a fatura **travada**, em ordem crescente de competência. Não replique essa guarda.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/integration/debts.test.ts`, acrescente o cenário de cartão ao helper e um `describe` novo. Primeiro, ao lado de `scenario()`:

```ts
/** Cenário com cartão: fecha dia 20, vence dia 5. */
async function cardScenario(options: { currency?: "BRL" | "USD" } = {}) {
  const shared = await scenario();
  const card = await makeCreditCard(shared.user.id, {
    name: "Nubank",
    closingDay: 20,
    dueDay: 5,
    currency: options.currency ?? "BRL",
  });

  return { ...shared, card };
}

/** Faturas do cartão, em ordem de competência, com o total de cada uma. */
async function invoices(cardId: string) {
  const rows = await prisma.invoice.findMany({
    where: { creditCardId: cardId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  return rows.map((row) => ({
    competencia: `${row.year}-${String(row.month).padStart(2, "0")}`,
    total: row.totalAmount.toFixed(2),
    status: row.status,
  }));
}
```

Importe `makeCreditCard` de `"../factories"` no topo. Depois, um `describe` novo:

```ts
describe("origem no cartão", () => {
  it("lança a origem na fatura e não move saldo de conta", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 300,
        // Dia 6 é antes do fechamento (20): entra na fatura de agosto.
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "300.00", status: "OPEN" },
    ]);

    // O dinheiro só sai quando a fatura é paga.
    const saldo = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
    });

    expect(saldo.currentBalance.toFixed(2)).toBe("1000.00");
    expect(await recomputeBalance(account.id)).toEqual(saldo.currentBalance);

    const origin = await prisma.transaction.findFirstOrThrow({
      where: { debtId: debt.id },
    });

    expect(origin.accountId).toBeNull();
    expect(origin.creditCardId).toBe(card.id);
    expect(origin.categoryId).toBe(category.id);
    expect(origin.type).toBe("EXPENSE");
  });

  it("compra depois do fechamento cai na fatura do mês seguinte", async () => {
    const { user, category, person, card } = await cardScenario();

    await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 100,
        // Dia 21 é depois do fechamento (20).
        date: "2026-08-21",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-09", total: "100.00", status: "OPEN" },
    ]);
  });

  it("parcela em faturas consecutivas, com os centavos na primeira", async () => {
    const { user, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 100,
        installments: 3,
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "33.34", status: "OPEN" },
      { competencia: "2026-09", total: "33.33", status: "OPEN" },
      { competencia: "2026-10", total: "33.33", status: "OPEN" },
    ]);

    const parcelas = await prisma.transaction.findMany({
      where: { debtId: debt.id },
      orderBy: { installmentNumber: "asc" },
    });

    expect(
      parcelas.map((row) => ({
        n: row.installmentNumber,
        de: row.totalInstallments,
        valor: row.amount.toFixed(2),
        data: row.date.toISOString().slice(0, 10),
      })),
    ).toEqual([
      { n: 1, de: 3, valor: "33.34", data: "2026-08-06" },
      { n: 2, de: 3, valor: "33.33", data: "2026-08-06" },
      { n: 3, de: 3, valor: "33.33", data: "2026-08-06" },
    ]);

    // A 1ª parcela é a âncora; as seguintes apontam para ela.
    const ancora = parcelas[0]!;

    expect(ancora.parentInstallmentId).toBeNull();
    expect(parcelas.slice(1).every((row) => row.parentInstallmentId === ancora.id)).toBe(true);

    // A soma das parcelas é exatamente o total da dívida.
    const gravada = await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } });

    expect(gravada.originalAmount.toFixed(2)).toBe("100.00");
  });

  it("recusa BORROWED com origem no cartão", async () => {
    const { user, category, person, card } = await cardScenario();

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          creditCardId: card.id,
          type: "BORROWED",
        }),
      ),
    ).rejects.toThrow();

    expect(await invoices(card.id)).toEqual([]);
  });

  it("recusa cartão de outro usuário", async () => {
    const { user, category, person } = await cardScenario();
    const outro = await makeUser();
    const cartaoAlheio = await makeCreditCard(outro.id);

    await expect(
      createDebt(
        user.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          creditCardId: cartaoAlheio.id,
        }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("amortiza em conta uma dívida originada no cartão", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 300,
        date: "2026-08-06",
      }),
    );

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 120 }));

    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "300.00",
      restante: "180.00",
      status: "PARTIALLY_PAID",
      // O recebimento entra na conta; a fatura não é tocada.
      saldo: "1120.00",
    });

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "300.00", status: "OPEN" },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:integration -- debts
```

Esperado: FAIL — `createOrigin` recusa quando `accountId` é nulo ("Escolha a origem...").

- [ ] **Step 3: Ensinar `createOrigin` a lançar no cartão**

Em `src/lib/debtOrigin.ts`, substituir o corpo de `createOrigin` e acrescentar os imports:

```ts
import { splitInstallments } from "@/lib/installments";
import { consecutiveCompetencies, invoiceCompetencyFor } from "@/lib/invoiceCycle";
import { recalcInvoiceTotals, resolveInvoice } from "@/lib/invoices";
```

```ts
export async function createOrigin(
  tx: Tx,
  params: CreateOriginParams,
): Promise<Transaction[]> {
  if (params.card) {
    return createCardOrigin(tx, params);
  }

  return createAccountOrigin(tx, params);
}

async function createAccountOrigin(
  tx: Tx,
  params: CreateOriginParams,
): Promise<Transaction[]> {
  const { userId, debtId, type, input, date, rate, status } = params;

  if (!input.accountId) {
    throw new InvalidOperationError(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  }

  const created = await tx.transaction.create({
    data: {
      userId,
      type,
      status: status ?? "CONFIRMED",
      description: input.description,
      date,
      amount: toStorage(input.amount),
      currency: input.currency,
      exchangeRate: rate.toFixed(FX_RATE_SCALE),
      convertedAmount: toStorage(convertMoney(input.amount, rate)),
      accountId: input.accountId,
      categoryId: input.categoryId,
      debtId,
    },
  });

  if (affectsBalance(created)) {
    await applyToBalance(tx, input.accountId, balanceDelta(created.type, created.convertedAmount));
  }

  return [created];
}

/**
 * Distribui a origem em faturas consecutivas, como qualquer compra parcelada.
 *
 * A divisão é sobre o valor na moeda do lançamento e cada parcela usa a mesma
 * taxa, o que mantém `amount × exchangeRate = convertedAmount` verdadeiro linha
 * a linha. Todas ficam com a data da compra: é o `invoiceId` que diz a que mês
 * cada uma pertence.
 */
async function createCardOrigin(
  tx: Tx,
  params: CreateOriginParams,
): Promise<Transaction[]> {
  const { userId, debtId, type, input, date, rate, card } = params;

  if (!card) {
    throw new InvalidOperationError("Cartão de origem não informado");
  }

  const exchangeRate = rate.toFixed(FX_RATE_SCALE);
  const parts = splitInstallments(input.amount, input.installments);
  const competencies = consecutiveCompetencies(
    invoiceCompetencyFor(card, date),
    input.installments,
  );

  const created: Transaction[] = [];
  const touched = new Set<string>();
  let parentInstallmentId: string | null = null;

  for (const [index, part] of parts.entries()) {
    const invoice = await resolveInvoice(tx, {
      userId,
      card,
      competency: competencies[index]!,
    });

    const installment: Transaction = await tx.transaction.create({
      data: {
        userId,
        type,
        status: "CONFIRMED",
        description: input.description,
        date,
        amount: toStorage(part),
        currency: input.currency,
        exchangeRate,
        convertedAmount: toStorage(convertMoney(part, rate)),
        creditCardId: card.id,
        invoiceId: invoice.id,
        categoryId: input.categoryId,
        installmentNumber: index + 1,
        totalInstallments: input.installments,
        // A 1ª parcela é a âncora; as seguintes apontam para ela.
        parentInstallmentId,
      },
    });

    parentInstallmentId ??= installment.id;
    created.push(installment);
    touched.add(invoice.id);
  }

  // Um recalculo por fatura no fim, não um por parcela: `recalcInvoiceTotals`
  // mantém a ordem crescente que evita deadlock.
  await recalcInvoiceTotals(tx, touched);

  return created;
}
```

E `CreateOriginParams` ganha o cartão já resolvido — a posse é checada fora da transação:

```ts
export interface CreateOriginParams {
  userId: string;
  debtId: string;
  type: TransactionType;
  input: DebtInput;
  date: Date;
  rate: Money;
  status?: TransactionStatus;
  /** Cartão de destino, já com a posse conferida. Nulo = origem em conta. */
  card?: CreditCard | null;
}
```

Importe `CreditCard` de `@prisma/client`.

- [ ] **Step 4: Ensinar `deleteOrigin` a recalcular faturas**

Ao fim de `deleteOrigin`, depois do `deleteMany`:

```ts
  // Fatura que ficou sem lançamento é apagada por `recalcInvoiceTotal`, o que
  // fecha o ciclo que `resolveInvoice` abriu.
  await recalcInvoiceTotals(tx, origin.invoiceIds);
```

- [ ] **Step 5: Resolver o destino em `createDebt`**

Em `src/lib/debts.ts`, `createDebt` passa a resolver conta **ou** cartão, e a taxa converte para a moeda do destino:

```ts
export async function createDebt(userId: string, input: DebtInput): Promise<Debt> {
  await assertPersonOwned(userId, input.personId);
  await assertCategoryOwned(userId, input.categoryId);

  // O destino define a moeda para a qual a taxa converte, e a posse é conferida
  // aqui, fora da transação.
  const card = input.creditCardId ? await requireCreditCard(userId, input.creditCardId) : null;
  const account = input.accountId ? await requireAccount(userId, input.accountId) : null;
  const targetCurrency = card?.currency ?? account?.currency;

  if (!targetCurrency) {
    throw new InvalidOperationError(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  }

  const date = parseCalendarDate(input.date);

  const rate = await getExchangeRate({
    from: input.currency,
    to: targetCurrency,
    date,
    manualRate: input.manualFxRate,
  });

  return prisma.$transaction(
    async (tx) => {
      const debt = await tx.debt.create({
        data: {
          userId,
          personId: input.personId,
          categoryId: input.categoryId,
          type: input.type,
          status: "PENDING",
          description: input.description,
          originalAmount: toStorage(input.amount),
          // Nada foi abatido ainda: o restante nasce igual ao total.
          remainingAmount: toStorage(input.amount),
          currency: input.currency,
          dueDate: input.dueDate ? parseCalendarDate(input.dueDate) : null,
        },
      });

      await createOrigin(tx, {
        userId,
        debtId: debt.id,
        type: originType(input.type),
        input,
        date,
        rate,
        card,
      });

      return debt;
    },
    card ? INSTALLMENT_TX_OPTIONS : undefined,
  );
}
```

Acrescente ao topo de `debts.ts`:

```ts
import { requireCreditCard } from "@/lib/creditCards";

/**
 * Folga para a origem parcelada. O default do Prisma é 5 s, e uma origem no teto
 * de `MAX_INSTALLMENTS` faz centenas de idas ao banco: estourar daria `P2028`
 * com todas as faturas travadas até lá.
 */
const INSTALLMENT_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
```

- [ ] **Step 6: Rodar os testes**

```bash
npm run test:integration -- debts
```

Esperado: PASS, incluindo os 6 testes novos. Se "recusa BORROWED com origem no cartão" falhar, confirme que o `.refine` da Task 4 está sendo exercitado — `createDebt` recebe `DebtInput` já parseado nos testes, então essa recusa vem do `CHECK` do banco (Task 1). As duas camadas são esperadas; o teste só exige que rejeite.

- [ ] **Step 7: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/debtOrigin.ts src/lib/debts.ts tests/integration/debts.test.ts
git commit -m "feat(debts): allow credit card as loan origin with installments"
```

---

## Task 7: `updateDebt` e as quatro transições

**Files:**
- Modify: `src/lib/debts.ts` (`updateDebt`)
- Modify: `src/lib/debtOrigin.ts` (`deleteOrigin` passa a usar `lockTransaction`)
- Test: `tests/integration/debts.test.ts`

**Interfaces:**
- Consumes: `loadOrigin`, `assertOriginEditable`, `createOrigin`, `deleteOrigin`, `LoadedOrigin` (Tasks 5-6); `lockTransaction` de `@/lib/accountBalance`.
- Produces: `updateDebt(userId, debtId, input: DebtInput): Promise<Debt>` cobrindo as 4 transições.

**Contexto:** `updateDebt` hoje estorna o saldo, dá `update` na transação de origem e reaplica. Com cartão isso não serve: trocar parcelas, data ou cartão redistribui as parcelas por outras faturas. A decisão é **apagar o grupo e recriar**, a mesma de `updateCardPurchase` (`src/lib/cardPurchases.ts:130`), e ela faz um caminho único cobrir tudo. O que **não** muda: `type` e `currency` seguem imutáveis, e o novo `originalAmount` não pode ficar abaixo do já amortizado.

Duas armadilhas:

1. **Ordem de lock.** Todo o módulo trava a dívida primeiro (`lockDebt`) e a movimentação depois (`lockTransaction`). Inverter em um só lugar basta para duas operações simultâneas travarem em sentidos opostos.
2. **O `status` da origem em conta.** `createDebt` só cria `CONFIRMED` e `transactionSchema` não aceita `debtId`, então origem `PENDING` não é alcançável hoje — mas `debts.ts` a trata por precaução, e recriar sem preservar o campo transformaria a precaução em bug silencioso. Passe o `status` da linha antiga para `createOrigin` quando o destino novo for conta.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/integration/debts.test.ts`, dentro do `describe("edição da dívida")`:

```ts
  it("conta → cartão: estorna o saldo e abre a fatura", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    expect(await state(user.id, debt.id, account.id)).toMatchObject({ saldo: "800.00" });

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    // O saldo volta ao que era: o dinheiro agora sai quando a fatura for paga.
    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "200.00",
      restante: "200.00",
      saldo: "1000.00",
    });
    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "200.00", status: "OPEN" },
    ]);
    expect(await recomputeBalance(account.id)).toEqual(
      (await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } }))
        .currentBalance,
    );
  });

  it("cartão → conta: recalcula a fatura, apaga a que ficou vazia e debita", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        accountId: account.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    // A fatura ficou sem lançamento nenhum e foi apagada.
    expect(await invoices(card.id)).toEqual([]);
    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "200.00",
      saldo: "800.00",
    });
  });

  it("cartão → cartão: 3x vira 6x e redistribui as faturas", async () => {
    const { user, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 90,
        installments: 3,
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toHaveLength(3);

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 120,
        installments: 6,
        date: "2026-08-06",
      }),
    );

    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "20.00", status: "OPEN" },
      { competencia: "2026-09", total: "20.00", status: "OPEN" },
      { competencia: "2026-10", total: "20.00", status: "OPEN" },
      { competencia: "2026-11", total: "20.00", status: "OPEN" },
      { competencia: "2026-12", total: "20.00", status: "OPEN" },
      { competencia: "2027-01", total: "20.00", status: "OPEN" },
    ]);
  });

  it("preserva o valor já amortizado ao trocar de destino", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({ personId: person.id, categoryId: category.id, accountId: account.id }),
    );

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 80 }));

    await updateDebt(
      user.id,
      debt.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    expect(await state(user.id, debt.id, account.id)).toMatchObject({
      total: "200.00",
      restante: "120.00",
      status: "PARTIALLY_PAID",
      // 1000 − 200 (origem estornada) + 80 (amortização, intacta) = 1080.
      saldo: "1080.00",
    });
  });

  it("recusa editar dívida cuja origem está em fatura paga", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { creditCardId: card.id },
    });

    await payInvoice(user.id, invoice.id, { accountId: account.id, date: "2026-09-05", manualFxRate: null });

    await expect(
      updateDebt(
        user.id,
        debt.id,
        debtInput({
          personId: person.id,
          categoryId: category.id,
          creditCardId: card.id,
          amount: 500,
          date: "2026-08-06",
        }),
      ),
    ).rejects.toThrow(InvalidOperationError);

    // Nada mudou: nem a dívida, nem a fatura.
    const gravada = await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } });

    expect(gravada.originalAmount.toFixed(2)).toBe("200.00");
    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "200.00", status: "PAID" },
    ]);
  });
```

Importe `payInvoice` de `@/lib/invoicePayments` no topo do arquivo — confirme o nome exportado com `grep -n "export async function" src/lib/invoicePayments.ts` e ajuste a chamada à assinatura real.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:integration -- debts
```

Esperado: FAIL nos cinco novos.

- [ ] **Step 3: Reescrever `updateDebt`**

```ts
/**
 * Atualiza a dívida e a movimentação de origem, mantendo as duas coerentes.
 *
 * `type` e `currency` são imutáveis: trocar o tipo inverteria o sinal da origem
 * e de todas as amortizações já lançadas; trocar a moeda reinterpretaria
 * `originalAmount` e `remainingAmount` sem converter nada. Nos dois casos o
 * certo é remover e recriar.
 *
 * A origem é **apagada e recriada**, e não editada no lugar: o destino, a data e
 * o número de parcelas podem mudar, e cada uma dessas mudanças redistribui as
 * parcelas por outras faturas. É o mesmo caminho de `updateCardPurchase`, e é
 * o que faz uma única passagem cobrir conta→conta, conta→cartão, cartão→conta e
 * cartão→cartão.
 */
export async function updateDebt(userId: string, debtId: string, input: DebtInput): Promise<Debt> {
  const debt = await requireDebt(userId, debtId);

  if (input.type !== debt.type) {
    throw new InvalidOperationError(
      "O tipo da dívida não pode ser alterado. Remova e registre novamente.",
    );
  }

  if (input.currency !== debt.currency) {
    throw new InvalidOperationError(
      "A moeda da dívida não pode ser alterada. Remova e registre novamente.",
    );
  }

  await assertPersonOwned(userId, input.personId);
  await assertCategoryOwned(userId, input.categoryId);

  const origin = await loadOrigin(userId, debt);

  if (origin.transactions.length === 0) {
    throw new NotFoundError("Movimentação de origem não encontrada");
  }

  // Antes de abrir a transação, para dar mensagem em vez de erro de constraint.
  assertOriginEditable(origin, "editar");

  const card = input.creditCardId ? await requireCreditCard(userId, input.creditCardId) : null;
  const account = input.accountId ? await requireAccount(userId, input.accountId) : null;
  const targetCurrency = card?.currency ?? account?.currency;

  if (!targetCurrency) {
    throw new InvalidOperationError(
      "Escolha a origem: conta bancária ou cartão de crédito",
    );
  }

  const date = parseCalendarDate(input.date);

  const rate = await getExchangeRate({
    from: input.currency,
    to: targetCurrency,
    date,
    manualRate: input.manualFxRate,
  });

  return prisma.$transaction(
    async (tx) => {
      const locked = await lockDebt(tx, debtId);

      // O já abatido é o que o novo total precisa acomodar.
      const settled = money(locked.originalAmount).minus(locked.remainingAmount);
      const nextOriginal = money(input.amount);

      if (nextOriginal.lessThan(settled)) {
        throw new InvalidOperationError(
          `O novo valor é menor do que os ${settled.toFixed(2)} ${debt.currency} já abatidos`,
        );
      }

      // Mesma ordem do resto do módulo: dívida, depois movimentação.
      await deleteOrigin(tx, origin);

      await createOrigin(tx, {
        userId,
        debtId,
        type: originType(debt.type),
        input,
        date,
        rate,
        card,
        // Preserva a origem pendente: `update` nunca mexia no status, e recriar
        // sem carregá-lo deixaria uma origem projetada virar confirmada.
        status: card ? undefined : origin.transactions[0]?.status,
      });

      const remaining = nextOriginal.minus(settled);

      await tx.debt.update({
        where: { id: debtId },
        data: {
          personId: input.personId,
          categoryId: input.categoryId,
          description: input.description,
          originalAmount: toStorage(nextOriginal),
          remainingAmount: toStorage(remaining),
          status: deriveDebtStatus(nextOriginal, remaining),
          dueDate: input.dueDate ? parseCalendarDate(input.dueDate) : null,
        },
      });

      return tx.debt.findUniqueOrThrow({ where: { id: debtId } });
    },
    card || origin.target?.kind === "card" ? INSTALLMENT_TX_OPTIONS : undefined,
  );
}
```

- [ ] **Step 4: Trocar a releitura de `deleteOrigin` por `lockTransaction`**

Em `src/lib/debtOrigin.ts`, no laço de `deleteOrigin`, substituir o `findUniqueOrThrow` provisório da Task 5 (e remover o comentário que o marcava):

```ts
  for (const row of origin.transactions) {
    // O retrato lido antes da transação pode estar velho: uma edição
    // concorrente já teria trocado conta, tipo ou valor, e o estorno devolveria
    // o número errado à conta errada.
    const previous = await lockTransaction(tx, row.id);

    if (previous && previous.accountId && previous.status === "CONFIRMED") {
      await applyToBalance(
        tx,
        previous.accountId,
        balanceDelta(previous.type, previous.convertedAmount).negated(),
      );
    }
  }
```

Importe `lockTransaction` de `@/lib/accountBalance`.

- [ ] **Step 5: Rodar os testes**

```bash
npm run test:integration -- debts
```

Esperado: PASS, incluindo os cinco novos e todos os antigos de edição — em especial "mudar a conta move o efeito de um saldo para o outro" e "aumentar o total ajusta a origem, o restante e o saldo", que provam que o caminho novo não regrediu o caso de conta.

- [ ] **Step 6: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/debts.ts src/lib/debtOrigin.ts tests/integration/debts.test.ts
git commit -m "feat(debts): switch loan origin between account and card on edit"
```

---

## Task 8: `deleteDebt` com portão de fatura paga

**Files:**
- Modify: `src/lib/debts.ts` (`deleteDebt`)
- Test: `tests/integration/debts.test.ts`

**Interfaces:**
- Consumes: `loadOrigin`, `assertOriginEditable` (Task 5); `recalcInvoiceTotals` de `@/lib/invoices`.
- Produces: `deleteDebt(userId, debtId): Promise<void>` que recusa origem em fatura paga e recalcula as faturas tocadas.

**Contexto:** `deleteDebt` hoje apaga todas as movimentações da dívida e estorna saldos. Com origem em cartão faltam duas coisas: recusar quando alguma parcela está em fatura paga — o dinheiro já saiu pelo total antigo — e recalcular as faturas depois de apagar. As amortizações continuam sempre em conta, então o estorno de saldo segue valendo para elas.

- [ ] **Step 1: Escrever os testes que falham**

No `describe("remoção")` de `tests/integration/debts.test.ts`:

```ts
  it("remover dívida com origem no cartão recalcula as faturas", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 90,
        installments: 3,
        date: "2026-08-06",
      }),
    );

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 30 }));

    await deleteDebt(user.id, debt.id);

    // As três faturas ficaram vazias e foram apagadas.
    expect(await invoices(card.id)).toEqual([]);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);

    // O saldo volta ao inicial: a amortização foi estornada, a origem nunca o tocou.
    const saldo = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id },
    });

    expect(saldo.currentBalance.toFixed(2)).toBe("1000.00");
  });

  it("recusa remover dívida cuja origem está em fatura paga", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { creditCardId: card.id },
    });

    await payInvoice(user.id, invoice.id, { accountId: account.id, date: "2026-09-05", manualFxRate: null });

    await expect(deleteDebt(user.id, debt.id)).rejects.toThrow(InvalidOperationError);

    expect(await prisma.debt.count({ where: { id: debt.id } })).toBe(1);
    expect(await invoices(card.id)).toEqual([
      { competencia: "2026-08", total: "200.00", status: "PAID" },
    ]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:integration -- debts
```

Esperado: FAIL — o primeiro deixa faturas com total velho; o segundo apaga a dívida em vez de recusar.

- [ ] **Step 3: Ajustar `deleteDebt`**

```ts
/**
 * Remove a dívida com todas as suas movimentações, revertendo os saldos.
 *
 * As transações vinculadas têm `onDelete: SetNull`, então apagar só a dívida
 * deixaria os lançamentos sem vínculo — dinheiro movimentado sem explicação.
 *
 * Fatura paga é intocável: o dinheiro já saiu pelo total antigo, e apagar a
 * parcela deixaria `total_amount` menor que o valor pago com a fatura ainda
 * `PAID`.
 */
export async function deleteDebt(userId: string, debtId: string): Promise<void> {
  const debt = await requireDebt(userId, debtId);

  const origin = await loadOrigin(userId, debt);

  assertOriginEditable(origin, "remover");

  await prisma.$transaction(
    async (tx) => {
      const movements = await tx.transaction.findMany({
        where: { userId, debtId: debt.id },
        select: {
          id: true,
          type: true,
          convertedAmount: true,
          accountId: true,
          status: true,
          invoiceId: true,
        },
        // Ordem estável, para que contas tocadas por mais de uma movimentação
        // sejam atualizadas sempre na mesma sequência.
        orderBy: { id: "asc" },
      });

      await tx.transaction.deleteMany({ where: { id: { in: movements.map((row) => row.id) } } });

      for (const movement of movements) {
        if (movement.accountId && movement.status === "CONFIRMED") {
          await applyToBalance(
            tx,
            movement.accountId,
            balanceDelta(movement.type, movement.convertedAmount).negated(),
          );
        }
      }

      await recalcInvoiceTotals(
        tx,
        movements
          .map((row) => row.invoiceId)
          .filter((id): id is string => id !== null),
      );

      await tx.debt.delete({ where: { id: debt.id } });
    },
    origin.target?.kind === "card" ? INSTALLMENT_TX_OPTIONS : undefined,
  );
}
```

Importe `recalcInvoiceTotals` de `@/lib/invoices` em `debts.ts`.

- [ ] **Step 4: Rodar os testes**

```bash
npm run test:integration -- debts
```

Esperado: PASS.

- [ ] **Step 5: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/debts.ts tests/integration/debts.test.ts
git commit -m "feat(debts): guard debt deletion against paid invoices"
```

---

## Task 9: leitura — `originTarget`, parcelas e origem múltipla

**Files:**
- Modify: `src/lib/debts.ts` (`DebtListItem`, `debtInclude`, `toListItem`, `DebtMovement`, `getDebtDetail`)
- Test: `tests/integration/debts.test.ts`

**Interfaces:**
- Consumes: `originType` (já em `debts.ts`); `OriginTarget` de `@/lib/debtOrigin`.
- Produces:
  ```ts
  export interface DebtListItem {
    /* … campos existentes … */
    originTarget: OriginTarget | null;
    /** Nulo quando a origem foi no cartão. É o destino sugerido da amortização. */
    originAccountId: string | null;
    originDate: Date | null;
    originInstallments: number;
    originLocked: boolean;
    originCardName: string | null;
  }

  export interface DebtMovement {
    /* … campos existentes … */
    creditCardId: string | null;
    cardName: string | null;
    installmentNumber: number | null;
    totalInstallments: number | null;
  }
  ```
  As Tasks 12, 13 e 14 consomem.

**Contexto:** `originAccountId` e `originDate` existem porque o formulário de edição precisa deles: sem isso, um "salvar" sem tocar nesses campos moveria o lançamento de origem para outra conta e para a data de criação do registro, corrompendo dois saldos. A necessidade continua, com mais campos. **`originAccountId` fica** — é o `defaultAccountId` do `SettleDebtButton`, e ele já cai na primeira conta quando recebe `null`. `settlementCount` passa a contar por tipo: `_count.settlements - 1` só valia com origem de uma linha.

- [ ] **Step 1: Escrever os testes que falham**

No `describe("histórico e isolamento")`:

```ts
  it("expõe a origem em cartão para o formulário de edição", async () => {
    const { user, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 90,
        installments: 3,
        date: "2026-08-06",
      }),
    );

    const [item] = await listDebts(user.id);

    expect(item).toMatchObject({
      originTarget: { kind: "card", id: card.id },
      originAccountId: null,
      originInstallments: 3,
      originLocked: false,
      originCardName: "Nubank",
      // As três parcelas são origem, não amortização.
      settlementCount: 0,
    });
    expect(item?.originDate?.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(debt.id).toBe(item?.id);
  });

  it("marca todas as parcelas da origem no histórico", async () => {
    const { user, account, category, person, card } = await cardScenario();

    const debt = await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 90,
        installments: 3,
        date: "2026-08-06",
      }),
    );

    await settleDebt(user.id, debt.id, settlementInput({ accountId: account.id, amount: 30 }));

    const { debt: summary, movements } = await getDebtDetail(user.id, debt.id);

    expect(summary.settlementCount).toBe(1);
    expect(
      movements.map((movement) => ({
        origem: movement.isOrigin,
        parcela: movement.installmentNumber,
        de: movement.totalInstallments,
        cartao: movement.cardName,
        conta: movement.accountName,
      })),
    ).toEqual([
      { origem: true, parcela: 1, de: 3, cartao: "Nubank", conta: null },
      { origem: true, parcela: 2, de: 3, cartao: "Nubank", conta: null },
      { origem: true, parcela: 3, de: 3, cartao: "Nubank", conta: null },
      { origem: false, parcela: null, de: null, cartao: null, conta: expect.any(String) },
    ]);
  });

  it("marca a origem como travada quando a fatura foi paga", async () => {
    const { user, account, category, person, card } = await cardScenario();

    await createDebt(
      user.id,
      debtInput({
        personId: person.id,
        categoryId: category.id,
        creditCardId: card.id,
        amount: 200,
        date: "2026-08-06",
      }),
    );

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { creditCardId: card.id },
    });

    await payInvoice(user.id, invoice.id, { accountId: account.id, date: "2026-09-05", manualFxRate: null });

    const [item] = await listDebts(user.id);

    expect(item?.originLocked).toBe(true);
  });
```

Ajuste também o teste existente "lista as movimentações marcando a origem" (linha ~870): ele passa `accountId: account.id` e continua válido, mas o `toMatchObject` de `summary` deve ganhar `originInstallments: 1` e `originTarget: { kind: "account", id: account.id }` para provar o caso de conta.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:integration -- debts
```

Esperado: FAIL — os campos não existem.

- [ ] **Step 3: Ampliar o `debtInclude` e o `toListItem`**

Em `src/lib/debts.ts`:

```ts
const debtInclude = {
  person: { select: { name: true } },
  category: { select: { name: true, color: true } },
  settlements: {
    select: {
      type: true,
      accountId: true,
      creditCardId: true,
      date: true,
      installmentNumber: true,
      creditCard: { select: { name: true } },
      invoice: { select: { status: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} as const;
```

`_count` sai: `settlementCount` passa a ser contado por tipo, e manter os dois convidaria a usar o número errado.

```ts
function toListItem(debt: Debt & {
  person: { name: string };
  category: { name: string; color: string | null };
  settlements: Array<{
    type: TransactionType;
    accountId: string | null;
    creditCardId: string | null;
    date: Date;
    installmentNumber: number | null;
    creditCard: { name: string } | null;
    invoice: { status: InvoiceStatus } | null;
  }>;
}): DebtListItem {
  const original = money(debt.originalAmount);
  const remaining = money(debt.remainingAmount);

  // Origem e amortização têm sempre tipos opostos, então o tipo particiona as
  // duas — e a origem no cartão é um grupo de parcelas, não uma linha.
  const originKind = originType(debt.type);
  const originMovements = debt.settlements.filter((row) => row.type === originKind);
  const first = originMovements[0];

  return {
    id: debt.id,
    type: debt.type,
    status: debt.status,
    description: debt.description,
    originalAmount: original.toNumber(),
    remainingAmount: remaining.toNumber(),
    settledAmount: original.minus(remaining).toNumber(),
    currency: debt.currency,
    dueDate: debt.dueDate,
    personId: debt.personId,
    personName: debt.person.name,
    categoryId: debt.categoryId,
    categoryName: debt.category.name,
    categoryColor: debt.category.color,
    settlementCount: debt.settlements.length - originMovements.length,
    originTarget: originTargetOf(first),
    originAccountId: first?.accountId ?? null,
    originDate: first?.date ?? null,
    originInstallments: Math.max(originMovements.length, 1),
    originLocked: originMovements.some((row) => row.invoice?.status === "PAID"),
    originCardName: first?.creditCard?.name ?? null,
    createdAt: debt.createdAt,
  };
}
```

Importe `InvoiceStatus` de `@prisma/client`, e `OriginTarget` + `originTargetOf` de `@/lib/debtOrigin` — `originTargetOf` é a mesma função que `loadOrigin` usa, e reimplementá-la aqui daria duas versões do mesmo mapeamento. Atualize o docblock de `DebtListItem` para descrever os campos novos, mantendo enxuto o porquê (o longo mora no ARCHITECTURE.md).

- [ ] **Step 4: Ampliar `getDebtDetail`**

Trocar a marcação de origem e acrescentar os campos:

```ts
  const movements = await prisma.transaction.findMany({
    where: { userId, debtId },
    orderBy: [{ date: "asc" }, { installmentNumber: "asc" }, { createdAt: "asc" }],
    include: {
      account: { select: { name: true, currency: true } },
      creditCard: { select: { name: true } },
      category: { select: { name: true, color: true } },
    },
  });

  const originKind = originType(debt.type);

  return {
    debt: toListItem(debt),
    movements: movements.map((movement) => ({
      id: movement.id,
      description: movement.description,
      date: movement.date,
      // O tipo particiona origem e amortização; no cartão a origem é o grupo
      // inteiro de parcelas.
      isOrigin: movement.type === originKind,
      amount: movement.amount.toNumber(),
      currency: movement.currency,
      convertedAmount: movement.convertedAmount.toNumber(),
      accountId: movement.accountId,
      accountName: movement.account?.name ?? null,
      accountCurrency: movement.account?.currency ?? null,
      creditCardId: movement.creditCardId,
      cardName: movement.creditCard?.name ?? null,
      installmentNumber: movement.installmentNumber,
      totalInstallments: movement.totalInstallments,
      categoryName: movement.category?.name ?? null,
      categoryColor: movement.category?.color ?? null,
    })),
  };
```

- [ ] **Step 5: Rodar e consertar os chamadores**

```bash
npm run typecheck
```

`src/app/dashboard/debts/page.tsx` e `debts/[id]/page.tsx` continuam compilando (`originAccountId` ficou), mas confirme. As Tasks 13-14 reescrevem essas telas.

```bash
npm run test:integration -- debts
```

Esperado: PASS.

- [ ] **Step 6: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/debts.ts tests/integration/debts.test.ts
git commit -m "feat(debts): expose origin target and installments in debt reads"
```

---

## Task 10: fechar o vazamento pela tela do cartão

**Files:**
- Modify: `src/lib/cardPurchases.ts` (`updateCardPurchase`, `deleteCardPurchase`)
- Modify: `src/lib/invoices.ts` (`InvoiceItem`, `listItemsByInvoice`)
- Modify: `src/lib/revalidation.ts` (domínio `debts`)
- Test: `tests/integration/cardPurchases.test.ts`

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: `InvoiceItem.debtId: string | null`, consumido pela Task 14.

**Contexto — por que a recusa vai no serviço:** a tela do cartão renderiza `EditCardPurchaseButton` e `DeleteEntityButton` para todo item de fatura. Uma origem de dívida no cartão apareceria ali, e `updateCardPurchase` apaga e recria o grupo sem saber nada de `Debt.remainingAmount`: a dívida ficaria apontando para linhas que não existem, ou com o valor de antes. Esconder o botão **não basta** — `update_card_purchase` e `delete_card_purchase` são ferramentas MCP chamadas sem passar pela tela. É a mesma fronteira que `managedBy` já defende do lado das contas (`src/lib/transactions.ts:37`).

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/integration/cardPurchases.test.ts` (siga o estilo do arquivo; ele já tem fábricas e helpers próprios):

```ts
  it("recusa editar a origem de uma dívida pela compra do cartão", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    const debt = await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Passagens do grupo",
      amount: 300,
      currency: "BRL",
      accountId: null,
      creditCardId: card.id,
      installments: 1,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    const origin = await prisma.transaction.findFirstOrThrow({
      where: { debtId: debt.id },
    });

    await expect(
      updateCardPurchase(user.id, origin.id, {
        creditCardId: card.id,
        categoryId: category.id,
        description: "Editado por fora",
        amount: 1,
        currency: "BRL",
        date: "2026-08-06",
        installments: 1,
        manualFxRate: null,
      }),
    ).rejects.toThrow(InvalidOperationError);

    await expect(deleteCardPurchase(user.id, origin.id)).rejects.toThrow(
      InvalidOperationError,
    );

    // A origem continua intacta e a dívida segue coerente.
    const gravada = await prisma.transaction.findUniqueOrThrow({ where: { id: origin.id } });

    expect(gravada.amount.toFixed(2)).toBe("300.00");
  });

  it("marca o item de fatura que pertence a uma dívida", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    const debt = await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Passagens do grupo",
      amount: 300,
      currency: "BRL",
      accountId: null,
      creditCardId: card.id,
      installments: 1,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { creditCardId: card.id },
    });

    const items = await listInvoiceItems(user.id, invoice.id);

    expect(items).toHaveLength(1);
    expect(items[0]?.debtId).toBe(debt.id);
  });
```

Importe `createDebt` de `@/lib/debts`, `listInvoiceItems` de `@/lib/invoices` e `InvalidOperationError` de `@/lib/errors` conforme faltar.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:integration -- cardPurchases
```

Esperado: FAIL — a edição passa, e `debtId` não existe em `InvoiceItem`.

- [ ] **Step 3: Recusar no serviço**

Em `src/lib/cardPurchases.ts`, acrescente o helper e chame-o nas duas funções:

```ts
/**
 * Recusa mexer no que pertence a uma dívida.
 *
 * A origem de uma dívida pode ser uma compra no cartão, e estas funções apagam e
 * recriam o grupo sem saber nada de `Debt.remainingAmount`: editar por aqui
 * deixaria a dívida apontando para linhas que não existem mais. A guarda vive no
 * serviço, e não na tela, porque as duas são ferramentas MCP.
 */
async function assertNotDebtOrigin(userId: string, ids: string[]): Promise<void> {
  const linked = await prisma.transaction.count({
    where: { userId, id: { in: ids }, debtId: { not: null } },
  });

  if (linked > 0) {
    throw new InvalidOperationError(
      "Este lançamento é a origem de uma dívida. Ajuste-o pela tela de dívidas, " +
        "para que o valor restante acompanhe.",
    );
  }
}
```

Em `updateCardPurchase`, depois de montar `group` e antes do teste de fatura paga:

```ts
  await assertNotDebtOrigin(userId, group.map((row) => row.id));
```

Em `deleteCardPurchase`, depois de resolver `anchorId`:

```ts
  const groupIds = await prisma.transaction.findMany({
    where: { userId, OR: [{ id: anchorId }, { parentInstallmentId: anchorId }] },
    select: { id: true },
  });

  await assertNotDebtOrigin(userId, groupIds.map((row) => row.id));
```

- [ ] **Step 4: `InvoiceItem.debtId`**

Em `src/lib/invoices.ts`, acrescentar ao `InvoiceItem`:

```ts
  /** Preenchido quando o lançamento é a origem de uma dívida: editar é pela tela dela. */
  debtId: string | null;
```

E no `select`/`map` de `listItemsByInvoice`, incluir `debtId: true` na consulta e `debtId: row.debtId` no objeto montado. Localize os dois pontos com:

```bash
grep -n "anchorId\|fromRecurring" src/lib/invoices.ts
```

- [ ] **Step 5: Revalidar as telas de cartão ao escrever dívida**

Em `src/lib/revalidation.ts`:

```ts
  debts: [DASHBOARD, DEBTS, DEBT_DETAIL, PEOPLE, ACCOUNTS, TRANSACTIONS, CARDS, CARD_DETAIL],
```

A origem de uma dívida pode viver numa fatura, então escrever dívida muda o total dela. Sem isso o número fica velho na tela até a próxima escrita de cartão, e o sintoma é indistinguível de erro de cálculo.

- [ ] **Step 6: Rodar os testes**

```bash
npm run test:integration -- cardPurchases invoicePayments
```

Esperado: PASS. `invoicePayments` entra na conta porque `InvoiceItem` mudou de forma.

- [ ] **Step 7: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/cardPurchases.ts src/lib/invoices.ts src/lib/revalidation.ts tests/integration/cardPurchases.test.ts
git commit -m "fix(cards): refuse editing a debt origin through card purchases"
```

---

## Task 11: impacto de remoção

**Files:**
- Modify: `src/lib/deletionImpact.ts` (`accountImpact`, `creditCardImpact`)
- Test: `tests/integration/deletionImpact.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: entradas `debts_losing_origin` em `accountImpact` e `creditCardImpact`.

**Contexto:** `Transaction.account` e `Transaction.creditCard` são `onDelete: Cascade`. Apagar um cartão apaga a origem da dívida e deixa a dívida sem o lançamento que a criou — a `Debt` sobrevive, porque ela não referencia conta nem cartão. Hoje nem `accountImpact` nem `creditCardImpact` relatam isso; o buraco já existe do lado das contas e a feature o abre também do lado dos cartões. `effect: "detach"` é o rótulo certo: a dívida não é apagada, perde o vínculo. Leia [.github/skills/mcp-agent-surface](../../../.github/skills/mcp-agent-surface) antes — `deletionImpact` é superfície de agente.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/integration/deletionImpact.test.ts`, seguindo o estilo do arquivo:

```ts
  it("relata as dívidas que perdem a origem ao remover o cartão", async () => {
    const user = await makeUser();
    const card = await makeCreditCard(user.id, { closingDay: 20, dueDay: 5 });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Passagens do grupo",
      amount: 300,
      currency: "BRL",
      accountId: null,
      creditCardId: card.id,
      installments: 3,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    const impact = await deletionImpact(user.id, "credit_card", card.id);

    expect(impact.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "debts_losing_origin", count: 1, effect: "detach" }),
      ]),
    );
  });

  it("relata as dívidas que perdem a origem ao remover a conta", async () => {
    const user = await makeUser();
    const account = await makeAccount(user.id, { initialBalance: "1000.00" });
    const category = await makeCategory(user.id);
    const person = await makePerson(user.id);

    await createDebt(user.id, {
      personId: person.id,
      categoryId: category.id,
      type: "LENT",
      description: "Empréstimo",
      amount: 100,
      currency: "BRL",
      accountId: account.id,
      creditCardId: null,
      installments: 1,
      date: "2026-08-06",
      dueDate: null,
      manualFxRate: null,
    });

    const impact = await deletionImpact(user.id, "account", account.id);

    expect(impact.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "debts_losing_origin", count: 1, effect: "detach" }),
      ]),
    );
  });
```

Confirme o nome da função exportada com `grep -n "^export async function\|^export function" src/lib/deletionImpact.ts` e ajuste a chamada.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:integration -- deletionImpact
```

Esperado: FAIL — a entrada não existe.

- [ ] **Step 3: Contar as dívidas em cada impacto**

Em `creditCardImpact`, acrescente à `Promise.all`:

```ts
    prisma.debt.count({
      where: { userId, settlements: { some: { creditCardId: id } } },
    }),
```

nomeando o resultado `debtsLosingOrigin`, e acrescente a entrada:

```ts
      {
        key: "debts_losing_origin",
        label: "dívidas que perdem a movimentação de origem",
        count: debtsLosingOrigin,
        effect: "detach",
      },
```

Repita em `accountImpact`, com `settlements: { some: { accountId: id } }`.

`settlements` é o nome da relação `Debt → Transaction[]` no schema (ela cobre a origem **e** as amortizações). A contagem é de dívidas que têm alguma movimentação naquele destino — o que é exatamente o que perde vínculo no cascade.

- [ ] **Step 4: Rodar os testes**

```bash
npm run test:integration -- deletionImpact
```

Esperado: PASS. `compact()` remove entradas com `count: 0`, então nada muda no relatório de conta ou cartão sem dívida.

- [ ] **Step 5: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/deletionImpact.ts tests/integration/deletionImpact.test.ts
git commit -m "feat(deletion): report debts that lose their origin movement"
```

---

## Task 12: superfície de agente

**Files:**
- Modify: `src/mcp/serializers.ts` (`debtDto`, `debtDetailDto`)
- Modify: `src/mcp/tools/write.ts` (descrições de `create_debt` e `update_debt`)
- Test: `src/mcp/serializers.test.ts`

**Interfaces:**
- Consumes: `DebtListItem`, `DebtMovement` (Task 9).
- Produces: `debtDto` com `origin` e `origin_locked`; movimentos com `installment_number`/`total_installments`.

**Contexto:** nenhuma ferramenta nova, nenhum escopo novo — `debts:write` já cobre, e `src/mcp/scopes.ts` não muda. `create_debt` e `update_debt` herdam o `debtSchema` novo de graça, que é o ponto do arranjo: os schemas vêm de `@/lib/validations` sem alteração, a mesma fonte do formulário. **Dinheiro sai como string** (ARCHITECTURE §13) — use os helpers `amount()`/`optionalDay()` que o arquivo já tem. Sem `origin` no DTO o agente não consegue montar um `update_debt` que preserve a origem, e todo "salvar" dele moveria o lançamento.

- [ ] **Step 1: Atualizar a fixture e ver o snapshot falhar**

Em `src/mcp/serializers.test.ts`, na fixture `debt` (por volta da linha 102), trocar:

```ts
  originAccountId: "a1",
  originDate: new Date("2026-07-01T00:00:00Z"),
```

por:

```ts
  originTarget: { kind: "card" as const, id: "c1" },
  originAccountId: null,
  originDate: new Date("2026-07-01T00:00:00Z"),
  originInstallments: 3,
  originLocked: false,
  originCardName: "Nubank",
```

```bash
npm run test:unit -- serializers
```

Esperado: FAIL por tipo e/ou snapshot desatualizado.

- [ ] **Step 2: Acrescentar `origin` ao `debtDto`**

Em `src/mcp/serializers.ts`, dentro de `debtDto`, depois de `category`:

```ts
    /**
     * Onde a movimentação de origem vive. Necessário para `update_debt`
     * preservar a origem: sem isso, todo salvar a moveria de lugar.
     */
    origin: debt.originTarget
      ? {
          kind: debt.originTarget.kind,
          id: debt.originTarget.id,
          installments: debt.originInstallments,
        }
      : null,
    /** Origem em fatura paga: `update_debt` e `delete_debt` vão recusar. */
    origin_locked: debt.originLocked,
```

- [ ] **Step 3: Acrescentar a parcela aos movimentos**

Em `debtDetailDto`, no `map` dos movimentos, depois de `account`:

```ts
      card: movement.creditCardId
        ? { id: movement.creditCardId, name: movement.cardName }
        : null,
      installment_number: movement.installmentNumber,
      total_installments: movement.totalInstallments,
```

- [ ] **Step 4: Atualizar as descrições das ferramentas**

Em `src/mcp/tools/write.ts`:

```ts
  defineTool(server, "create_debt", {
    title: "Registrar empréstimo",
    description:
      "Registra um empréstimo entre pessoas e lança a movimentação de origem. " +
      "`type: LENT` = o usuário emprestou (sai o dinheiro); `BORROWED` = pegou " +
      "emprestado (entra). Informe exatamente uma origem: `accountId` (move o " +
      "saldo na hora) ou `creditCardId` (entra na fatura da competência e só sai " +
      "quando a fatura for paga). Origem no cartão exige `type: LENT` e aceita " +
      `\`installments\` > 1, que divide em faturas consecutivas. \`categoryId\` é obrigatória. ${FX_NOTE}`,
```

```ts
  defineTool(server, "update_debt", {
    title: "Editar empréstimo",
    description:
      "Substitui os dados da dívida e reajusta a movimentação de origem e os saldos. " +
      "A origem pode trocar de conta para cartão e vice-versa: informe o destino " +
      "novo em `accountId` ou `creditCardId`. Leia `origin` em list_debts antes, " +
      "ou o salvar move o lançamento de lugar. Não pode reduzir o valor original " +
      "abaixo do que já foi amortizado, e recusa quando a origem está em fatura paga.",
```

- [ ] **Step 5: Rodar e atualizar snapshots**

```bash
npm run test:unit -- serializers
```

Inspecione o diff do snapshot **linha por linha** antes de aceitar: o snapshot é o contrato do agente. Depois:

```bash
npm run test:unit -- serializers -u
npm run test
```

Esperado: PASS. `tests/integration/mcpRegistry.test.ts` também precisa passar — ele acusa ferramenta sem escopo.

- [ ] **Step 6: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/mcp/
git commit -m "feat(mcp): expose debt origin target and installments"
```

---

## Task 13: formulário de dívida

**Files:**
- Create: `src/lib/managedBy.ts`
- Modify: `src/components/TransactionsTable.tsx:34` (importa do módulo novo)
- Modify: `src/components/forms/DebtFields.tsx`
- Modify: `src/components/forms/AddDebtButton.tsx`, `src/components/forms/EditDebtButton.tsx`
- Modify: `src/lib/creditCards.ts` (`listCreditCardOptions` devolve `CardOption[]`)

**Interfaces:**
- Consumes: `splitTarget`, `joinTarget`, `TARGET_ACCOUNT_PREFIX`, `TARGET_CARD_PREFIX` de `@/lib/paymentTarget` (Task 3); `debtSchema` (Task 4); `CardOption` de `@/lib/options`.
- Produces:
  ```ts
  export type DebtFormValues = {
    personId: string; categoryId: string; type: string; description: string;
    amount: number; currency: string;
    /** Destino codificado: "account:<id>" ou "card:<id>". */
    target: string;
    installments: number;
    date: string; dueDate: string; manualFxRate?: number | undefined;
  };
  export function validateDebt(values: DebtFormValues): FormErrors;
  ```
  A Task 14 consome.

**Contexto:** `RecurringFields.tsx` é o molde — leia-o inteiro antes de escrever. A razão do `validateDebt` está no docblock de `validateRecurring`: o `transformValues` do Mantine só é aplicado no `onSubmit`, então passar `zod4Resolver` direto em `validate` faria a validação ver `target` — que o schema não conhece — e nunca `accountId`/`creditCardId`, fazendo o XOR falhar em toda submissão. O erro de destino é remapeado para o campo que existe na tela.

- [ ] **Step 1: Extrair `MANAGED_BY_LABEL`**

Criar `src/lib/managedBy.ts`:

```ts
import type { ManagedBy } from "@/lib/transactions";

/**
 * Rótulo e explicação de "este lançamento pertence a outro serviço".
 *
 * Fora do componente porque duas telas o usam — a de lançamentos e a de fatura
 * do cartão —, e duas cópias divergem sem ninguém notar. Sem `"use client"`: as
 * duas consumidoras são client, mas nada aqui precisa de runtime de cliente.
 */
export const MANAGED_BY_LABEL: Record<ManagedBy, { label: string; hint: string }> = {
  debt: {
    label: "Dívida",
    hint:
      "Este lançamento pertence a uma dívida. Ajuste-o pela tela de dívidas, " +
      "para que o valor restante acompanhe.",
  },
  invoice: {
    label: "Fatura",
    hint:
      "Este lançamento é o pagamento de uma fatura. Desfaça o pagamento pela " +
      "tela do cartão, para que a fatura volte a ficar em aberto.",
  },
};
```

Copie os textos **exatos** que estão hoje em `TransactionsTable.tsx:34`, não os de cima, se divergirem. Em `TransactionsTable.tsx`, remova a const local e importe de `@/lib/managedBy`.

- [ ] **Step 2: `listCreditCardOptions` devolve `CardOption[]`**

Em `src/lib/creditCards.ts`:

```ts
/** Cartões para popular `Select`s, com o ciclo para a prévia da fatura. */
export async function listCreditCardOptions(userId: string): Promise<CardOption[]> {
  const cards = await prisma.creditCard.findMany({
    where: { userId },
    select: { id: true, name: true, currency: true, closingDay: true, dueDay: true },
  });

  return cards.sort(byName).map((card) => ({
    value: card.id,
    label: card.name,
    currency: card.currency,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  }));
}
```

Importe `CardOption` de `@/lib/options`. `CardOption extends AccountOption`, então os chamadores atuais seguem válidos — confirme com `npm run typecheck`.

- [ ] **Step 3: Reescrever `DebtFields.tsx`**

O arquivo inteiro, com as mudanças: `accountId` sai e entram `target` e `installments`; `validateDebt` é exportado; o grupo "Cartões" só aparece quando `type` é `LENT`; o campo de parcelas só aparece com cartão.

```tsx
"use client";

import { Alert, Group, NumberInput, Select, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import type { FormErrors, UseFormReturnType } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { TriangleAlert } from "lucide-react";

import { debtSchema } from "@/lib/validations";
import { CURRENCY_LABELS, CURRENCY_OPTIONS, formatCurrency, type CurrencyCode } from "@/lib/currency";
import { DEBT_TYPE_LABELS, DEBT_TYPE_OPTIONS, type DebtTypeCode } from "@/lib/debtTypes";
import { monthName, parseCalendarDate } from "@/lib/dates";
import { describeSplit } from "@/lib/installmentSplit";
import { consecutiveCompetencies, invoiceCompetencyFor } from "@/lib/invoiceCycle";
import { MAX_INSTALLMENTS } from "@/lib/limits";
import {
  splitTarget,
  TARGET_ACCOUNT_PREFIX,
  TARGET_CARD_PREFIX,
} from "@/lib/paymentTarget";
import { useFormValue } from "@/components/ui/useFormValue";
import type { AccountOption, CardOption, Option } from "@/lib/options";

/** `type`, não `interface`: index signature implícita exigida pelo zod4Resolver. */
export type DebtFormValues = {
  personId: string;
  categoryId: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  /** Origem codificada: exatamente um destino fica preenchido. */
  target: string;
  /** Só no cartão; 1 em conta. */
  installments: number;
  date: string;
  dueDate: string;
  manualFxRate?: number | undefined;
};

/**
 * Valida o formulário contra o schema do serviço.
 *
 * Não dá para passar `zod4Resolver` direto em `validate`: o `transformValues` do
 * Mantine só é aplicado no `onSubmit`, então a validação veria `target` — que o
 * schema não conhece — e nunca `accountId`/`creditCardId`, fazendo o XOR falhar
 * em toda submissão. Aqui a conversão acontece antes, e o erro de destino é
 * remapeado para o campo que existe na tela.
 */
export function validateDebt(values: DebtFormValues): FormErrors {
  const errors = zod4Resolver(debtSchema)({
    ...values,
    ...splitTarget(values.target),
  });

  const targetError = errors.accountId ?? errors.creditCardId;

  if (targetError) {
    errors.target = targetError;
    delete errors.accountId;
    delete errors.creditCardId;
  }

  return errors;
}

interface DebtFieldsProps {
  form: UseFormReturnType<DebtFormValues>;
  people: Option[];
  categories: Option[];
  accounts: AccountOption[];
  cards: CardOption[];
  /**
   * Definidos ao editar: tipo e moeda passam a ser exibidos como imutáveis.
   * Trocar o tipo inverteria o sinal de todas as movimentações já lançadas, e
   * trocar a moeda reinterpretaria os valores sem converter nada.
   */
  locked?: { type: DebtTypeCode; currency: CurrencyCode };
  showManualFx: boolean;
}

export function DebtFields(props: DebtFieldsProps) {
  const { form, people, categories, accounts, cards, locked, showManualFx } = props;

  const target = useFormValue(form, "target");
  const currency = useFormValue(form, "currency");
  const type = useFormValue(form, "type");
  const amount = useFormValue(form, "amount");
  const installments = useFormValue(form, "installments");
  const date = useFormValue(form, "date");

  const isLent = type === "LENT";
  const { accountId, creditCardId } = splitTarget(target);
  const card = cards.find((entry) => entry.value === creditCardId);
  const destination = card ?? accounts.find((entry) => entry.value === accountId);
  const destinationCurrency = destination?.currency;
  const needsConversion = destinationCurrency !== undefined && currency !== destinationCurrency;

  // Prévia da divisão pela mesma regra que o servidor aplica.
  const installmentPreview = card
    ? describeSplit(Math.round((amount || 0) * 100), installments, (cents) =>
        formatCurrency(cents / 100, currency),
      )
    : null;

  const targetData = [
    {
      group: isLent ? "Contas — o dinheiro sai do saldo" : "Contas — o dinheiro entra no saldo",
      items: accounts.map((account) => ({
        value: `${TARGET_ACCOUNT_PREFIX}${account.value}`,
        label: account.label,
      })),
    },
    // Cartão só origina LENT: a origem de BORROWED é uma entrada, e o total da
    // fatura não tem sinal.
    ...(isLent
      ? [
          {
            group: "Cartões — entra na fatura, sai quando ela for paga",
            items: cards.map((entry) => ({
              value: `${TARGET_CARD_PREFIX}${entry.value}`,
              label: entry.label,
            })),
          },
        ]
      : []),
  ];

  return (
    <>
      {locked ? (
        <TextInput
          label="Tipo"
          description="O tipo de uma dívida existente não pode ser alterado"
          value={DEBT_TYPE_LABELS[locked.type]}
          disabled
        />
      ) : (
        <Select
          label="Tipo"
          description="Define para que lado o dinheiro se move"
          data={DEBT_TYPE_OPTIONS}
          allowDeselect={false}
          key={form.key("type")}
          {...form.getInputProps("type")}
        />
      )}
      <Select
        label="Pessoa"
        data={people}
        allowDeselect={false}
        searchable
        key={form.key("personId")}
        {...form.getInputProps("personId")}
      />
      <TextInput
        label="Descrição"
        placeholder="Passagens da viagem de grupo"
        key={form.key("description")}
        {...form.getInputProps("description")}
      />
      <Select
        label="Categoria de origem"
        description="Obrigatória: é o motivo do empréstimo, e o que aparece nos relatórios"
        data={categories}
        allowDeselect={false}
        searchable
        key={form.key("categoryId")}
        {...form.getInputProps("categoryId")}
      />
      <Group grow align="flex-start">
        <NumberInput
          label={card ? "Valor total" : "Valor"}
          description={card ? "O valor cheio, não o da parcela" : undefined}
          decimalScale={2}
          min={0}
          thousandSeparator="."
          decimalSeparator=","
          key={form.key("amount")}
          {...form.getInputProps("amount")}
        />
        {locked ? (
          <TextInput
            label="Moeda"
            description="Imutável"
            value={CURRENCY_LABELS[locked.currency]}
            disabled
          />
        ) : (
          <Select
            label="Moeda da dívida"
            data={CURRENCY_OPTIONS}
            allowDeselect={false}
            key={form.key("currency")}
            {...form.getInputProps("currency")}
          />
        )}
      </Group>
      <Select
        label={isLent ? "De onde o dinheiro saiu" : "Onde o dinheiro entrou"}
        description={
          needsConversion
            ? `A dívida está em ${currency} e o destino se move em ${destinationCurrency}`
            : "Conta move o saldo na hora; cartão entra na fatura"
        }
        data={targetData}
        allowDeselect={false}
        searchable
        key={form.key("target")}
        {...form.getInputProps("target")}
        onChange={(value) => {
          form.getInputProps("target").onChange(value);

          // Cartão escolhido some: parcelamento não existe em conta.
          if (value && !value.startsWith(TARGET_CARD_PREFIX)) {
            form.setFieldValue("installments", 1);
          }
        }}
      />
      {card && (
        <NumberInput
          label="Parcelas"
          description={
            installmentPreview ??
            `Divide a origem em faturas consecutivas (até ${MAX_INSTALLMENTS})`
          }
          min={1}
          max={MAX_INSTALLMENTS}
          allowDecimal={false}
          key={form.key("installments")}
          {...form.getInputProps("installments")}
        />
      )}
      {card && date && (
        <Text size="sm" c="dimmed">
          {describeTargetInvoices(card, date, installments)}
        </Text>
      )}
      <Group grow align="flex-start">
        <DatePickerInput
          label="Data"
          valueFormat="DD/MM/YYYY"
          key={form.key("date")}
          {...form.getInputProps("date")}
        />
        <DatePickerInput
          label="Vencimento"
          description="Opcional"
          placeholder="Sem prazo"
          valueFormat="DD/MM/YYYY"
          clearable
          key={form.key("dueDate")}
          {...form.getInputProps("dueDate")}
        />
      </Group>
      {showManualFx && (
        <>
          <Alert color="yellow" icon={<TriangleAlert size={16} />} title="Taxa de câmbio manual">
            <Text size="sm">
              O serviço de câmbio está indisponível. Informe a taxa de {currency} para{" "}
              {destinationCurrency}.
            </Text>
          </Alert>
          <NumberInput
            label="Taxa de câmbio"
            decimalScale={4}
            min={0}
            key={form.key("manualFxRate")}
            {...form.getInputProps("manualFxRate")}
          />
        </>
      )}
    </>
  );
}
```

`describeTargetInvoices` existe em `CardPurchaseFields.tsx` como função local. **Não copie:** ela formata texto de UI a partir do ciclo do cartão, então mova para `src/components/forms/invoiceHint.ts` e importe nos dois arquivos. Não vai para `src/lib/invoiceCycle.ts`, que é lógica pura de datas e não formata nada. Leia a implementação atual com:

```bash
sed -n '/function describeTargetInvoices/,/^}/p' src/components/forms/CardPurchaseFields.tsx
```

- [ ] **Step 4: Atualizar os dois botões**

Em `AddDebtButton.tsx`: a prop `cards: CardOption[]` entra; `initialValues` troca `accountId` por `target` e ganha `installments: 1`; `validate: zod4Resolver(debtSchema)` vira `validate: validateDebt`; e o `onSubmit` precisa do `transformValues` para converter `target` antes de chamar a action:

```tsx
  const form = useForm<DebtFormValues>({
    mode: "uncontrolled",
    initialValues,
    validate: validateDebt,
    transformValues: (values) => ({ ...values, ...splitTarget(values.target) }),
  });
```

`initialValues.target` parte da primeira conta:

```tsx
    target: accounts[0] ? `${TARGET_ACCOUNT_PREFIX}${accounts[0].value}` : "",
    installments: 1,
```

O `disabled` do botão passa a aceitar cartão como alternativa à conta:

```tsx
        disabled={people.length === 0 || (accounts.length === 0 && cards.length === 0) || categories.length === 0}
```

Em `EditDebtButton.tsx`: mesma troca de `validate` e `transformValues`, prop `cards`, e uma prop nova `originLocked: boolean` que desabilita o botão com tooltip:

```tsx
      <IconButton
        label={
          originLocked
            ? "A origem desta dívida está em uma fatura paga"
            : "Editar dívida"
        }
        onClick={handleOpen}
        disabled={originLocked}
      >
```

Confirme que `IconButton` aceita `disabled`; se não, envolva em `Tooltip` do Mantine como a `TransactionsTable` faz.

- [ ] **Step 5: Typecheck e conserto dos chamadores**

```bash
npm run typecheck
```

As duas telas de dívida vão acusar prop faltando — é a Task 14.

- [ ] **Step 6: Portão e commit**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add src/lib/managedBy.ts src/lib/creditCards.ts src/components/
git commit -m "feat(debts): choose account or card as origin in the debt form"
```

---

## Task 14: telas de dívida e de cartão

**Files:**
- Modify: `src/app/dashboard/debts/page.tsx`
- Modify: `src/app/dashboard/debts/[id]/page.tsx`
- Modify: `src/app/dashboard/cards/[id]/page.tsx`

**Interfaces:**
- Consumes: `DebtListItem`/`DebtMovement` (Task 9), `InvoiceItem.debtId` (Task 10), `DebtFormValues`/`validateDebt` (Task 13), `listCreditCardOptions` (Task 13), `MANAGED_BY_LABEL` (Task 13).
- Produces: nada.

**Contexto:** `page.tsx` só lê; quem escreve é o client component em `src/components/forms/`. Leia [.github/skills/ui-validation](../../../.github/skills/ui-validation) — typecheck, build e axe **não** cobrem os fluxos nem as armadilhas de Server Components, então esta tarefa termina no navegador.

- [ ] **Step 1: `toFormValues` monta o destino codificado**

Em `src/app/dashboard/debts/page.tsx`:

```tsx
/**
 * Valores iniciais do formulário de edição, a partir da dívida gravada.
 *
 * O destino e a data vêm da **movimentação de origem**, não de um palpite:
 * salvar sem mexer nesses campos precisa deixar o lançamento exatamente onde
 * ele está.
 */
function toFormValues(debt: DebtListItem, fallbackTarget: string): DebtFormValues {
  return {
    personId: debt.personId,
    categoryId: debt.categoryId,
    type: debt.type,
    description: debt.description,
    amount: debt.originalAmount,
    currency: debt.currency,
    target: debt.originTarget
      ? joinTarget(
          debt.originTarget.kind === "account" ? debt.originTarget.id : null,
          debt.originTarget.kind === "card" ? debt.originTarget.id : null,
        )
      : fallbackTarget,
    installments: debt.originInstallments,
    date: toCalendarDate(debt.originDate ?? debt.createdAt),
    dueDate: debt.dueDate ? toCalendarDate(debt.dueDate) : "",
    manualFxRate: undefined,
  };
}
```

Importe `joinTarget` e `TARGET_ACCOUNT_PREFIX` de `@/lib/paymentTarget`.

- [ ] **Step 2: Carregar os cartões e ajustar o pré-requisito**

No `Promise.all` da página, acrescente `listCreditCardOptions(user.id)`. E o aviso de pré-requisito passa a aceitar cartão:

```tsx
  const missing = [
    people.length === 0 ? "uma pessoa" : null,
    options.accounts.length === 0 && cards.length === 0 ? "uma conta ou um cartão" : null,
    options.categories.length === 0 ? "uma categoria" : null,
  ].filter((entry) => entry !== null);
```

Passe `cards={cards}` ao `AddDebtButton` e ao `EditDebtButton`, e `originLocked={debt.originLocked}` ao `EditDebtButton`. O `fallbackTarget` é `options.accounts[0] ? \`${TARGET_ACCOUNT_PREFIX}${options.accounts[0].value}\` : ""`.

- [ ] **Step 3: Mostrar a origem na listagem**

Na linha de cada dívida, ao lado da categoria, um `Text size="sm" c="dimmed"` com a origem:

```tsx
{debt.originCardName && (
  <Text size="sm" c="dimmed">
    {debt.originCardName}
    {debt.originInstallments > 1 && ` · ${debt.originInstallments}x`}
  </Text>
)}
```

E onde há `DeleteEntityButton` da dívida, desabilite quando `debt.originLocked`, com a mesma explicação do tooltip. Confira a API do `DeleteEntityButton` (`sed -n '1,60p' src/components/forms/DeleteEntityButton.tsx`) antes de escolher entre `disabled` e envolver em `Tooltip`.

- [ ] **Step 4: Repetir na tela de detalhe**

Em `src/app/dashboard/debts/[id]/page.tsx`: carregar os cartões, passar `cards` e `originLocked`, montar `target` do mesmo jeito, e nas linhas de movimentação mostrar cartão e parcela onde hoje mostra o nome da conta:

```tsx
{movement.cardName
  ? `${movement.cardName}${movement.installmentNumber ? ` · ${movement.installmentNumber}/${movement.totalInstallments}` : ""}`
  : movement.accountName}
```

- [ ] **Step 5: Badge "Dívida" na tela do cartão**

Em `src/app/dashboard/cards/[id]/page.tsx`, onde hoje há `EditCardPurchaseButton` + `DeleteEntityButton` (por volta da linha 364), envolver numa condicional:

```tsx
{item.debtId ? (
  <Tooltip label={MANAGED_BY_LABEL.debt.hint}>
    <span>
      <LinkButton href={`/dashboard/debts/${item.debtId}`} size="compact-xs" variant="light">
        {MANAGED_BY_LABEL.debt.label}
      </LinkButton>
    </span>
  </Tooltip>
) : (
  <>
    <EditCardPurchaseButton ... />
    <DeleteEntityButton ... />
  </>
)}
```

Mantenha as props existentes dos dois botões exatamente como estão. Importe `Tooltip` do `@mantine/core`, `MANAGED_BY_LABEL` de `@/lib/managedBy` e `LinkButton` de `@/components/ui/AppLink`. Confira a API do `LinkButton` antes (`sed -n '1,60p' src/components/ui/AppLink.tsx`) e use o que ele aceita.

- [ ] **Step 6: Portão, acessibilidade e navegador**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Depois, com banco populado:

```bash
npm run db:seed
npm run dev
```

Em outro terminal:

```bash
npm run test:a11y
```

E abra no navegador, conferindo cada fluxo:

1. `/dashboard/debts` → **Nova dívida** → escolher um cartão em "De onde o dinheiro saiu" → o campo **Parcelas** aparece, a prévia da divisão e a dica de faturas de destino batem com o esperado → salvar.
2. Trocar o tipo para "Peguei emprestado" → o grupo "Cartões" desaparece do `Select`.
3. `/dashboard/cards/<id>` → a origem da dívida aparece na fatura com o badge **Dívida**, sem botão de editar nem de apagar, e o link leva à dívida.
4. Editar essa dívida trocando o cartão por uma conta → o saldo da conta muda e a fatura desaparece da tela do cartão (é a revalidação da Task 10 que faz isso aparecer sem recarregar).
5. Pagar a fatura e então tentar editar a dívida → botão desabilitado com o tooltip; forçar pela action deve devolver a mensagem de recusa, não um erro genérico.

- [ ] **Step 7: Commit**

```bash
git add src/app/
git commit -m "feat(debts): show and edit card origin across debt and card screens"
```

---

## Self-review deste plano

**Cobertura da spec, seção por seção:**

| Seção da spec | Tarefa |
|---|---|
| §1 escopo e exclusões | Global Constraints + Task 4 (`refine` de `LENT`) |
| §2 modelo de dados, §2.1 migration, §2.2 grupo derivado | Tasks 1, 2, 9 |
| §3 RN-05.5 | Task 2 |
| §4 validação | Task 4 |
| §5.1 `debtOrigin.ts` | Tasks 5, 6 |
| §5.2 `createDebt` | Task 6 |
| §5.3 `updateDebt`, 4 transições | Task 7 |
| §5.4 `deleteDebt` | Task 8 |
| §5.5 `deleteSettlement` | Nenhuma mudança de lógica — a comparação é por tipo. Coberto pelo teste existente "recusa remover a movimentação de origem por esse caminho", que a Task 6 exercita com origem em cartão |
| §5.6 `settleDebt` | Inalterado; Task 6 tem o teste de amortização de dívida originada no cartão |
| §6.1 `DebtListItem`, §6.2 `getDebtDetail` | Task 9 |
| §6.3 `InvoiceItem` e tela do cartão | Tasks 10, 13, 14 |
| §6.4 impacto de remoção | Task 11 |
| §6.5 revalidação | Task 10 |
| §7 MCP | Task 12 |
| §8 UI | Tasks 13, 14 |
| §9 testes 1-13 | Distribuídos: 1-3 e 9 na Task 6; 4-6 na Task 7; 7 nas Tasks 7 e 8; 8 na Task 8; 10 na Task 6; 11 na Task 10; 12 na Task 11; 13 na Task 1 |
| §10 ordem de execução | Ordem das tarefas, com a UI ao fim |
| §11 riscos | Cada um tem tarefa: fatura paga (7, 8), tela do cartão (10), revalidação (10), `P2028` (6), origem `PENDING` (7), agente cego (12) |

**Um desvio deliberado da spec:** a spec listava `deleteSettlement` como precisando de ajuste de comentário. Ficou fora como tarefa própria porque não há mudança de comportamento a testar — se o executor da Task 6 quiser ajustar o comentário de "a movimentação" para "o grupo", cabe no commit dela.

**Descoberta que a spec não registrava:** `resolveInvoice` (`src/lib/invoices.ts:56`) **já recusa fatura paga** e já devolve a fatura travada. Ela é backstop de `createOrigin` no destino novo; `assertOriginEditable` continua necessária porque cobre o grupo **antigo** — apagar uma parcela de fatura paga —, que `resolveInvoice` não vê. A Task 6, Step 3 diz para não replicar a guarda.
