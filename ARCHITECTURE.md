# TMS Finance — decisões técnicas, padrões e regras

Este documento registra decisões técnicas que não ficam evidentes no código:
contratos entre camadas, invariantes e alternativas que falham.

Escopo e precedência:

| Documento | O que manda |
| --- | --- |
| [docs/business-rules.md](docs/business-rules.md) | O domínio: RN-01 a RN-05. É a fonte de verdade do *o quê*. |
| [prisma/schema.prisma](prisma/schema.prisma) + `prisma/migrations/*/migration.sql` | O modelo de dados e as `CHECK`. Nenhuma regra aqui sobrepõe uma constraint de lá. |
| [AGENTS.md](AGENTS.md) | As 5 regras financeiras críticas, o portão de qualidade e o aviso sobre a versão do Next.js. |
| **Este arquivo** | O *como*: camadas, padrões, armadilhas conhecidas. |
| [.github/skills/](.github/skills/) | Procedimento por tarefa. Não contém regra própria: aponta para a regra daqui. |
| [README.md](README.md) | Subir e configurar o projeto. Não decide nada sobre o código. |

Afirmação factual perde para o código, qualquer que seja o documento. A tabela
ordena assuntos, não verdade; divergências são corrigidas no mesmo commit.
TypeScript não cita este documento nem as RN. O SQL de migrations pode citar RN
porque é append-only (Convenções de código).

---

## 1. Três camadas

A separação mantém regras de negócio testáveis sem depender do Next.

```text
src/app/**/page.tsx      Server Component: lê (requireUser + serviços), renderiza
src/actions/<domínio>.ts Casca fina: auth → zod → serviço → revalidate → ActionResult
src/lib/<domínio>.ts     Serviço: regra de negócio + Prisma. É aqui que os testes batem.
```

**Regras da camada de serviço** (`src/lib/`):

- Recebe `userId` **explícito** como primeiro parâmetro. Nunca chama `auth()`.
- Não conhece `revalidatePath`, `redirect` nem o formato de resposta da UI.
- Lança os erros de [src/lib/errors.ts](src/lib/errors.ts). Não devolve `{ ok:
  false }`.
- Toda consulta é escopada por `userId`. Um recurso de outro usuário deve ser
  indistinguível de um inexistente — os dois viram `NotFoundError`, de
  propósito.
- As guardas de posse moram em [src/lib/ownership.ts](src/lib/ownership.ts)
  (`requireAccount`, `assertAccountOwned`, `assertCategoryOwned`,
  `assertPersonOwned`). Serviços não as reimplementam.

Única exceção: [src/lib/session.ts](src/lib/session.ts) chama `auth()` e
`redirect()`, porque **é** o módulo de sessão. Nenhum outro módulo de `src/lib`
pode fazer isso.

### Serviço de entrada e helper de transação

`src/lib/` expõe dois tipos de função:

- **Serviço de entrada** — recebe `userId` primeiro, é chamado por actions e
  ferramentas MCP e abre o `$transaction`.
- **Helper de transação** — recebe `tx: Tx` primeiro e **nenhum** `userId`. Roda
  dentro de uma transação, sobre linhas cuja posse o serviço já conferiu.

Os helpers exportados são `applyToBalance` e `lockTransaction` em
[src/lib/accountBalance.ts](src/lib/accountBalance.ts); `resolveInvoice`,
`recalcInvoiceTotal` e `recalcInvoiceTotals` em
[src/lib/invoices.ts](src/lib/invoices.ts).

**Helper de transação nunca é ponto de entrada:** chamá-lo direto pula a
checagem de posse. Helper novo com `tx` primeiro entra nesta lista ou permanece
privado do módulo.

### Onde mexer, por tarefa

| Tarefa | Comece por |
| --- | --- |
| Campo novo num formulário | [src/lib/validations.ts](src/lib/validations.ts) → `<domínio>Fields.tsx` → `data` de **cada** escrita do serviço → [src/mcp/serializers.ts](src/mcp/serializers.ts) |
| Regra de negócio nova | `src/lib/<domínio>.ts`, e a `CHECK` na migration se ela for invariante |
| Ferramenta MCP nova | [src/mcp/scopes.ts](src/mcp/scopes.ts) → `src/mcp/tools/<tipo>.ts` com `defineTool` → `tests/integration/mcp/registry.test.ts` acusa o esquecimento |
| Tela nova | `page.tsx` só lê; o botão que escreve é um client component em `src/components/forms/` |
| Remoção com cascata | [src/lib/deletionImpact.ts](src/lib/deletionImpact.ts) + o `*DeletionBlocker` do serviço; a UI usa `DeleteEntityButton` |
| Invalidação de cache | [src/lib/revalidation.ts](src/lib/revalidation.ts), fonte única de action e MCP |
| Conversão de moeda | [src/lib/fxService.ts](src/lib/fxService.ts): `getExchangeRate` para um par, `resolveRatesToBase` para vários |
| Coluna ou índice | `prisma/schema.prisma` + migration à mão para a `CHECK` |
| Texto de erro ao usuário | [src/lib/errors.ts](src/lib/errors.ts); a tradução para a UI é só em `src/actions/guard.ts` |

**Regras da camada de action** (`src/actions/`):

```ts
export async function createX(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = xSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const result = await runAction(() => service.createX(user.id, parsed.data));

  if (result.ok) revalidateAll();

  return result;
}
```

Esse é o formato inteiro. Se uma action tem `if` de regra de negócio, a regra
está no lugar errado.

`input: unknown` e não um tipo: os argumentos de uma server action vêm da rede e
podem ser qualquer coisa. Tipar a entrada daria uma falsa garantia — o
`safeParse` é a garantia real.

[src/actions/guard.ts](src/actions/guard.ts) é a única fronteira entre erro de
domínio e `ActionResult` e repassa o `redirect()` do Next (`NEXT_REDIRECT`).

---

## 2. Dinheiro

**Regra 1: `number` nunca participa de operação monetária.** Toda aritmética
passa por [src/lib/money.ts](src/lib/money.ts), com `Prisma.Decimal`.

