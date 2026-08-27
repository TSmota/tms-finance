# Cartão como origem de empréstimo

Data: 2026-08-27 · Regra nova: **RN-05.5**

Hoje toda dívida nasce de uma movimentação em conta bancária. Esta spec
acrescenta o cartão de crédito como origem alternativa, com parcelamento, e
torna a origem editável entre conta e cartão numa dívida já registrada.

---

## 1. Escopo

### No escopo

- Registrar dívida `LENT` cuja origem é uma compra no cartão, à vista ou em N
  parcelas.
- Editar uma dívida existente trocando a origem entre conta e cartão, nos dois
  sentidos, e trocando o número de parcelas.
- Recusar, com mensagem, o que a RN-03.5 já proíbe: mexer em lançamento que
  esteja em fatura paga.
- Impedir que a origem de uma dívida seja editada ou apagada pela tela do
  cartão, onde os serviços de compra não conhecem `Debt.remainingAmount`.

### Fora do escopo, e por quê

- **`BORROWED` com origem em cartão.** `recalcInvoiceTotal`
  ([src/lib/invoices.ts](../../../src/lib/invoices.ts)) soma `convertedAmount`
  de tudo que não é `INVOICE_PAYMENT`, **sem sinal**. A origem de um `BORROWED`
  é `INCOME`; no cartão ela aumentaria o total da fatura em vez de reduzi-lo.
  Suportar isso exigiria dar sinal ao total da fatura — mudança que atinge
  pagamento de fatura, limite disponível e relatórios — sem caso de uso real:
  dinheiro que uma pessoa empresta ao usuário entra numa conta, não num cartão.
- **Amortização lançada no cartão.** Pela mesma razão de sinal, e porque
  dinheiro que volta de um empréstimo chega ao bolso do usuário, não à fatura.
  `debtSettlementSchema.accountId` continua obrigatório.

---

## 2. Modelo de dados

**Nenhuma coluna nova.** `Debt` não guarda a origem: quem a guarda é a
`Transaction` vinculada por `debtId`, e ela já tem `accountId` e `creditCardId`
sob o XOR de `transactions_payment_target_check`. Uma origem no cartão já é uma
linha legal hoje; o que falta é o serviço saber criá-la e substituí-la.

O parcelamento também já está representado: `installmentNumber`,
`totalInstallments` e `parentInstallmentId` existem em `Transaction` e são
usados por `cardPurchases.ts` exatamente com esta semântica.

### 2.1 Migration: uma `CHECK` nova

```sql
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

A constraint é exatamente a invariante de **sinal**, e não a regra "cartão só
origina `LENT`" — essa é mais estreita e o banco não tem como expressá-la: o
tipo da dívida não está na linha da transação. Uma amortização de `BORROWED` é
`EXPENSE` e passaria pela `CHECK`; quem a barra é o `debtSettlementSchema`, que
exige `accountId`. A `CHECK` cobre o que importa ao banco — nenhuma linha de
dívida no cartão pode somar na direção errada.

Satisfeita por todos os dados existentes: `createDebt` é o único caminho que
grava `debtId`, e hoje ele sempre grava `accountId`. `ADD CONSTRAINT` valida as
linhas existentes, então a migration falha em vez de corromper caso essa
premissa não valha em produção — conferir antes do deploy.

`tests/integration/schema.test.ts` tem um teste que afirma a **lista completa**
das `CHECK` escritas à mão (`schema.test.ts:37`, "mantém as CHECK constraints
escritas à mão nas migrations"). A constraint nova entra nessa lista no mesmo
commit, ou a suíte quebra.

### 2.2 O grupo de origem é derivado, não marcado

Origem e amortização de uma dívida têm **sempre** tipos opostos —
`originType(type)` e `settlementType(type)` em
[src/lib/debts.ts](../../../src/lib/debts.ts). Logo:

> **grupo de origem** = todas as transações com aquele `debtId` cujo `type` é
> `originType(debt.type)`.

Não é preciso coluna `is_origin`: ela gravaria o que o tipo já diz, numa tabela
que é a mais escrita do sistema. As parcelas do grupo se reconhecem entre si por
`parentInstallmentId`, como em qualquer compra de cartão.

Isso substitui a heurística atual — "a **primeira** movimentação do tipo da
origem" — que aparece em `toListItem`, `getDebtDetail` e `deleteSettlement`, e
que passa a estar errada assim que a origem tem mais de uma linha.

---

## 3. Regra de negócio

Acrescentar a `docs/business-rules.md`, na seção RN-05:

> - **RN-05.5 (Origem em conta ou cartão):** a movimentação que origina a dívida
>   sai de uma conta bancária **ou** entra numa fatura de cartão — exatamente
>   uma das duas. No cartão ela é uma compra como qualquer outra: cai na fatura
>   da sua competência (RN-03.2), pode ser dividida em parcelas sequenciais
>   (RN-03.3) e não altera saldo de conta nenhum até a fatura ser paga. Só a
>   dívida do tipo `LENT` aceita origem em cartão — a origem de `BORROWED` é uma
>   entrada, e o total da fatura não tem sinal. Enquanto qualquer parcela da
>   origem estiver em fatura paga, a dívida não é editada nem removida
>   (RN-03.5). A **amortização** é sempre em conta, dos dois tipos.

---

## 4. Validação

[src/lib/validations.ts](../../../src/lib/validations.ts) — fonte única do
formulário e do MCP.

```ts
export const debtSchema = z
  .object({
    personId: idSchema,
    categoryId: idSchema,
    type: z.enum(DEBT_TYPE_CODES, { message: "Tipo de dívida inválido" }),
    description: requiredText(TEXT_LIMITS.description, "Descrição é obrigatória"),
    amount: positiveAmountSchema,
    currency: currencySchema,
    /** Origem do dinheiro: exatamente um dos dois. */
    accountId: optionalIdSchema,
    creditCardId: optionalIdSchema,
    /** Só no cartão: divide a origem em parcelas sequenciais (RN-03.3). */
    installments: z.coerce
      .number()
      .int("O número de parcelas deve ser inteiro")
      .min(1, "Mínimo de 1 parcela")
      .max(MAX_INSTALLMENTS, `Máximo de ${MAX_INSTALLMENTS} parcelas`)
      .default(1),
    date: calendarDateSchema,
    dueDate: optionalCalendarDateSchema,
    // Copiado sem alteração do `debtSchema` atual: `validations.ts` repete a
    // cadeia em cada schema em vez de nomear uma const.
    manualFxRate: z.coerce
      .number()
      .positive("A taxa de câmbio deve ser positiva")
      .optional()
      .nullable(),
  })
  .refine((value) => (value.accountId === null) !== (value.creditCardId === null), {
    message: "Escolha a origem: conta bancária ou cartão de crédito",
    path: ["accountId"],
  })
  .refine((value) => value.creditCardId === null || value.type === "LENT", {
    message: "Só empréstimo feito pelo usuário pode ter origem no cartão",
    path: ["creditCardId"],
  })
  .refine((value) => value.installments === 1 || value.creditCardId !== null, {
    message: "Parcelamento só existe na origem em cartão",
    path: ["installments"],
  });