`number` é permitido em exatamente dois lugares:

- **Borda de entrada:** o `NumberInput` do Mantine emite `number`; o Zod o
  valida e o serviço o converte imediatamente.
- **Borda de saída:** os `*ListItem` que alimentam a renderização usam
  `Number(...)`, porque `formatCurrency` recebe `number`. Esses mappers são o
  fim da linha: nada soma depois deles.

Toda escrita no banco passa por `toStorage()`, que devolve **string** com 2
casas para que o valor não passe por float até o Postgres.

**Regra 2: o resto dos centavos vai na primeira parcela.** A aritmética mora em
[src/lib/installmentSplit.ts](src/lib/installmentSplit.ts) (`splitCents`,
centavos inteiros) para a prévia funcionar no cliente sem importar Prisma.
[src/lib/installments.ts](src/lib/installments.ts) é a porta do servidor:
`splitInstallments` valida o número de parcelas, o teto de `MAX_INSTALLMENTS` e
o total mínimo — parcela de zero centavo `transactions_positive_amounts_check`
recusa — converte de e para `Decimal`, e **delega**. Chamar `splitCents` direto
no servidor pula as três validações.

Invariante: **a soma das parcelas é sempre exatamente o total.** Os testes
travam essa propriedade e a conversão entre `Decimal` e centavos.

Ao ler dinheiro de SQL cru, use `::text` no `SELECT` e passe por `money()` —
nunca `Number()`. Ver `lockDebt` em [src/lib/debts.ts](src/lib/debts.ts).

---

## 3. Datas em UTC

`new Date(2026, 7, 20)` produz `2026-08-20T03:00:00Z` em America/Sao_Paulo e
`2026-08-20T00:00:00Z` na Vercel. As colunas são `TIMESTAMP(3)` sem fuso, então
**a mesma linha de código grava valores diferentes em dev e em produção.** Isso
desloca a regra de fechamento de fatura e todo recorte mensal.

Regras:

1. **Nenhum módulo constrói `Date` a partir de ano/mês/dia diretamente.** Tudo
   passa por [src/lib/dates.ts](src/lib/dates.ts), que só usa `Date.UTC` e
   `getUTC*`. Isso vale também para `prisma/seed.ts` e para os testes.
2. No limite cliente↔servidor, datas viajam como string `YYYY-MM-DD`
  (`CalendarDate`), formato emitido pelo `DatePickerInput` do Mantine 9.
3. `parseCalendarDate` rejeita datas inexistentes (`2026-02-30`), que o
   construtor de `Date` aceitaria transbordando para o mês seguinte.
4. Dias vindos de configuração do usuário (`closingDay`, `dueDay`) passam por
   `utcDateClamped`, que limita ao último dia do mês.
5. Duas funções usam componentes **locais** de propósito, e só elas:
   `todayCalendarDate()` e `currentCompetency()`. "Hoje" é um conceito do fuso
  do usuário, não de UTC.
6. Ao renderizar, sempre `toLocaleDateString("pt-BR", { timeZone: "UTC" })`. Sem
   o `timeZone`, o navegador desloca a data de volta.

Os testes de `dates.ts`, `invoiceCycle.ts` e `recurrence.ts` rodam com `TZ`
forçado em UTC, America/Sao_Paulo, Asia/Tokyo e Pacific/Kiritimati. Todo módulo
novo que faça aritmética de calendário deve fazer o mesmo.

---

## 4. Atomicidade e concorrência

**Regra: toda operação multi-passo roda em `prisma.$transaction`.** Isso vale
para pagamento de fatura, criação de parcelas, materialização de recorrentes e
qualquer movimentação de dívida.

O caso mais importante é o **valor denormalizado**. Há três no sistema:

| Campo | Mantido por | Verificado por |
| --- | --- | --- |
| `financial_accounts.current_balance` | `applyToBalance` em todo `$transaction` que escreve transação | `recomputeBalance` |
| `invoices.total_amount` | `recalcInvoiceTotal` / `recalcInvoiceTotals` | soma dos lançamentos no teste |
| `debts.remaining_amount` | `writeRemaining`, junto do `status` derivado | `originalAmount − Σ amortizações` |

Nenhuma escrita pode tocar um lado só. Testes que alteram dinheiro afirmam
sobre as duas pontas.

### Padrões de concorrência

**Get-or-create usa `createMany({ skipDuplicates })`.** `upsert` pode virar
SELECT + INSERT; capturar uma violação e reler falha porque o Postgres já
abortou a transação. `skipDuplicates` produz `ON CONFLICT DO NOTHING`. Ver
`resolveInvoice` e `insertAccountOccurrences`.

**Recomputar denormalizado exige `SELECT ... FOR UPDATE` antes de agregar.** Sem
o lock, operações simultâneas calculam snapshots distintos e a última gravação
perde valor. Ver `recalcInvoiceTotal` e `lockDebt`.

**Estorno lê a pre-image sob o mesmo lock.** Uma leitura anterior à transação
pode envelhecer antes da escrita. Use `lockTransaction`
([src/lib/accountBalance.ts](src/lib/accountBalance.ts)); `payInvoice` também
relê `total_amount` sob lock.

**Ordem de lock é consistente.** `recalcInvoiceTotals` trava faturas por
competência crescente; `debts.ts` trava dívida antes de movimentação. Ordens
distintas permitem deadlock.

**Materialização usa dois mecanismos de idempotência.** `lastGeneratedAt` torna
a exclusão de uma pendência definitiva; o índice único
`(recurring_expense_id, date)` segura execuções simultâneas.

**Fatura tem ciclo de vida simétrico.** `resolveInvoice` a cria com o primeiro
lançamento da competência e `recalcInvoiceTotal` a apaga quando o último sai —
mover ou remover a única compra deixaria uma fatura em aberto de zero, que a
tela não sabe pagar nem remover. A exclusão é um `deleteMany` cuja condição
inteira (não paga, sem lançamento algum) mora no `where`, sob o lock que a
função já tomou: `transactions.invoice_id` é `ON DELETE CASCADE`, e apagar uma
fatura ainda referenciada levaria o histórico junto. Em troca, `resolveInvoice`
repete `createMany` + `FOR UPDATE` uma vez: quem espera o lock pode voltar sem
linha nenhuma quando a exclusão concorrente commita.

### Rede fora da transação

Resolva o câmbio **antes** de abrir `$transaction`; uma chamada HTTP mantém a
transação e seus locks abertos enquanto espera a API.

---

## 5. Multi-moeda

Três moedas convivem em cada lançamento, e confundi-las é a fonte de erro mais
provável do sistema:

- `transaction.currency` / `amount` — a moeda em que o gasto aconteceu.
- **`transaction.convertedAmount` — na moeda da conta ou do cartão.** É este
  campo que move saldo e fatura. Nunca `amount`.
- `user.baseCurrency` — a moeda dos relatórios.

Somar `convertedAmount` de contas em moedas diferentes não tem significado.
Agregações fazem uma **segunda** conversão via `resolveRatesToBase`. Ver
[src/lib/reports.ts](src/lib/reports.ts),
[src/lib/projection.ts](src/lib/projection.ts) e
[src/lib/people.ts](src/lib/people.ts).

### Fluxo de caixa e gasto por categoria são números diferentes

Compra no cartão não sai da conta (RN-03.2); o pagamento da fatura sai, mas não
tem categoria. Por isso `getMonthSummary` devolve duas visões:

- `income` / `expenses` — fluxo de caixa: o que entrou e saiu das contas no mês,
  incluindo pagamento de fatura.
- `byCategory` / `spendingTotal` — onde o dinheiro foi gasto: despesas de conta
  mais compras no cartão pela data da compra, excluindo pagamento de fatura.

A relação testada é `expenses = spendingTotal − cardSpending +
invoicePayments`.

A UI usa rótulos distintos: "Saídas de caixa do mês" e "Gasto por categoria".

`transactions_exchange_rate_check` garante por linha `amount × exchangeRate =
convertedAmount`. Compra parcelada em moeda estrangeira divide o total original
e converte cada parcela; a soma convertida pode diferir do total convertido,
mas cada linha continua coerente.

**Falta de cotação nunca produz número errado.** O total sai marcado como
incompleto (`complete: false`) e a UI avisa. Quem escreve no banco lança
`FxUnavailableError`, que a action traduz em `needsManualFxRate` para o
formulário pedir a taxa. Na materialização de recorrentes, a regra afetada volta
em `skipped`, sem avançar o marcador, para ser tentada novamente pelo cron ou
por uma escrita posterior.

Moeda de conta, cartão e dívida é **imutável** depois de criada. Trocá-la
reinterpretaria todo o histórico: R$ 100 viraria US$ 100 sem conversão.

### A moeda base é a exceção: mutável, e por quê

`user.baseCurrency` é configurável em `/dashboard/settings`
([src/lib/settings.ts](src/lib/settings.ts)). Diferente das moedas gravadas nas
linhas, ela é apenas parâmetro de agregação; trocá-la não reescreve nem
reinterpreta valores armazenados. Isso é testado em
[tests/integration/settings.test.ts](tests/integration/settings.test.ts).

### A segunda conversão: cotação da competência no passado, de hoje no presente

`resolveRatesToBase` recebe uma data **opcional**, e a escolha por chamada é
deliberada:

| Pergunta | Onde | Data |
| --- | --- | --- |
| "quanto gastei em janeiro" | `getMonthSummary` | último dia da competência |
| "quanto eu tenho" | `getAccountBalances` | nenhuma (mais recente) |
| "quanto sai deste mês" | `projection.ts` | nenhuma |
| "quanto me devem" | `getOpenInvoices`, `getDebtsByCategory`, `people.ts` | nenhuma |

Mês fechado usa a cotação do fim da competência para não mudar depois. Posição
e projeção usam a cotação atual. Enquanto a competência está aberta, o limite é
hoje.

`exchangeRate` continua sendo a conversão histórica do lançamento para a moeda
da conta; `resolveRatesToBase` reexpressa moedas de contas distintas na moeda
base.

### A taxa é arredondada antes de converter, não depois

O invariante por linha `amount × exchangeRate = convertedAmount` só vale porque
`toStoredRate` reduz a taxa às 4 casas da coluna `exchange_rate` **antes** de
qualquer multiplicação ([src/lib/fxService.ts](src/lib/fxService.ts)). Converter
com a taxa cheia e só depois persistir `rate.toFixed(4)` viola a constraint. O
teste da recusa vive em
[tests/integration/constraints.test.ts](tests/integration/constraints.test.ts).

---

## 6. Modelo de dados e migrations

> Medido em Prisma 7.8.0. O que o CLI gera, exige ou recusa é desta versão.

- Schema Postgres `finance`; `@@schema("finance")` em todo model e enum.
- PK `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`.
- **Colunas em snake_case**, via `@map` em todo campo camelCase e `@@map` em
  todo model. Sem exceção — misturar os dois estilos é pior que qualquer um
  deles.
- Dinheiro é `@db.Decimal(12, 2)`; taxa de câmbio é `@db.Decimal(10, 4)`.
- `@@index` em **toda** FK. O Prisma não cria índice de FK automaticamente no
  Postgres.
- Conta bancária é `FinancialAccount`, não `Account`: o `@auth/prisma-adapter`
  acessa `prisma.account` por nome fixo e não permite remapear.

**Invariantes que o Zod não consegue garantir vão para `CHECK` no banco**, em
migration escrita à mão: XOR de `account_id`/`credit_card_id`, valores
positivos, coerência de parcelas, faixa de dias do mês, `remaining <= original`,
categoria que não é pai de si mesma, e outras. Estão **enumeradas por nome** em
[tests/integration/constraints.test.ts](tests/integration/constraints.test.ts), que
reprova constraint nova sem entrada na lista ou constraint removida. O Zod
valida para dar mensagem boa; o `CHECK` impede que outro caminho escape. Enums
em `CHECK` precisam de cast explícito: `"status" <>
'PAID'::"finance"."InvoiceStatus"`.