```

Três notas de consequência:

- `debtSchema` deixa de ser `ZodObject`. `updateDebtArgs = z.object({ id, data:
  debtSchema })` continua válido — é o mesmo arranjo que
  `recurringExpenseSchema` já usa, e a razão está documentada em
  [src/mcp/tools/write.ts](../../../src/mcp/tools/write.ts).
- O `zod4Resolver(debtSchema)` direto nos formulários deixa de servir, porque a
  tela terá um campo `target` que o schema não conhece. Ver §6.1.
- `installments` com `.default(1)` mantém compatível qualquer chamada MCP
  existente que não informe o campo.

---

## 5. Serviço

### 5.1 Módulo novo: `src/lib/debtOrigin.ts`

`debts.ts` já tem ~600 linhas e é dono de duas invariantes densas (o par
`remainingAmount`/`status` e o lock por linha). A origem passa a ser uma coisa
de duas formas, com quatro pontos de uso — criar, editar, apagar a dívida e
recusar apagar como amortização. Ela ganha módulo próprio, e `debts.ts` volta a
tratar só das suas invariantes.

Superfície, toda recebendo o `Tx` de quem abriu a `$transaction`:

| Função | Papel |
|---|---|
| `loadOrigin(userId, debt)` | Grupo de origem gravado, com destino resolvido (`{kind: "account" \| "card", id}`), data, nº de parcelas, ids de fatura e se alguma está paga. Fora da `$transaction`: é leitura para decidir. |
| `assertOriginEditable(origin)` | `InvalidOperationError` quando qualquer parcela está em fatura paga (RN-03.5). |
| `createOrigin(tx, {userId, debt, input, date, rate})` | Cria o grupo no destino de `input` e devolve as transações mais as faturas tocadas. Aplica saldo (conta) ou recalcula faturas (cartão). |
| `deleteOrigin(tx, origin)` | Apaga o grupo, estornando saldo (conta) ou recalculando faturas (cartão). |

`rate` chega **resolvido**, nunca buscado aqui: `getExchangeRate` é rede, e
ARCHITECTURE §4 ("Rede fora da transação") proíbe chamá-la com a `$transaction`
aberta — uma cotação lenta prenderia o lock da dívida e das faturas.

`createOrigin` no cartão é `createCardPurchase` sem a parte de recorrência:
`splitInstallments` → `invoiceCompetencyFor` → `consecutiveCompetencies` →
`resolveInvoice` por parcela → `recalcInvoiceTotals` uma vez no fim. A divisão
vem de `splitInstallments` (RF-2 do AGENTS.md), nunca reimplementada.

O `status` da transação de origem em conta é **carregado** do grupo antigo ao
recriar. Hoje `createDebt` só cria `CONFIRMED` e `transactionSchema` não aceita
`debtId`, então origem `PENDING` não é alcançável — mas `debts.ts` já a trata por
precaução em três lugares, e recriar sem preservar o campo transformaria essa
precaução em bug silencioso.

### 5.2 `createDebt`

Passa a resolver o destino antes do câmbio: a taxa converte a moeda da dívida
para a moeda **da conta ou do cartão**, conforme o caso. Depois de criar a
`Debt`, delega a origem a `createOrigin`. Continua tudo numa `$transaction`
(RF-5), agora com `INSTALLMENT_TX_OPTIONS` quando o destino é cartão — uma
origem no teto de `MAX_INSTALLMENTS` faz centenas de idas ao banco, e o timeout
default de 5 s do Prisma daria `P2028`.

### 5.3 `updateDebt` — as quatro transições

**Sempre apaga o grupo de origem e recria.** É a mesma decisão, e a mesma
justificativa, de `updateCardPurchase`: o número de parcelas, a data e o cartão
podem mudar, e cada uma dessas mudanças redistribui as parcelas por outras
faturas; casar linha por linha seria mais código para o mesmo resultado. Os ids
das linhas de origem mudam, e nada fora da dívida os referencia.

Um caminho único cobre as quatro transições:

| De | Para | O que acontece |
|---|---|---|
| conta | conta | estorna o saldo antigo, apaga, recria, aplica o novo |
| conta | cartão | estorna o saldo, apaga, cria N parcelas nas faturas, recalcula |
| cartão | conta | recusa se houver fatura paga; apaga o grupo, recalcula (fatura que ficou vazia é apagada por `recalcInvoiceTotal`), cria a transação, aplica saldo |
| cartão | cartão | recusa se houver fatura paga; apaga, recria; recalcula a **união** das faturas antigas e novas |

O que permanece de `updateDebt`: `type` e `currency` seguem imutáveis, e o novo
`originalAmount` continua não podendo ficar abaixo do já amortizado. A ordem de
lock do módulo — dívida primeiro, movimentação depois — é preservada.

`assertOriginEditable` roda antes de abrir a `$transaction`, para dar mensagem em
vez de erro de constraint.

### 5.4 `deleteDebt`

Ganha o mesmo portão: recusa quando qualquer parcela de origem está em fatura
paga — o dinheiro já saiu pelo total antigo, e apagar deixaria `total_amount`
menor que o valor pago com a fatura ainda `PAID`. É palavra por palavra a razão
de `deleteCardPurchase`.

Depois de apagar as movimentações, recalcula as faturas tocadas. Hoje a função
só estorna saldos, porque só havia origens em conta.

### 5.5 `deleteSettlement`

A recusa "esta é a movimentação que originou a dívida" hoje compara o `type` da
linha com `originType(debt.type)` — e continua correta com N parcelas, porque a
comparação é por tipo, não por posição. Nenhuma mudança de lógica; só o
comentário passa a dizer "o grupo de origem" no lugar de "a movimentação".

### 5.6 `settleDebt`

Inalterada. A amortização é sempre em conta, e o par de conversões (moeda da
conta e moeda da dívida) não é afetado pela origem.

---

## 6. Leitura

### 6.1 `DebtListItem`

`originAccountId` e `originDate` foram criados para que um "salvar" sem tocar
nesses campos não movesse o lançamento de origem. A necessidade continua, com
mais campos:

```ts
/** Origem gravada, para o formulário de edição reabrir no mesmo destino. */
originTarget: { kind: "account" | "card"; id: string } | null;
/**
 * Mantido: é o `defaultAccountId` do `SettleDebtButton`, a conta para onde o
 * dinheiro tende a voltar. Nulo quando a origem foi no cartão — o botão já cai
 * na primeira conta nesse caso, sem mudança.
 */