**Uma `CHECK` só enxerga a própria linha, e isso decide o que não entra.** A
profundidade de dois níveis da categoria é o caso: "meu pai não tem pai" exige
ler outra linha, então só sairia como trigger. Fica em código, de propósito — e
`categories_no_self_parent_check` cobre só o que dá para cobrir por linha.

**Fluxo de migration.** `prisma migrate dev` é interativo e falha neste
ambiente. Use:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# revise o SQL, salve em prisma/migrations/<timestamp>_<nome>/migration.sql,
# acrescente os CHECK à mão se houver, e então:
npx prisma migrate deploy && npx prisma generate
```

`prisma generate` **sempre** depois de mexer no schema: o Prisma 7 não gera
implicitamente, e um client velho falha com "Unknown argument", que parece um
erro de código.

`migrate reset` tem proteção contra agentes de IA no Prisma 7 e exige
consentimento explícito do usuário. Isso é correto — não contorne.

---

## 7. Validação e erros

[src/lib/validations.ts](src/lib/validations.ts) é a fonte única dos schemas
Zod, compartilhada entre o formulário (via `zod4Resolver`) e o servidor.
Mensagens em pt-BR, porque vão direto para a UI. **Nenhum import server-only
aqui** — este módulo entra no bundle do cliente.

Convenções dos schemas:

- `Select` do Mantine devolve `""` quando limpo. `optionalIdSchema` e
  `optionalTextSchema` transformam isso em `null`, porque string vazia é ruído
  indistinguível de ausência nos agrupamentos.
- Datas usam `calendarDateSchema`, que valida via `parseCalendarDate`.
- Regras que dependem do banco (posse, profundidade de categoria, limite de
  amortização) ficam no serviço e lançam `InvalidOperationError`. O Zod só
  valida a forma.

Hierarquia de erros: `DomainError` → `NotFoundError` (inexistente **ou** de
outro usuário) e `InvalidOperationError` (estado inválido que depende do banco).
Erro desconhecido é registrado no servidor e sai como texto genérico — nenhuma
action vaza mensagem interna.

---

## 8. Server Components

Estas armadilhas não aparecem em typecheck, build ou testes. **Verifique cada
tela nova no navegador.**

1. **`component={Link}` em Server Component:** `Link` é uma função e componentes
   Mantine são client. Use
   [src/components/ui/AppLink.tsx](src/components/ui/AppLink.tsx) (`LinkButton`,
   `BackLink`). Em módulo `"use client"`, `component={Link}` é válido.

2. **Notação de ponto em componente client dentro de Server Component:**
   propriedades estáticas não sobrevivem à referência client;
   `Table.ScrollContainer` fica `undefined`. Use exports nomeados como
   `TableScrollContainer` e `TableThead`.

3. **Import de efeito colateral em Server Component não alcança o cliente.**
   Providers e imports de locale vivem em
   [src/components/AppProviders.tsx](src/components/AppProviders.tsx), que é
   `"use client"`.

4. **Função exportada por módulo `"use client"` não é utilitário de servidor.**
   Helper compartilhado entre formulário e página vai para `src/lib/`, sem
   `"use client"`. Ver
   [src/lib/recurringTarget.ts](src/lib/recurringTarget.ts).

**Corolário sobre `src/lib/`:** um módulo que entra no bundle do cliente não
pode importar o runtime do Prisma. `import type { Currency } from
"@prisma/client"` é seguro (apagado na compilação); `import { Currency }` não é.
É por isso que `limits.ts` existe separado de `validations.ts`, e `debtTypes.ts`
separado de `debtStatus.ts`.

---

## 9. UI

> Medido em Mantine 9.3.1 e Recharts 3.8.1. Os números de contraste são contra a
> paleta padrão dessa versão do Mantine, e [src/theme.test.ts](src/theme.test.ts)
> os trava — um minor novo que mexa na paleta reprova ali antes de chegar à tela.

Primitivos reutilizados, na ordem em que devem ser considerados antes de
escrever qualquer coisa nova: [FormModal](src/components/ui/FormModal.tsx),
[useActionModal](src/components/ui/useActionModal.ts),
[PageHeader](src/components/ui/PageHeader.tsx),
[EmptyState](src/components/EmptyState.tsx),
[AppLink](src/components/ui/AppLink.tsx),
[MonthSelector](src/components/MonthSelector.tsx).

Padrão de formulário em modal, repetido em todos os domínios:

- `<Domínio>Fields.tsx` — só os campos, compartilhado entre criar e editar.
- `Add<Domínio>Button.tsx` / `Edit<Domínio>Button.tsx` — estado e submissão.
- `DeleteEntityButton` — remoção genérica, com confirmação e impacto quando o
  domínio o expõe.

**Os valores do formulário são declarados com `type`, não `interface`.** O
TypeScript concede index signature implícita a type aliases, e sem ela o tipo
não é atribuível ao `Record<string, unknown>` esperado por `zod4Resolver`.

**`transformValues` do Mantine não alimenta o `validate`.** A validação roda nos
valores crus. Quando o formulário tem um campo composto (o `Select` único de
destino da recorrência), a conversão precisa acontecer **dentro** da função de
validação, e o erro remapeado para o campo que existe na tela. Ver
`validateRecurring`.

Campo imutável na edição é exibido como `TextInput` desabilitado com a
explicação na `description`, não escondido. O usuário precisa saber que o campo
existe e por que não pode mudá-lo.

Filtro que vem da URL é validado e ignorado quando inválido, nunca vira erro:
`?month=lixo` cai no mês corrente, `?person=lixo` mostra tudo. É entrada de
usuário, não estado interno.

O `PieChart` do Mantine 9 **não tem legenda** — só rótulos sobre as fatias, que
se sobrepõem em fatias finas. [CategoryPie](src/components/CategoryPie.tsx) usa
uma lista ao lado e agrupa a cauda em "Outras" via `capSlices`.

`formatCurrency` usa locale `pt-BR` fixo com o código de moeda passado, então
uma base em dólar sai como `US$ 1.234,56`: símbolo americano, separadores
brasileiros. É consequência esperada de um app em pt-BR — não um bug de moeda
base — e não vira parâmetro sem que haja preferência de locale para alimentá-lo.

Ordenação alfabética acontece **na aplicação**, com `Intl.Collator`
([src/lib/sorting.ts](src/lib/sorting.ts)), nunca em `ORDER BY`: a collation
`C.UTF-8` do Postgres ordena por byte e trata acentos incorretamente.

### Acessibilidade

Alvo: **WCAG 2.2 nível AA**, medido com axe-core em Chrome real.

O contraste é resolvido nos **tokens**, não tela a tela. As decisões ficam em
[src/theme.ts](src/theme.ts) e [src/app/globals.css](src/app/globals.css):
`primaryShade.light` usa teal 9; o tom 9 de teal, orange, green, yellow e lime é
escurecido; `--mantine-color-dimmed` usa gray 7. [src/theme.test.ts](src/theme.test.ts)
trava esses valores.

**As sobrescritas de `-light-color` em `globals.css` precisam casar a
especificidade do Mantine.** Ele define os tokens em
`:root[data-mantine-color-scheme="light"]`, que é 0,2,0; um `:root` seco é 0,1,0
e perde, mesmo importado depois.

**Cor escolhida pelo usuário não pode carregar texto por conta própria.** As
categorias vêm de um `ColorInput`, então são hex arbitrário: nenhuma paleta fixa
cobre uma cor desconhecida. [CategoryBadge](src/components/ui/CategoryBadge.tsx)
é a fonte única: `variant="filled"` com `autoContrast`.

**`luminanceThreshold` é 0.179, não o default 0.3 do Mantine.** É o ponto em
que o contraste de preto e branco se cruza; o pior caso fica em 4.58:1 e garante
AA para qualquer hex.

**Não use `aria-hidden` nos gráficos do Recharts:** seus nós continuam
focáveis. Desligue a camada na origem com `accessibilityLayer: false` em
`pieChartProps` / `barChartProps` e `rootTabIndex: -1` em `pieProps`.

O `<caption>` da tabela e os rótulos só-para-leitor usam `.visually-hidden` de
`globals.css`. Ícone decorativo leva `aria-hidden`; botão só com ícone leva
`aria-label`.

**Ícones criados pelo Mantine recebem rótulo no tema.** O fechamento de `Modal`,
o `InputClearButton` e o fechamento de `Notification` são configurados em
[src/theme.ts](src/theme.ts), pois nem sempre existe JSX nosso para rotulá-los.

**O modo escuro não está ligado.** O Mantine resolve `--button-color` inline no
SSR para o esquema configurado; trocar apenas o atributo em runtime não o
recalcula. Um alternador exige resolver esse comportamento antes.

---

## 10. Testes

Há três níveis:

- `unit` em `src/**/*.test.ts`: lógica pura, sem banco.
- `integration` em `tests/integration/**`: serviços contra o Postgres
  `tms_finance_test`, sem mock do Prisma.
- `npm run test:a11y` em [scripts/a11y-audit.ts](scripts/a11y-audit.ts):
  axe-core em Chrome real, com dev server e banco populado.

O unitário fica **ao lado do módulo**, e isso é informação, não só convenção:
`dates.ts` com `dates.test.ts` irmão é um módulo puro; `accounts.ts` sem irmão
fala com o banco, e seu teste é `tests/integration/accounts.test.ts` — o nome do
arquivo de integração é o do serviço que ele exercita. As exceções, porque não
exercitam um serviço: `constraints.test.ts` (as `CHECK` das migrations) e
`tests/integration/mcp/**` (a casca do agente).

O apoio dos testes mora em `tests/support/`, alcançável pelos dois projects pelo
alias `@tests/*`:

| Arquivo | Papel |
| --- | --- |
| `factories.ts` | **escreve** a linha mínima válida no banco |
| `inputs.ts` | **monta** o payload, tipado por `@/lib/validations` |
| `money.ts` | `expectBalance`, que afirma as duas pontas do saldo |
| `mcpHarness.ts` | contexto e token reais para exercitar o guard |
| `timeZones.ts` | `itAcrossTimeZones`, a aritmética de calendário em vários fusos |
| `db-forbidden.ts` | o `@/lib/db` do project unitário, que recusa |

`npm run test:coverage` mede `src/lib`, `src/mcp` e `src/actions`. É
visibilidade, não portão — o gate segue sendo os quatro comandos. Componentes
ficam de fora porque não há teste de UI funcional; incluí-los afundaria o número
sem dizer nada.

O a11y audita cada rota e depois abre seu formulário para auditar o conteúdo do
modal, que antes do clique não existe no DOM.

O script **recusa** quando não alcança as rotas de detalhe ou quando um botão de
abrir formulário não aparece, em vez de auditar menos telas e sair 0: um gate
que degrada em silêncio não é gate. Na prática isso significa `npm run db:seed`
antes.

Contra build de produção, exporte `AUTH_TRUST_HOST=true`; sem isso o Auth.js
responde `UntrustedHost`. O script só considera o login concluído ao chegar em
`/dashboard`.

A subida do Chrome é handshake, não espera cega. A porta vem de
`--remote-debugging-port=0` e é lida do `DevToolsActivePort`; a prontidão se
mede por um alvo `page`, não por `/json/version`; a saída do Chrome vai para
arquivo. Os três detalhes são o que tirou este job do piscar:

- Chutar a porta a partir de `process.uptime()` não é sorteio nenhum — naquele
  ponto o uptime é sempre pequeno, então uma tentativa nova reincidia quase na
  mesma porta e um choque virava `Chrome não abriu o endpoint do CDP`.
- `/json/version` responde antes de existir alvo do tipo `page`. Conectar nessa
  janela pega um alvo prestes a ser trocado e devolve o mesmo
  `-32000 Inspected target navigated or closed` da espera pelo pós-login, por
  causa completamente diferente.
- Com a saída em `/dev/null`, a falha chegava ao CI sem uma linha de
  diagnóstico — foi assim que o job passou a piscar sem ninguém saber por quê.

O handshake tem 60s porque o runner ainda segura `next start`, Postgres e seed;
o laço sai assim que fica pronto, então a folga não custa tempo. As últimas
linhas do log entram na mensagem de erro.

O axe fica fora do Vitest porque contraste exige layout e cascata reais, que o
jsdom não oferece. [src/theme.test.ts](src/theme.test.ts) trava os tokens; o
script encontra combinações problemáticas nas telas.

Regras:

- **Todo arquivo de teste abre com um docblock** dizendo qual invariante cairia
  se ele sumisse. É o que separa "testa `createAccount`" de "prova que o saldo
  inicial vira saldo atual".
- **Módulo puro → teste unitário.** Módulo que fala com o banco → teste de
  integração. Isso não depende mais de disciplina: no project `unit`,
  `@/lib/db` aponta para [tests/support/db-forbidden.ts](tests/support/db-forbidden.ts),
  que lança dizendo para onde mover o teste. Antes a separação vivia só no glob
  do `include` e na ausência de `DATABASE_URL` — e essa ausência não é garantida,
  porque `src/lib/db.ts` lê a variável no import e um shell que a tenha exportada
  faria o teste conectar no banco de desenvolvimento, em silêncio.
- **Sem mock de Prisma**, com uma exceção: quando a asserção é sobre **não**
  alcançar o banco. [src/lib/session.test.ts](src/lib/session.test.ts) prova que
  um `sub` forjado é recusado *antes* da consulta e que `passwordHash` nunca
  entra no `select` — nenhum teste de integração prova isso, porque ambos são
  afirmações sobre a chamada que não aconteceu.
- **Todo teste que mexe em dinheiro afirma sobre as duas pontas**, via
  `expectBalance` de [tests/support/money.ts](tests/support/money.ts), que
  compara o denormalizado com o recálculo. A regra existia antes como texto e
  era cumprida em 5 dos 20 arquivos: afirmar só o `currentBalance` passa mesmo
  quando a escrita tocou um lado só, que é a falha que a regra existe para pegar.
- **Todo teste que checa recusa afirma também que nada mudou.** "Rejeitou" sem
  "e não deixou lixo" não prova atomicidade.
- **Câmbio nunca vai à rede.** [tests/setup-fx.ts](tests/setup-fx.ts) mocka
  `@/lib/fxService` globalmente. Mocka **as duas** funções (`getExchangeRate` e
  `resolveRatesToBase`), porque em ESM uma chamada interna do módulo não passa
  pelo mock. O reset do estado é do próprio setup, não de cada arquivo: um mock
  global que o setup não restaura vaza entre testes, e com `fileParallelism:
  false` a ordem é determinística — o vazamento passaria escondido até alguém
  renomear um arquivo. O estado limpo é **sem cotação nenhuma**, e não um
  conjunto padrão, para que cada arquivo declare as taxas de que depende e a
  recusa por cotação ausente siga sendo sinal, não acidente.
- **Relógio explícito.** Funções que dependem de "hoje" recebem `now` como
  parâmetro com default, e o teste passa uma data fixa. Um teste que dependa do
  relógio real quebra sozinho com o passar dos meses.
- **Aritmética de calendário roda em vários fusos** (ver seção 3), via
  `itAcrossTimeZones`. Ele restaura o fuso **por teste**, e o **remove** quando
  `TZ` não veio do ambiente — o caso do runner do CI. Atribuir `undefined` a uma
  variável de ambiente grava a string `"undefined"`, e o Node cai em UTC sem
  avisar.
- `resetDb` faz `TRUNCATE ... RESTART IDENTITY CASCADE` em `beforeEach`, com a
  lista de tabelas lida do catálogo — tabela nova entra no reset sem editar
  nada. Transação com rollback não serviria: o código sob teste já usa
  `prisma.$transaction`.
- `fileParallelism: false`: um banco compartilhado com TRUNCATE por teste não
  tolera concorrência entre arquivos.
- O global setup se recusa a rodar se `DATABASE_URL` não contiver
  `tms_finance_test`.

Pare o dev server antes dos testes para evitar contenção de recursos em WSL.

---

## 11. Deploy

Dois scripts de build, porque os dois ambientes querem coisas diferentes:

- `"build": "next build"` — o do dia a dia e o do quality gate. Não toca no
  banco: `npm run build` precisa funcionar sem `DATABASE_URL` alcançável.
- `"vercel-build": "prisma migrate deploy && prisma generate && next build"` —
  a Vercel prefere este script quando ele existe, então a migração roda lá e só
  lá, sem `vercel.json`.

Depois de mexer no schema, rode `npm run db:generate` localmente: o `build` não
gera mais o client por você.

Cuidados do lado da Vercel:

- `DATABASE_URL` precisa estar disponível **em build time**, não só em runtime.
- Se o Postgres for pooled (Neon pooler, pgbouncer, Accelerate), `migrate
  deploy` exige conexão direta: crie `DIRECT_DATABASE_URL` e aponte o
  `datasource.url` de [prisma.config.ts](prisma.config.ts) para ela. Esse
  arquivo só é lido pelo CLI; o runtime continua usando `DATABASE_URL` via
  `PrismaPg`.
- Preview deployments também rodam `migrate deploy`. Se preview e produção
  compartilham banco, uma migration de branch vaza para produção — dê um banco
  próprio ao ambiente Preview.
- `prisma migrate dev` nunca em CI ou deploy.
- O seed se recusa a rodar com `NODE_ENV=production` ou `VERCEL_ENV=production`.
  Mantenha essa guarda.

### Pool de conexões

[src/lib/db.ts](src/lib/db.ts) configura o `PrismaPg` explicitamente porque os
defaults do `pg` são hostis a serverless: `max` vale **10 por instância** e
`connectionTimeoutMillis` fica `undefined` — sem timeout, a requisição que não
encontra conexão livre espera o timeout da função em vez de falhar rápido. Como
ali quem cresce é o número de instâncias, o teto por instância tem de ser
pequeno; `DB_POOL_MAX` existe para o processo de longa duração, onde vale o
oposto.

**Valor inválido cai no default em vez de ser repassado.** O `pg` resolve `max`
com `||`, então `0` e `NaN` reativam em silêncio justamente os 10 que essa
configuração existe para evitar — e `DB_POOL_MAX=""`, que é o que
[.env.example](.env.example) entrega, produzia `0`.

As dependências são pinadas e atualizadas pelo Renovate
([renovate.json](renovate.json)). Mantine, Prisma e Next são agrupados por
compatibilidade interna; `next-auth` e o SDK MCP ficam isolados por controlarem
autenticação e escrita do agente.

---

## 12. Convenções de código

- Comentários em **pt-BR**; mensagens de commit em **inglês** (`tipo(escopo):
  descrição`).
- Comentário explica **por que** o código existe: contrato, invariante,
  alternativa que falha, unidade ou faixa que o tipo não expressa. Não repete a
  linha nem narra o histórico da refatoração.
- Cabeçalho de módulo pode ser maior para registrar o contrato do conjunto, mas
  não enumera funções nem repete assinaturas.
- Comentário em TypeScript não cita documento, seção, RN, fase nem histórico de
  dependência. Escreva a informação relevante, não o ponteiro.
- **A exceção é o SQL de migration, que cita RN.** Migration é append-only: o
  SQL não muda e a citação explica por que uma `CHECK` existe.
- Componentes recebem `props` num objeto tipado e desestruturado na primeira
  linha da função.
- Nomes de domínio em português na UI e nos dados (`descricao` em teste,
  "Recorrentes" no menu); identificadores de código em inglês.
- Parte destas convenções é verificada por lint, não por revisão: chaves
  obrigatórias em todo bloco (`curly`), tipo de retorno explícito em
  `src/lib/**` e indentação. Ver [eslint.config.mjs](eslint.config.mjs).
- Nada é dado por pronto sem o portão de qualidade do [AGENTS.md](AGENTS.md) e
  sem abrir cada tela nova no navegador (Server Components).

---

## 13. Superfície de agente

> Medido em `@modelcontextprotocol/server` 2.0.0 e `mcp-handler` 2.1.1. As
> afirmações sobre o que o SDK negocia, valida ou aplica por default são desta
> versão.

Um endpoint MCP em `POST /api/agent/mcp` dá a um agente externo leitura e
escrita sobre os dados de um usuário, autenticado por token opaco com escopos.
[src/app/api/agent/mcp/route.ts](src/app/api/agent/mcp/route.ts) é a entrada;
[src/mcp/](src/mcp/) é a casca sobre os mesmos serviços de `src/lib/` usados
pela UI.

### `src/mcp/` é irmã de `src/actions/`, não cliente dela

```text
src/app/**/page.tsx        Server Component  ─┐
src/actions/<domínio>.ts   Server Action     ─┼→ src/lib/<domínio>.ts
src/mcp/tools/*.ts         MCP tool          ─┘
```

A duplicação das cascas é deliberada:

1. Actions autenticam por sessão e podem redirecionar; MCP autentica por bearer
   token e responde 401.
2. Actions devolvem `ActionResult` para formulários; MCP devolve erro
   classificado com `code` e `retry`.

O que as duas compartilham é o que importa: os schemas de
[src/lib/validations.ts](src/lib/validations.ts), sem alteração. O agente não
consegue gravar nada que a UI recusaria, e o SDK expõe as mesmas mensagens em
pt-BR pelo `inputSchema`.

### Dinheiro sai como string

Como o consumidor pode recalcular os valores,
[src/mcp/serializers.ts](src/mcp/serializers.ts) emite dinheiro como string de 2
casas. As descrições orientam a usar agregações prontas.

Fluxo de caixa e gasto por categoria usam nomes distintos
(`cash_flow.cash_out` e `spending.total`) e um campo `relation` com a identidade
entre eles. Cor de categoria, dado de renderização, não sai nas projeções.

A exceção é `list_categories`, onde a categoria é o recurso e não o rótulo de um
número. Como `update_*` substitui o estado inteiro em vez de aplicar um patch, um
campo ausente da leitura é um campo que o agente apaga ao editar sem nunca ter
sabido que existia — então `color` e `icon` saem por lá.

### O nome da ferramenta é escrito uma vez

Ferramenta nova entra por `defineTool` ou `defineDestructiveTool`
([src/mcp/define.ts](src/mcp/define.ts)), nunca por `server.registerTool` direto.
Isso mantém nome e schema únicos. [tests/integration/mcp/registry.test.ts](tests/integration/mcp/registry.test.ts)
compara o registro real com `TOOL_SCOPES` e verifica a primeira rodada das
ferramentas destrutivas.

`defineTool` concentra uma erasure necessária pelas sobrecargas genéricas do
SDK; os call sites continuam tipados.

### Leitura não materializa recorrentes

Leituras não produzem ocorrências. Na aplicação web, o cron diário e as escritas
de recorrência chamam `materializeDue`; no MCP, `get_balance_projection` expõe
`pending_count` e o agente chama `materialize_recurring` **explicitamente**, sob
escopo de escrita.

### Remoção em cascata é em duas fases

As cinco remoções em cascata (`delete_account`, `delete_credit_card`,
`delete_person`, `delete_category`, `delete_debt`) exigem escopo
`destructive:write` **e** confirmação. A primeira chamada não executa nada: mede
o impacto em [src/lib/deletionImpact.ts](src/lib/deletionImpact.ts) e devolve
`inputRequired({ inputRequests: { confirm }, requestState })`.

O risco que isto endereça é específico. Este app **registra** transações, não
movimenta dinheiro. O dano irreversível é a perda silenciosa de histórico por
`onDelete: Cascade`; por isso a confirmação protege cascatas, não valores.

O protocolo pergunta ao **cliente**, que pode exibir a confirmação a um humano;
um parâmetro comum perguntaria apenas ao agente.

O orçamento dessa resposta é `AGENT_CONFIRM_TTL_SECONDS`, default **120s**
([src/mcp/confirm.ts](src/mcp/confirm.ts)). Passou disso, o `requestState`
expira e a remoção é recusada. O `roundTimeoutMs` do legacy shim não governa
esse prazo.

**Integridade do `requestState`.** Como o valor volta pelo cliente,
[src/mcp/confirm.ts](src/mcp/confirm.ts) usa `createRequestStateCodec` com HMAC e
`bind` no `clientId` e no método. `ServerOptions.requestState.verify` rejeita
state adulterado antes do handler; `readConfirmation` confere os argumentos,
que não fazem parte do `bind`.

`input_required` pertence à revisão **2026-07-28**, que não aparece em
`SUPPORTED_PROTOCOL_VERSIONS`; o `initialize` negocia 2025-11-25. A revisão é
declarada por requisição para manter o endpoint stateless. O pressuposto está
travado por `MCP_PROTOCOL_REVISION` em
[src/mcp/confirm.ts](src/mcp/confirm.ts) e um teste em `confirm.test.ts` que
reprova se o SDK promover a revisão.

Um `tools/call` 2026-era precisa de:

- headers `Mcp-Method`, `Mcp-Name` e `Mcp-Protocol-Version: 2026-07-28`;
- `params._meta` com `io.modelcontextprotocol/protocolVersion` **e**
  `io.modelcontextprotocol/clientCapabilities` (com `elicitation`).

Sem isso a conexão é tratada como 2025-era, e aí o legacy shim tentaria um
`elicitation/create` server→client, impossível em serving stateless. A chamada
falha sem remover nada; clientes sem elicitação não usam ferramentas destrutivas.

### Credenciais

Token opaco de 256 bits guardado **só** como HMAC-SHA256 com o pepper de
`AGENT_TOKEN_PEPPER` ([src/lib/agentTokens.ts](src/lib/agentTokens.ts)).

- **Não JWT:** JWT não é revogável antes de expirar, e a única forma de
  invalidar em massa afetaria também as sessões web. Aqui revogar é um `UPDATE`.
- **Não bcrypt:** 256 bits aleatórios não são força-brutáveis, então o KDF não
  acrescenta segurança útil. O pepper protege um dump sem acesso ao ambiente.
- Emissão por `npm run agent:token` — o valor em claro existe uma vez, no
  stdout; não há tela que o persista no navegador.
- `setup:write` cobre os cadastros de base **sem moeda**: criar e editar
  categoria e pessoa. O recorte é esse porque criar conta ou cartão fixa a
  moeda, que é imutável depois (Multi-moeda) — errar ali não se corrige
  editando, então `create_account` e `create_credit_card` continuam fora.

  `set_base_currency` também não existe: embora a moeda base seja mutável,
  trocá-la reexpressa todos os relatórios. Essa decisão fica na tela de
  configurações, onde a consequência está visível.

  Categoria e pessoa entraram porque a assimetria era pior que o risco: o agente
  já podia **apagar** as duas, e não podia criá-las — `create_debt` exigia um
  `personId` sem origem alcançável.

`/api/agent/mcp` **não** entra no matcher de [src/proxy.ts](src/proxy.ts), que
cobre só `/dashboard/:path*`. A autenticação é bearer token, e a doc do Next 16
não trata proxy como autorização. Interceptar o endpoint produziria redirect
para `/login` em vez de 401.

### Auditoria: o que ela pega e o que não pega

`agent_audit_log` grava **toda** chamada que alcança o guard, inclusive recusa
por escopo e por cota. `CONFIRM_REQUIRED` não é falha — é a primeira metade de
uma remoção; uma linha dessas sem o `OK` correspondente diz que o agente pediu,
viu o impacto e desistiu.

**Todas as ferramentas são registradas para todo token**, e a recusa por escopo
acontece no guard. Filtrar `tools/list` faria a tentativa morrer antes do guard,
sem auditoria. O registro completo preserva o rastro e informa o escopo ausente.

Duas lacunas reais, pelo mesmo mecanismo — o seam do SDK recusa antes do guard:

- violação do `inputSchema` declarado (valor negativo, data inexistente);
- `requestState` adulterado.

As duas produzem resposta correta, mas **não** geram linha. Auditá-las exigiria
afrouxar `inputSchema` e degradar a descoberta das ferramentas. Escopo, cota,
erro de domínio, confirmação e sucesso continuam auditados.

Rate limit é janela deslizante em SQL sobre `rate_limit_hits`
([src/lib/rateLimit.ts](src/lib/rateLimit.ts), consumido por
[src/lib/agentRateLimit.ts](src/lib/agentRateLimit.ts)). No Postgres e não em
memória porque o Fluid Compute reusa instâncias mas não garante que duas
chamadas caiam na mesma; um bucket em processo multiplicaria o limite pelo
número de instâncias. **A tentativa é gravada antes de ser contada**, evitando
que chamadas simultâneas leiam o mesmo total antigo. A tabela também atende
login e cadastro.

---

## 14. Limitações conhecidas

- Não há teste automatizado de UI funcional. `npm run test:a11y` cobre
  acessibilidade, mas submissão, estados de erro e integração entre Server e
  Client Components ainda exigem validação manual no navegador.
- `deletePerson` remove por cascade o histórico das dívidas quitadas. Os
  lançamentos permanecem no fluxo de caixa, mas perdem o agrupamento por dívida;
  a remoção só é recusada quando há posição em aberto.
- Ajustar uma cobrança recorrente no cartão corrige apenas aquele ciclo. Os
  seguintes exigem editar a regra de recorrência.
- Com exceção das transações recentes e das faturas recolhidas na página do
  cartão, as listas não têm paginação e crescem com todo o histórico.
- A revogação por `passwordChangedAt` ocorre no runtime Node, em
  [src/auth.ts](src/auth.ts), porque consulta o Postgres. O proxy edge ainda
  aceita o cookie, mas o primeiro `auth()` antes de qualquer acesso a dados o
  rejeita.