originAccountId: string | null;
originDate: Date | null;
/** 1 quando à vista ou em conta. */
originInstallments: number;
/**
 * Verdadeiro quando alguma parcela da origem está em fatura paga: editar e
 * remover são recusados pelo serviço (RN-03.5), e a tela desabilita os dois.
 */
originLocked: boolean;
```

`settlementCount` passa a contar por tipo — `settlements.filter(type ===
settlementType)` — em vez de `_count.settlements - 1`, que só valia com origem de
uma linha. `debtInclude.settlements` já traz `type`; passa a trazer também
`creditCardId`, `installmentNumber`, `totalInstallments` e o `status` da fatura.

### 6.2 `getDebtDetail`

`isOrigin` deixa de ser "a primeira do tipo da origem" e passa a ser
`movement.type === originType(debt.type)`, marcando as N. `DebtMovement` ganha
`creditCardId`, `cardName`, `installmentNumber` e `totalInstallments`, para a
tela poder escrever "Parcela 2/6 · Nubank" onde hoje escreve o nome da conta.

### 6.3 `InvoiceItem` e a tela do cartão

`InvoiceItem` ganha `debtId: string | null`. A tela do cartão
(`src/app/dashboard/cards/[id]/page.tsx`)
troca `EditCardPurchaseButton` + `DeleteEntityButton` por um badge "Dívida" com
link para `/dashboard/debts/<id>`, no mesmo espírito do `managedBy` que a
`TransactionsTable` já usa.

O rótulo e o tooltip desse badge hoje moram em `MANAGED_BY_LABEL`, uma const
**local** de [src/components/TransactionsTable.tsx](../../../src/components/TransactionsTable.tsx)
(linha 34) — não confundir com `MANAGED_ELSEWHERE` de
[src/lib/transactions.ts](../../../src/lib/transactions.ts), que é a mensagem de
**erro do servidor** e não é exportada. Para a tela do cartão usar o mesmo
texto, `MANAGED_BY_LABEL` sai para um módulo próprio sem `"use client"`
(`src/lib/managedBy.ts`, ao lado do `ManagedBy` que `transactions.ts` já
exporta). Copiar o objeto seria a segunda definição do mesmo rótulo.

E, no servidor, `updateCardPurchase` e `deleteCardPurchase` passam a recusar
linha com `debtId`. Esconder o botão não basta: as duas são ferramentas MCP
(`update_card_purchase`, `delete_card_purchase`) e são chamadas sem passar pela
tela. Sem isso, editar a origem por ali deixaria `Debt.remainingAmount` no valor
de antes — exatamente o vazamento que o `managedBy` fecha do lado das contas.

### 6.4 Impacto de remoção

`creditCardImpact` ganha uma entrada `effect: "detach"`: "dívidas que perdem a
movimentação de origem" — `Transaction.creditCard` é `onDelete: Cascade`, então
apagar o cartão apaga a origem e deixa a dívida sem o lançamento que a criou.

A mesma entrada vai para `accountImpact`, onde o buraco **já existe hoje** e não
é relatado. É uma linha, no arquivo que a feature já obriga a abrir; deixar só o
lado do cartão coberto seria relatar metade do risco.

### 6.5 Invalidação de cache

O domínio `debts` de
[src/lib/revalidation.ts](../../../src/lib/revalidation.ts) hoje é
`[DASHBOARD, DEBTS, DEBT_DETAIL, PEOPLE, ACCOUNTS, TRANSACTIONS]` — sem as telas
de cartão, porque nenhuma dívida tocava fatura. Passa a incluir `CARDS` e
`CARD_DETAIL`, exatamente como `recurring` já faz pelo mesmo motivo. Sem isso,
registrar uma dívida no cartão deixa o total da fatura velho na tela até a
próxima escrita de cartão — e o sintoma é indistinguível de um bug de cálculo.

Vale para os dois caminhos de escrita: a tabela é fonte única das actions e do
MCP, então basta o lugar único.

---

## 7. Superfície de agente (MCP)

Nenhuma ferramenta nova, nenhum escopo novo — `debts:write` já cobre.
`create_debt` e `update_debt` herdam o `debtSchema` novo sem alteração, que é o
ponto do arranjo descrito em `src/mcp/tools/write.ts`.

- **Descrições:** `create_debt` passa a explicar o XOR de origem, que
  `creditCardId` exige `type: LENT`, e que `installments` só existe no cartão.
  `update_debt` passa a avisar que a origem pode trocar de conta para cartão e
  vice-versa, e que fatura paga recusa a edição.
- **`debtDto`** ([src/mcp/serializers.ts](../../../src/mcp/serializers.ts)):
  ganha `origin: { kind, id, installments }` e `origin_locked`. Sem isso o
  agente não consegue montar um `update_debt` que preserve a origem, e todo
  "salvar" dele moveria o lançamento.
- **`debtDetailDto`:** os movimentos ganham `installment_number` /
  `total_installments`, como já fazem os itens de fatura.
- O snapshot de serializers (`src/mcp/serializers.test.ts`) muda junto.

---

## 8. UI

### 8.1 `DebtFields`

- O par conta/cartão vira **um** `Select` "Pago com", agrupado em "Contas" e
  "Cartões", codificado por prefixo. Reaproveita `splitTarget`/`joinTarget`.
- **Renomear `src/lib/recurringTarget.ts` para `src/lib/paymentTarget.ts`.** O
  módulo deixa de ser só do recorrente, e o comentário de topo — que explica por
  que ele não é `"use client"` — vale igual. Cinco arquivos mudam:
  `recurring/page.tsx`, `RecurringFields.tsx`, `AddRecurringButton.tsx`,
  `EditRecurringButton.tsx` e o próprio `recurringTarget.test.ts`, que é
  renomeado junto.
- `validateDebt(values)` espelha `validateRecurring`: converte `target` nos dois
  campos antes de chamar `zod4Resolver`, e remapeia o erro do XOR de `accountId`
  para `target`, que é o campo que existe na tela. O `transformValues` do Mantine
  só roda no `onSubmit`, então validar direto veria `target` e nunca
  `accountId`/`creditCardId`.
- Campo **Parcelas** visível só quando o destino é cartão, com a prévia da
  divisão e das faturas de destino que `CardPurchaseFields` já monta —
  `describeSplit` e `consecutiveCompetencies`, a mesma regra que o servidor
  aplica.
- A moeda sugerida e a dica de conversão passam a olhar a moeda do destino
  escolhido, conta ou cartão. `AccountOption` serve aos dois.
- `locked` continua cobrindo `type` e `currency`. Quando `type` é `BORROWED`, o
  grupo "Cartões" não é oferecido.

Para a prévia da fatura o formulário precisa de `closingDay`/`dueDay`:
`listCreditCardOptions` passa a devolver `CardOption[]` em vez de
`AccountOption[]`. Como `CardOption extends AccountOption`, os chamadores atuais
seguem válidos.

### 8.2 Telas

- `debts/page.tsx`: o pré-requisito "uma conta" passa a ser "uma conta ou um
  cartão"; `toFormValues` monta `target` e `installments` a partir de
  `originTarget`/`originInstallments`; a listagem mostra a origem ("Nubank ·
  6x") e desabilita editar/remover com tooltip quando `originLocked`.
- `debts/[id]/page.tsx`: as linhas de origem mostram cartão e parcela.
- `debts/page.tsx` e `debts/[id]/page.tsx` passam a carregar
  `listCreditCardOptions` junto de `loadFormOptions`.

---

## 9. Testes

Integração, em `tests/integration/debts.test.ts` (banco real, via
`tests/setup-db.ts`):

1. **Criar com origem em cartão, à vista** — a origem tem `creditCardId` e
   `invoiceId`, `accountId` nulo, nenhum saldo de conta se moveu, e o
   `totalAmount` da fatura subiu pelo valor convertido.
2. **Criar parcelada em 3x** — três linhas, `installmentNumber` 1..3 com a
   mesma `date`, ancoradas por `parentInstallmentId`, em competências
   consecutivas a partir de `invoiceCompetencyFor`; a soma das parcelas é
   exatamente `originalAmount`.
3. **`BORROWED` com cartão é recusado** — pelo `refine`, com a mensagem, antes
   de tocar o banco.
4. **conta → cartão** — saldo da conta volta ao que era, faturas passam a
   existir com o total certo.
5. **cartão → conta** — faturas recalculadas, a que ficou sem lançamento é
   apagada, saldo da conta aplicado uma única vez.
6. **cartão → cartão, 3x → 6x** — as três faturas antigas são recalculadas (e
   as vazias apagadas) e as seis novas ficam corretas.
7. **fatura paga recusa** — `updateDebt` e `deleteDebt` levantam
   `InvalidOperationError` quando uma parcela da origem está em fatura paga; o
   estado da dívida e da fatura fica intacto.
8. **`deleteDebt` com origem em cartão** — as N parcelas saem, as faturas são
   recalculadas, nenhum saldo de conta se move.
9. **Amortizar dívida de origem cartão** — a amortização entra em conta,
   `remainingAmount` e `status` acompanham, a fatura não é tocada.
10. **`deleteSettlement` recusa qualquer parcela de origem** — não só a
    primeira.
11. **`updateCardPurchase`/`deleteCardPurchase` recusam a origem de dívida** —
    em `tests/integration/cardPurchases.test.ts`.
12. **Impacto de remoção** — cartão e conta relatam as dívidas que perderiam a
    origem, em `tests/integration/deletionImpact.test.ts`.
13. **A `CHECK` nova** — em `tests/integration/schema.test.ts`: um teste que
    tenta inserir `INCOME` com `debtId` e `creditCardId` e espera erro do banco,
    **mais** a constraint acrescentada à lista afirmada em `schema.test.ts:37`.

Unitários:

- `debtSchema`: os três `refine`, incluindo `installments` default 1.
- `paymentTarget`: `splitTarget`/`joinTarget` (renomear o teste existente).
- `validateDebt`: remapeia o erro do XOR para `target`.
- `src/mcp/serializers.test.ts`: a fixture `debt` (linhas 102-120) troca
  `originAccountId`/`originDate` pelos campos novos, e os snapshots `debts` e
  `debtDetail` acompanham.

---

## 10. Ordem de execução

Cada passo deixa o portão de qualidade verde (`npm run typecheck && npm run lint
&& npm test && npm run build`), com `npm run dev` parado antes da suíte. As
skills de [.github/skills/](../../../.github/skills/) valem por passo:
`prisma-migration` no 1, `financial-rules` no 2 e no 5, `mcp-agent-surface` no 8,
`ui-validation` no 9-10 e `quality-gate` em todos.

1. Migration com a `CHECK`, a lista de `schema.test.ts:37` e o teste novo.
2. `docs/business-rules.md` (RN-05.5) e `ARCHITECTURE.md`: uma subseção em §6
   (Modelo de dados) registrando por que o grupo de origem é **derivado do
   tipo** e não marcado por coluna, e a linha de `revalidation` de §1 se a
   tabela "Onde mexer" precisar.
3. `paymentTarget.ts` (renomeio) e `debtSchema` + testes unitários.
4. `debtOrigin.ts` + refatoração de `debts.ts` para delegar, com origem só em
   conta — comportamento idêntico ao de hoje, testes existentes verdes.
5. Origem em cartão em `createOrigin`/`deleteOrigin`, e as quatro transições em
   `updateDebt`; testes 1..10.
6. Portões de fatura paga em `updateCardPurchase`/`deleteCardPurchase`,
   `InvoiceItem.debtId` e `revalidation.ts` (§6.5); testes 11.
7. `deletionImpact`; teste 12.
8. Serializers e descrições do MCP.
9. UI: `managedBy.ts` extraído, `DebtFields`, telas de dívida, tela do cartão.
10. `npm run test:a11y` e conferência no navegador das três telas alteradas
    (dívidas, detalhe da dívida, detalhe do cartão) — typecheck, build e axe não
    cobrem os fluxos nem as armadilhas de Server Components.

---

## 11. Riscos

| Risco | Contenção |
|---|---|
| Origem de dívida editada pela tela do cartão corrompe `remainingAmount` | Recusa no serviço, não só na UI: o MCP chama direto (§6.3) |
| Fatura paga fica com `total_amount` menor que o valor pago | `assertOriginEditable` em `updateDebt` e `deleteDebt` (§5.3, §5.4) |
| Fatura órfã de zero depois de mover a origem para outro mês | `recalcInvoiceTotal` já apaga fatura sem lançamento; a união das faturas antigas e novas é recalculada (§5.3) |
| `P2028` numa origem com muitas parcelas | `INSTALLMENT_TX_OPTIONS`, como em `cardPurchases.ts` (§5.2) |
| Origem `PENDING` perdida no apaga-e-recria | `status` carregado do grupo antigo (§5.1) |
| Agente sobrescreve a origem num `update_debt` cego | `debtDto.origin` expõe o destino gravado (§7) |
| Total de fatura velho na tela depois de escrever uma dívida | `debts` passa a revalidar `CARDS` e `CARD_DETAIL` (§6.5) |
| Origem de dívida apagada em silêncio ao remover o cartão | Relatada em `creditCardImpact`; o cascade continua, mas deixa de ser invisível (§6.4) |
