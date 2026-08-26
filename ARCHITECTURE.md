# TMS Finance — decisões técnicas, padrões e regras

Este documento é a referência de como o código deste repositório é escrito, e
**por quê**. Cada regra vem com o motivo: sem ele, a regra parece arbitrária e é
a primeira coisa que alguém contorna sob pressão.

Escopo e precedência:

| Documento | O que manda |
|---|---|
| [docs/business-rules.md](docs/business-rules.md) | O domínio: RN-01 a RN-05. É a fonte de verdade do *o quê*. |
| [prisma/schema.prisma](prisma/schema.prisma) | O modelo de dados. Nenhuma regra aqui sobrepõe uma constraint de lá. |
| [AGENTS.md](AGENTS.md) | As 5 regras financeiras críticas e o aviso sobre a versão do Next.js. |
| **Este arquivo** | O *como*: camadas, padrões, armadilhas conhecidas. |

O código **não** cita este documento. Comentário explica a linha que está ao
lado; contexto de projeto mora aqui. Quando as duas coisas se cruzam, quem
procura chega por busca de nome, não por referência cruzada que envelhece.

---

## 1. Três camadas

A separação existe por um motivo prático: **o que é testável**. Antes dela, uma
única função misturava autenticação, validação, câmbio, Prisma e revalidação, e
não havia como testá-la sem mockar metade do Next.

```
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
  (`requireAccount`, `assertCategoryOwned`, `assertPersonOwned`). Serviço nenhum
  reimplementa a sua: já houve três cópias da mesma query, e corrigir uma
  deixava as outras erradas.

Única exceção: [src/lib/session.ts](src/lib/session.ts) chama `auth()` e
`redirect()`, porque **é** o módulo de sessão. Nenhum outro módulo de `src/lib`
pode fazer isso.

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
domínio e `ActionResult`. Ele também é o único lugar que sabe repassar o
`redirect()` do Next, que sinaliza por exceção (`digest` começando com
`NEXT_REDIRECT`) e seria engolido por um `catch` ingênuo.

---

## 2. Dinheiro

**Regra 1: `number` nunca participa de operação monetária.** `0.1 + 0.2 ===
0.30000000000000004`, e o erro acumula a cada soma.

Toda aritmética passa por [src/lib/money.ts](src/lib/money.ts), que usa
`Prisma.Decimal` — a implementação decimal.js que já vem com o `@prisma/client`,
sem dependência nova, e o mesmo tipo que o Prisma devolve ao ler colunas
`DECIMAL`.

`number` é permitido em exatamente dois lugares:

- **Borda de entrada:** o `NumberInput` do Mantine emite `number`; o Zod o
  valida e o serviço o converte imediatamente.
- **Borda de saída:** os `*ListItem` que alimentam a renderização usam
  `Number(...)`, porque `formatCurrency` recebe `number`. Esses mappers são o
  fim da linha: nada soma depois deles.

Toda escrita no banco passa por `toStorage()`, que devolve **string** com 2
casas. String e não `number` para que o valor não passe por float no caminho até
o Postgres.

**Regra 2: o resto dos centavos vai na primeira parcela.** Fonte única em
[src/lib/installmentSplit.ts](src/lib/installmentSplit.ts) (`splitCents`,
client-safe, centavos inteiros) e
[src/lib/installments.ts](src/lib/installments.ts) (`splitInstallments`, server,
`Decimal`). As duas implementações existem porque o formulário precisa da prévia
sem arrastar o Prisma para o navegador; um teste afirma que elas concordam para
uma tabela de totais × parcelas.

Invariante: **a soma das parcelas é sempre exatamente o total.** Qualquer
mudança nessa divisão precisa manter isso, e há teste de propriedade para
provar.

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
   (`CalendarDate`) — o formato que o `DatePickerInput` do Mantine 9 emite.
   Assim o fuso do navegador também sai da conta.
3. `parseCalendarDate` rejeita datas inexistentes (`2026-02-30`), que o
   construtor de `Date` aceitaria transbordando para o mês seguinte.
4. Dias vindos de configuração do usuário (`closingDay`, `dueDay`) passam por
   `utcDateClamped`, que limita ao último dia do mês.
5. Duas funções usam componentes **locais** de propósito, e só elas:
   `todayCalendarDate()` e `currentCompetency()`. "Hoje" é um conceito do fuso
   do usuário — às 22h do dia 20 em São Paulo já é dia 21 em UTC, e oferecer 21
   como data padrão estaria errado para ele.
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
|---|---|---|
| `financial_accounts.current_balance` | `applyToBalance` em todo `$transaction` que escreve transação | `recomputeBalance` |
| `invoices.total_amount` | `recalcInvoiceTotal` / `recalcInvoiceTotals` | soma dos lançamentos no teste |
| `debts.remaining_amount` | `writeRemaining`, junto do `status` derivado | `originalAmount − Σ amortizações` |

Nenhuma escrita pode tocar um lado só. Todo teste de integração que altera
dinheiro afirma sobre **as duas pontas**, e é assim que a invariante fica
protegida de regressão.

### Padrões de concorrência já pagos com bug

Estes três padrões existem porque a alternativa ingênua falhou em teste. Não os
simplifique.

**Get-or-create → `createMany({ skipDuplicates })`.** Nem `upsert` nem try/catch
servem: o Prisma pode traduzir o upsert como SELECT seguido de INSERT, que perde
a corrida; e uma violação de constraint **aborta a transação** no Postgres,
então capturar o erro e reler dentro do mesmo `$transaction` falha com *"current
transaction is aborted"*. `createMany` com `skipDuplicates` compila para `INSERT
... ON CONFLICT DO NOTHING`, que nunca levanta erro. Ver `resolveInvoice` e
`insertAccountOccurrences`.

**Recomputar denormalizado → `SELECT ... FOR UPDATE` antes de agregar.** Sem o
lock, duas operações simultâneas agregam cada uma o próprio snapshot e a última
gravação vence, perdendo valor. Com ele, a segunda espera a primeira confirmar
e, em READ COMMITTED, sua agregação tira um snapshot novo. Ver
`recalcInvoiceTotal` e `lockDebt`.

**Ordem de lock consistente.** Faturas são sempre travadas em **ordem crescente
de competência** — é o que `recalcInvoiceTotals` garante. Iterar um `Set` deixa
a ordem dependendo do que o Postgres devolveu, e duas operações sobre as mesmas
duas faturas podem travar em sentidos opostos.

**Idempotência de geração lazy: dois mecanismos, não um.** A materialização de
recorrentes usa o marcador `lastGeneratedAt` ("tudo até esta data já foi
gerado") **e** o índice único `(recurring_expense_id, date)`. O marcador é o que
faz apagar uma pendência indesejada ser definitivo; o índice é o que segura dois
renders simultâneos.

### Chamada de rede nunca dentro de `$transaction`

Resolva o câmbio **antes** de abrir a transação. Uma chamada HTTP lá dentro
mantém a transação aberta esperando a API, segurando locks por tempo
indeterminado.

---

## 5. Multi-moeda

Três moedas convivem em cada lançamento, e confundi-las é a fonte de erro mais
provável do sistema:

- `transaction.currency` / `amount` — a moeda em que o gasto aconteceu.
- **`transaction.convertedAmount` — na moeda da conta ou do cartão.** É este
  campo que move saldo e fatura. Nunca `amount`.
- `user.baseCurrency` — a moeda dos relatórios.

Consequência que já causou um bug: somar `convertedAmount` de contas em moedas
diferentes dá um número sem significado. Agregações fazem uma **segunda**
conversão, via `resolveRatesToBase`. Ver
[src/lib/reports.ts](src/lib/reports.ts),
[src/lib/projection.ts](src/lib/projection.ts) e
[src/lib/people.ts](src/lib/people.ts).

### Fluxo de caixa e gasto por categoria são números diferentes

Compra no cartão não sai da conta (RN-03.2); o que sai é o pagamento da fatura,
que não tem categoria. Construir "gasto por categoria" a partir do fluxo de
caixa jogaria **todo** gasto de cartão em "Sem categoria" e tornaria a
categorização das compras inútil. Então `getMonthSummary` devolve as duas
visões:

- `income` / `expenses` — fluxo de caixa: o que entrou e saiu das contas no mês,
  incluindo pagamento de fatura.
- `byCategory` / `spendingTotal` — onde o dinheiro foi gasto: despesas de conta
  mais compras no cartão pela data da compra, excluindo pagamento de fatura.

A relação é explícita e tem teste: `expenses = spendingTotal − cardSpending +
invoicePayments`. Qualquer mudança em uma das visões que esqueça a outra quebra
essa identidade na hora.

A UI **precisa** rotular a diferença. "Saídas de caixa do mês" e "Gasto por
categoria" são rótulos distintos de propósito; chamar os dois de "despesas"
produziria dois números diferentes com o mesmo nome na mesma tela.

Invariante por linha: `amount × exchangeRate = convertedAmount`. Numa compra
parcelada em moeda estrangeira, isso significa dividir o total na moeda do
lançamento e converter cada parcela — a soma dos convertidos pode diferir do
total convertido em um centavo, e essa é a escolha deliberada.

**Falta de cotação nunca produz número errado.** O total sai marcado como
incompleto (`complete: false`) e a UI avisa. Quem escreve no banco lança
`FxUnavailableError`, que a action traduz em `needsManualFxRate` para o
formulário pedir a taxa. A exceção é a materialização de recorrentes, que roda
durante a renderização de página: lá o erro é engolido, a recorrência volta em
`skipped` e a página renderiza.

Moeda de conta, cartão e dívida é **imutável** depois de criada. Trocá-la
reinterpretaria todo o histórico: R$ 100 viraria US$ 100 sem conversão.

### A moeda base é a exceção: mutável, e por quê

`user.baseCurrency` é configurável em `/dashboard/settings`
([src/lib/settings.ts](src/lib/settings.ts)) e não compartilha a imutabilidade
das outras três. O motivo é assimétrico e vale registrar: aquelas são gravadas
em cada linha e definem o *significado* do valor armazenado; esta só é **lida**,
como parâmetro da agregação. Trocá-la não reescreve nenhuma coluna — não há
migration, backfill nem reinterpretação de histórico, e há teste de integração
que tira um retrato de toda coluna monetária antes e depois da troca e afirma
que nada mudou
([tests/integration/settings.test.ts](tests/integration/settings.test.ts)).

### A segunda conversão usa a cotação de hoje, deliberadamente

`resolveRatesToBase` não recebe data: todas as chamadas convertem pela cotação
**mais recente**. Consequência visível quando a base não é a moeda da carteira:
o relatório de um mês fechado muda de valor conforme o câmbio do dia.

Isto é escolha, não descuido. A conversão **da época** já está gravada, por
linha, no `exchangeRate` que satisfaz `amount × exchangeRate = convertedAmount`.
A segunda conversão responde outra pergunta — *"quanto isso vale hoje"* — e é
uma **re-expressão de apresentação**, coerente com patrimônio e saldo projetado,
que também são perguntas sobre o presente. A UI diz isso ao usuário na descrição
do campo, porque um total que muda sozinho sem aviso parece bug.

A alternativa — cotação da época em toda agregação — exigiria cotação por
par-por-data, uma chamada por par no Frankfurter e cache próprio. Se algum dia
for pedida, é fase própria.

### A taxa é arredondada antes de converter, não depois

O invariante por linha `amount × exchangeRate = convertedAmount` só vale porque
`toStoredRate` reduz a taxa às 4 casas da coluna `exchange_rate` **antes** de
qualquer multiplicação ([src/lib/fxService.ts](src/lib/fxService.ts)). Gravar
`rate.toFixed(4)` mas converter com a taxa cheia deixa o invariante falso no
banco: uma taxa manual de `5,12345678` sobre R$ 1.000,00 diverge em 4 centavos.
O bug existiu e passava despercebido nos testes porque
[tests/setup-fx.ts](tests/setup-fx.ts) usava taxas exatas em 4 casas.

---

## 6. Modelo de dados e migrations

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
migration escrita à mão. Já são 16: XOR de `account_id`/`credit_card_id`,
valores positivos, coerência de parcelas, faixa de dias do mês, `remaining <=
original`, categoria que não é pai de si mesma, e outras. O Zod valida para dar
mensagem boa; o `CHECK` garante que nenhum caminho de código escape. Enums em
`CHECK` precisam de cast explícito: `"status" <>
'PAID'::"finance"."InvoiceStatus"`.

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

Nenhuma das quatro aparece em `tsc --noEmit`, em `next build` ou nos testes.
Todas foram encontradas abrindo a página. **Verifique cada tela nova no
navegador.**

1. **`component={Link}` de um Server Component** → *"Functions cannot be passed
   directly to Client Components"*. `Link` é uma função e componentes Mantine
   são client. Use
   [src/components/ui/AppLink.tsx](src/components/ui/AppLink.tsx) (`LinkButton`,
   `BackLink`), que é client e concentra a composição. Dentro de um módulo `"use
   client"`, `component={Link}` é normal.

2. **Notação de ponto em componente client dentro de Server Component** →
   *"Element type is invalid ... got: undefined"*. Importar um componente client
   de um Server Component devolve uma **referência**, e propriedades estáticas
   não sobrevivem: `Table.ScrollContainer` é `undefined`. Use os exports
   nomeados (`TableScrollContainer`, `TableThead`, …). Em componente client, o
   ponto funciona.

3. **Import de efeito colateral em Server Component não alcança o cliente.**
   `import "dayjs/locale/pt-br"` em `layout.tsx` só chegava ao bundle do
   servidor, e o calendário mostrava "August de 2026". Providers e imports de
   locale vivem em
   [src/components/AppProviders.tsx](src/components/AppProviders.tsx), que é
   `"use client"`.

4. **Função utilitária exportada de módulo `"use client"` e chamada do
   servidor** → *"Attempted to call joinTarget() from the server but joinTarget
   is on the client"*. Helper compartilhado entre formulário e página vai para
   `src/lib/`, sem `"use client"`. Ver
   [src/lib/recurringTarget.ts](src/lib/recurringTarget.ts).

**Corolário sobre `src/lib/`:** um módulo que entra no bundle do cliente não
pode importar o runtime do Prisma. `import type { Currency } from
"@prisma/client"` é seguro (apagado na compilação); `import { Currency }` não é.
É por isso que `limits.ts` existe separado de `validations.ts`, e `debtTypes.ts`
separado de `debtStatus.ts`.

---

## 9. UI

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
- `Delete<Domínio>Button.tsx` — `modals.openConfirmModal` + `useTransition`.

**Os valores do formulário são declarados com `type`, não `interface`.** O
TypeScript concede index signature implícita a type aliases, e sem ela o tipo
não é atribuível ao `Record<string, unknown>` que o `zod4Resolver` espera. Esse
detalhe causou 6 erros de compilação de uma vez.

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
se sobrepõem quando as fatias são finas.
[CategoryPie](src/components/CategoryPie.tsx) resolve com uma lista ao lado, e
agrupa a cauda em "Outras" via `capSlices`: vinte categorias produzem um gráfico
ilegível e uma legenda maior que ele.

`formatCurrency` usa locale `pt-BR` fixo com o código de moeda passado, então
uma base em dólar sai como `US$ 1.234,56`: símbolo americano, separadores
brasileiros. É consequência esperada de um app em pt-BR — não um bug de moeda
base — e não vira parâmetro sem que haja preferência de locale para alimentá-lo.

Ordenação alfabética acontece **na aplicação**, com `Intl.Collator`
([src/lib/sorting.ts](src/lib/sorting.ts)), nunca em `ORDER BY`. O Postgres
deste projeto está em collation `C.UTF-8`, que ordena por byte: "Água" e "Óleo"
caem depois de "Zebra". Fazer na aplicação também elimina a dependência da
collation do banco de produção.

### Acessibilidade

Alvo: **WCAG 2.2 nível AA**. O portal estava com 53 violações só no painel; hoje
as 13 rotas fecham em zero, medidas com axe-core em Chrome real.

O contraste é resolvido nos **tokens**, não tela a tela. Três decisões carregam
quase tudo, e as três estão em [src/theme.ts](src/theme.ts) e
[src/app/globals.css](src/app/globals.css):

| Onde | O quê | Por quê |
| --- | --- | --- |
| `primaryShade: { light: 9 }` | teal 9 no claro | O teal 6 rendia **2.55:1** como texto sobre branco *e* como fundo de botão com rótulo branco — era a violação mais repetida |
| `colors` | tom 9 escurecido em teal, orange, green, yellow, lime | O tom 9 de fábrica não alcança AA nessas cinco: orange dá 4.30, green 4.37, yellow 3.00 |
| `--mantine-color-dimmed` | gray-6 → gray-7 | `c="dimmed"` é o token mais usado do portal, e gray-6 rende 3.32:1 |

**As sobrescritas de `-light-color` em `globals.css` precisam casar a
especificidade do Mantine.** Ele define os tokens em
`:root[data-mantine-color-scheme="light"]`, que é 0,2,0; um `:root` seco é 0,1,0
e perde, mesmo importado depois. Custou uma rodada de medição descobrir isso.

**Cor escolhida pelo usuário não pode carregar texto por conta própria.** As
categorias vêm de um `ColorInput`, então são hex arbitrário: nenhuma paleta fixa
cobre uma cor desconhecida. Com `variant="light"` o Mantine pintava o texto com
a própria cor sobre um fundo tingido dela — 2.17:1 num verde comum.
[CategoryBadge](src/components/ui/CategoryBadge.tsx) é a fonte única da regra:
`variant="filled"` e a decisão vai para o `autoContrast`.

**O `luminanceThreshold` do Mantine é 0.3, e está errado.** Ele decide entre
rótulo preto e branco. Branco sobre luminância L rende `1.05 / (L + 0.05)`;
preto rende `(L + 0.05) / 0.05`. Os dois se cruzam em `(L + 0.05)² = 1.05 × 0.05`,
ou seja **L ≈ 0.179**. Com 0.3 a escolha pende para branco cedo demais: o laranja
`#f76707` (L = 0.295) ganhava rótulo branco a 3.04:1 quando preto dava 6.9. No
cruzamento o pior caso vale 4.58:1 — daí o limiar garantir AA para *qualquer*
hex.

**`aria-hidden` sobre gráfico do Recharts é armadilha.** O Recharts marca o
`<svg>` como `role="application"` e deixa ele e o grupo das fatias com
`tabindex="0"`. Envolver isso em `aria-hidden` troca ruído de leitor de tela por
uma violação pior — `aria-hidden-focus`, o foco pousando num nó que não é
anunciado. A saída é desligar a camada na origem: `accessibilityLayer: false` via
`pieChartProps` / `barChartProps`, mais `rootTabIndex: -1` em `pieProps` — note
`rootTabIndex`, não `tabIndex`, que é o prop com que o `Pie` monta o `<g>`.
`inert` resolveria também, mas mataria o tooltip de hover junto.

O `<caption>` da tabela e os rótulos só-para-leitor usam `.visually-hidden` de
`globals.css`. Ícone decorativo leva `aria-hidden`; botão só com ícone leva
`aria-label`.

**O modo escuro não está ligado** — não há toggle e o padrão é `light`. Os
tokens já foram corrigidos para ele (31 violações → 1), mas o resíduo é
estrutural: o Mantine resolve `--button-color` **inline, no SSR**, para o esquema
configurado, então alternar o atributo em runtime não recalcula. Ligar o escuro
de verdade é recurso, não correção de acessibilidade, e não foi feito.

---

---

## 10. Testes

Dois projects em [vitest.config.mts](vitest.config.mts), e a divisão não é
estética:

| Project | Onde | Banco | O que testa |
|---|---|---|---|
| `unit` | `src/**/*.test.ts`, ao lado do código | nenhum | lógica pura: dinheiro, calendário, divisão de parcelas, derivação de status |
| `integration` | `tests/integration/**` | `tms_finance_test` real | serviços de `src/lib` contra Postgres, sem mock do Next |

Fora do Vitest, há um terceiro nível:

| Comando | Onde | Precisa de | O que testa |
|---|---|---|---|
| `npm run test:a11y` | [scripts/a11y-audit.ts](scripts/a11y-audit.ts) | dev server + Chrome | axe-core nas 13 rotas, contra WCAG 2.2 AA |

**Por que fora do Vitest:** a regra `color-contrast` do axe compara a cor
computada do texto com a do fundo pintado atrás dele — precisa de layout e de
cascata resolvida, e o jsdom não tem nenhum dos dois. Um teste de contraste em
jsdom **passa sempre**, o que é pior que não ter teste. O par barato dele é
[src/theme.test.ts](src/theme.test.ts), que roda em milissegundos, trava os
tokens do tema e roda no `npm test` normal. Os dois se cobrem: o unitário pega
regressão de token, o script pega combinação nova numa tela.

Regras:

- **Módulo puro → teste unitário.** Módulo que fala com o banco → teste de
  integração. Não há mock de Prisma em nenhum lugar.
- **Todo teste que mexe em dinheiro afirma sobre as duas pontas** e usa
  `recomputeBalance` para provar que o denormalizado bate com a soma dos
  lançamentos.
- **Todo teste que checa recusa afirma também que nada mudou.** "Rejeitou" sem
  "e não deixou lixo" não prova atomicidade.
- **Câmbio nunca vai à rede.** [tests/setup-fx.ts](tests/setup-fx.ts) mocka
  `@/lib/fxService` globalmente. Mocka **as duas** funções (`getExchangeRate` e
  `resolveRatesToBase`), porque em ESM uma chamada interna do módulo não passa
  pelo mock.
- **Relógio explícito.** Funções que dependem de "hoje" recebem `now` como
  parâmetro com default, e o teste passa uma data fixa. Um teste que dependa do
  relógio real quebra sozinho com o passar dos meses.
- **Aritmética de calendário roda em vários fusos** (ver seção 3).
- `resetDb` faz `TRUNCATE ... RESTART IDENTITY CASCADE` em `beforeEach`, com a
  lista de tabelas lida do catálogo — tabela nova entra no reset sem editar
  nada. Transação com rollback não serviria: o código sob teste já usa
  `prisma.$transaction`.
- `fileParallelism: false`: um banco compartilhado com TRUNCATE por teste não
  tolera concorrência entre arquivos.
- O global setup se recusa a rodar se `DATABASE_URL` não contiver
  `tms_finance_test`.

Nota de operação: rodar a suíte com o `npm run dev` ativo em WSL já produziu uma
falha isolada por contenção de recurso, contra `testTimeout: 20_000`. Pare o dev
server antes de rodar os testes.

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

---

## 12. Convenções de código

- Comentários em **pt-BR**; mensagens de commit em **inglês** (`tipo(escopo):
  descrição`, um commit por fase).
- Comentário é direto. Diz **por que**, nunca o que a linha faz, e só quando o
  código não consegue dizer sozinho: uma armadilha de concorrência, um campo que
  parece intercambiável e não é, uma alternativa que falha.
- Curto não é críptico. Corte a narrativa, não a informação — quem lê tem de
  entender sem decifrar. Uma ou duas linhas costumam bastar.
- Boa parte dos comentários deste repositório documenta um bug já pago. Antes de
  apagar um que parece óbvio, confira se não é o aviso que impede o bug de
  voltar.
- Comentário não cita documento, seção, RN, fase nem histórico de dependência:
  isso envelhece sem ninguém notar e não ajuda quem está lendo a linha.
- Componentes recebem `props` num objeto tipado e desestruturado na primeira
  linha da função.
- Nomes de domínio em português na UI e nos dados (`descricao` em teste,
  "Recorrentes" no menu); identificadores de código em inglês.
- Parte destas convenções é verificada por lint, não por revisão: chaves
  obrigatórias em todo bloco (`curly`), tipo de retorno explícito em
  `src/lib/**` e indentação. Ver [eslint.config.mjs](eslint.config.mjs).
- Nada é dado por pronto sem o portão de qualidade do
  [README](README.md#desenvolvimento) e sem abrir cada tela nova no navegador
  (§8).

---

## 13. Superfície de agente

Um endpoint MCP em `POST /api/agent/mcp` dá a um agente externo leitura e
escrita sobre os dados de um usuário, autenticado por token opaco com escopos.
[src/app/api/agent/mcp/route.ts](src/app/api/agent/mcp/route.ts) é a entrada;
[src/mcp/](src/mcp/) é a casca; os serviços de `src/lib/` não foram tocados.

Isto foi baratíssimo de construir por um motivo, e o motivo é a regra da §1:
**todo serviço recebe `userId` explícito, nunca chama `auth()`, e escopa toda
consulta por ele.** A camada de serviço já era uma API sem sessão. O trabalho
foi escrever uma segunda casca sobre ela.

### `src/mcp/` é irmã de `src/actions/`, não cliente dela

```
src/app/**/page.tsx        Server Component  ─┐
src/actions/<domínio>.ts   Server Action     ─┼→ src/lib/<domínio>.ts
src/mcp/tools/*.ts         MCP tool          ─┘
```

A duplicação das duas cascas é deliberada. Duas diferenças a sustentam:

1. Toda action começa com `requireUser()`, que faz `redirect("/login")`. É por
   isso que [src/actions/guard.ts](src/actions/guard.ts) precisa repassar o
   `NEXT_REDIRECT`. Em `src/mcp/` esse caminho **não existe**: a autenticação é
   bearer token e a falha é um 401 antes do guard. Repassar redirect ali seria
   código morto.
2. `ActionResult` carrega mensagem em pt-BR pronta para um formulário Mantine. O
   agente precisa de erro **classificado** — um `code` estável sobre o qual
   decidir, e um `retry` dizendo o que mudar.

O que as duas compartilham é o que importa: os schemas de
[src/lib/validations.ts](src/lib/validations.ts), sem alteração. O agente não
consegue gravar nada que a UI recusaria. E isso rende no protocolo: o SDK valida
o `inputSchema` declarado no seam e devolve **as mensagens em pt-BR do próprio
módulo** — `"Data inválida"` para `2026-02-30`, sem uma linha escrita para isso.

### Dinheiro sai como string

A §2 permite `number` na borda de saída "porque nada soma depois dela", e para a
UI é verdade. Para um LLM não é: ele *vai* somar o que receber. Então
[src/mcp/serializers.ts](src/mcp/serializers.ts) emite string de 2 casas, e a
`description` de cada ferramenta manda usar as agregações prontas.

Pelo mesmo motivo da §5, fluxo de caixa e gasto por categoria saem com **nomes
distintos** (`cash_flow.cash_out` × `spending.total`) e um campo `relation` com
a identidade entre eles. A exigência de rotular a diferença é mais forte aqui
que na UI: o agente escreve prosa sobre os números, e dois valores diferentes
com o mesmo nome produzem uma frase errada.

Cor de categoria é descartada em toda projeção: é dado de renderização.

### Leitura não materializa recorrentes

O painel materializa durante a renderização (§14, "é escrita num GET"), e para
um humano abrindo uma página isso é aceitável: idempotente e barato. Para um
chamador de máquina que pode disparar cem leituras, escrita implícita em leitura
é armadilha. `get_balance_projection` expõe `pending_count` e o agente chama
`materialize_recurring` **explicitamente**, sob escopo de escrita.

### Remoção em cascata é em duas fases

As cinco remoções em cascata (`delete_account`, `delete_credit_card`,
`delete_person`, `delete_category`, `delete_debt`) exigem escopo
`destructive:write` **e** confirmação. A primeira chamada não executa nada: mede
o impacto em [src/lib/deletionImpact.ts](src/lib/deletionImpact.ts) e devolve
`inputRequired({ inputRequests: { confirm }, requestState })`.

O risco que isto endereça é específico. Este app **registra** transações, não
movimenta dinheiro: não há transferência a reverter nem terceiro lesado. O único
dano irreversível é **perda silenciosa de histórico**. Um lançamento errado se
corrige editando; uma conta apagada leva todos os lançamentos dela por
`onDelete: Cascade` e não volta. Daí o teto de valor por operação ter sido
descartado como cerimônia sem função, e a proteção mirar só a cascata.

Por que o padrão multi-round-trip do protocolo em vez de um parâmetro
`confirmationToken`: a pergunta vai **ao cliente**, não ao agente. Um host com
humano na frente exibe o prompt — o `roundTimeoutMs` default do SDK é 600s,
descrito como *human-paced*. Sem humano, o agente decide, mas tendo lido o
impacto.

**Integridade do `requestState`.** Ele volta pelo cliente e é entrada controlada
pelo atacante na reentrada; a spec exige HMAC/AEAD e o SDK não aplica nada por
default. [src/mcp/confirm.ts](src/mcp/confirm.ts) usa o
`createRequestStateCodec` do próprio SDK, com `bind` no `clientId` (o id do
token) e no método — o MUST de user-binding. O `verify` entra em
`ServerOptions.requestState.verify`, que roda **antes** do handler: state
adulterado vira `-32602` e nunca chega à ferramenta. O `bind` cobre principal e
método, **não os argumentos** — conferir que o state foi emitido para *este* id
é trabalho do `readConfirmation`, e há teste para cada forma de forjar.

**Mecânica de protocolo que custou tempo para descobrir.** O `input_required`
existe só na revisão 2026-07-28, e o `initialize` **negocia para 2025-11-25** —
`SUPPORTED_PROTOCOL_VERSIONS` do SDK não lista a 2026-07-28. Ela não é negociada
por handshake: é declarada **por requisição**, o que é o que a mantém stateless.
Um `tools/call` 2026-era precisa de:

- headers `Mcp-Method`, `Mcp-Name` e `Mcp-Protocol-Version: 2026-07-28`;
- `params._meta` com `io.modelcontextprotocol/protocolVersion` **e**
  `io.modelcontextprotocol/clientCapabilities` (com `elicitation`).

Sem isso a conexão é tratada como 2025-era, e aí o legacy shim tentaria um
`elicitation/create` server→client — impossível em serving stateless. O
resultado é um erro claro e **nenhuma remoção**: falha fechado, que é o
comportamento certo, mas significa que um cliente incapaz de elicitação
simplesmente não usa as ferramentas destrutivas.

### Credenciais

Token opaco de 256 bits guardado **só** como HMAC-SHA256 com o pepper de
`AGENT_TOKEN_PEPPER` ([src/lib/agentTokens.ts](src/lib/agentTokens.ts)).

- **Não JWT:** JWT não é revogável antes de expirar, e a única forma de
  invalidar em massa seria reciclar `AUTH_SECRET` — que derrubaria todas as
  sessões web. O oposto de contenção. Aqui revogar é um `UPDATE`.
- **Não bcrypt:** 256 bits aleatórios não são força-brutáveis, então o KDF não
  compra nada e entraria no caminho quente de toda chamada. O pepper dá a defesa
  em profundidade que interessa: dump do banco sem o ambiente não monta a tabela
  de hashes.
- Emissão por `npm run agent:token` — o valor em claro existe uma vez, no
  stdout. Uma tela faria o token passar pelo histórico do navegador e pelo
  payload de RSC.
- `setup:write` está no vocabulário mas **sem ferramenta**, e a razão é uma só:
  criar conta ou cartão fixa a moeda, que é imutável depois (§5). Errar ali não
  se corrige editando.

  A moeda base **não** cai nessa razão — ela é mutável (§5), então
  `set_base_currency` seria a primeira ferramenta legítima do escopo. Decidido
  na Fase 6 **não** criá-la: trocar a moeda base reexpressa todo número que o
  agente lê depois, e é a decisão que mais muda a interpretação dos relatórios
  por menos esforço. Quem a toma deve estar olhando a tela onde a consequência
  está escrita. Configuração fica no navegador — e agora essa frase vale sem
  exceção, porque a tela existe (`/dashboard/settings`).

`/api/agent/mcp` **não** entra no matcher de [src/proxy.ts](src/proxy.ts), que
cobre só `/dashboard/:path*`. A autenticação é bearer token, e a doc do Next 16
diz que proxy "não é solução de autorização" — deixá-lo interceptar produziria
um redirect para `/login` em vez de um 401 honesto.

### Auditoria: o que ela pega e o que não pega

`agent_audit_log` grava **toda** chamada que alcança o guard, inclusive recusa
por escopo e por cota. `CONFIRM_REQUIRED` não é falha — é a primeira metade de
uma remoção; uma linha dessas sem o `OK` correspondente diz que o agente pediu,
viu o impacto e desistiu.

**Todas as ferramentas são registradas para todo token**, e a recusa por escopo
acontece no guard. Filtrar o `tools/list` por escopo foi tentado e revertido:
uma ferramenta não registrada não é chamável, então a tentativa morre como
`-32602 "Tool not found"` **antes** do guard, sem deixar rastro — e um token
só-leitura sondando `delete_account` é exatamente o evento que se quer ver
depois. O custo é uma ida e volta desperdiçada; em troca a recusa é auditada e
**nomeia o escopo faltante**, acionável quando a negação foi má configuração.

Duas lacunas reais, pelo mesmo mecanismo — o seam do SDK recusa antes do guard:

- violação do `inputSchema` declarado (valor negativo, data inexistente);
- `requestState` adulterado.

As duas produzem resposta correta ao agente e **não** geram linha. Fechá-las
exigiria declarar `inputSchema` frouxo, o que tiraria do `tools/list` a única
forma de o agente saber como chamar as ferramentas — troca ruim. As categorias
que importam num incidente (escopo, cota, erro de domínio, confirmação, sucesso)
são todas auditadas.

Rate limit é janela deslizante em SQL sobre a própria trilha
([src/lib/agentRateLimit.ts](src/lib/agentRateLimit.ts)). No Postgres e não em
memória porque o Fluid Compute reusa instâncias mas não garante que duas
chamadas caiam na mesma: um bucket em processo contaria cada instância
separadamente e o limite real seria N vezes o configurado — pior que não ter
limite, porque parece ter. Contém loop desgovernado, não fraude.

---

## 14. Estado atual e lacunas

**Fases 0 a 6 concluídas — as RN-01 a RN-05 estão implementadas, sem exceção.**
A última a fechar foi a primeira metade da RN-01.2, hoje a tela
`/dashboard/settings` sobre [src/lib/settings.ts](src/lib/settings.ts); o motivo
de a moeda base ser a única moeda mutável está na §5.

Lacunas reais, não escondidas:

- Não há teste automatizado de UI **funcional**. `npm run test:a11y` cobre
  acessibilidade nas 13 rotas com axe-core em Chrome real, mas não exercita
  fluxo: submissão, estado de erro e as armadilhas da §8 seguem dependendo de
  verificação manual no navegador, e por isso ela não é opcional.
- `deletePerson` remove o histórico de dívidas quitadas junto (cascade). Os
  lançamentos no fluxo de caixa permanecem, mas o agrupamento por dívida é
  perdido. Recusamos apenas quando há posição em aberto.
- Ajustar uma cobrança de recorrente no cartão corrige **aquele ciclo**; os
  próximos exigem editar a recorrência. Isso é intencional, mas a UI só diz isso
  num aviso dentro do modal.
- Três telas materializam recorrentes durante a renderização — painel,
  lançamentos e recorrentes, as três chamando `materializeRecurring` em Server
  Component. É idempotente e barato no caso comum, mas é escrita num GET, em
  três rotas e não uma — a alternativa seria um cron, descartado por decisão de
  projeto.
- Nenhuma tela tem paginação. `listRecentTransactions` limita as linhas e as
  demais listas trazem tudo; com anos de histórico isso vira problema.
- **`deleteAccount` é impossível numa conta que já pagou fatura de cartão, e
  falha com erro de constraint cru.** `Invoice.paymentAccountId` é `onDelete:
  SetNull`, mas o CHECK `invoices_paid_consistency_check` exige
  `payment_account_id IS NOT NULL` sempre que `status = 'PAID'`: os dois se
  contradizem, e o `deleteMany` de [src/lib/accounts.ts](src/lib/accounts.ts)
  estoura. Descoberto ao medir o impacto para a confirmação da §13, e ainda
  **não corrigido** — se fatura paga deve bloquear a remoção da conta, como já
  bloqueia a do cartão, é decisão de domínio e pertence a `deleteAccount`. Por
  ora [src/lib/deletionImpact.ts](src/lib/deletionImpact.ts) devolve isso como
  `blockedBy`, então o agente recebe uma explicação em vez de um erro do
  Postgres. Pela UI o caminho continua estourando.
- `deleteAccount` também não tem guarda alguma no caso permitido: apaga em
  cascata todos os lançamentos e recorrentes da conta. Suas irmãs se protegem
  (`deleteCreditCard` recusa com fatura paga, `deletePerson` com posição em
  aberto). Pela API o preview de impacto cobre; pela UI o
  `modals.openConfirmModal` confirma sem dizer o que se perde —
  `describeDeletionImpact` serviria a ele, e não foi ligado.
- `deleteCategory` tem a mesma forma e a mesma falta: `deleteMany` sem guarda em
  [src/lib/categories.ts](src/lib/categories.ts). `categoryId` é obrigatório em
  `RecurringExpense` e em `Debt`, sem `onDelete`, então o Postgres recusa por FK
  e o serviço estoura com erro cru — o gêmeo do caso da conta acima. No caso
  permitido apaga as subcategorias em cascata e deixa os lançamentos como "Sem
  categoria". Pela API o `blockedBy` de `describeDeletionImpact` antecipa a
  recusa e o guard nem tenta executar; pela UI sai "Ocorreu um erro inesperado".
- **O veredito `INVALID_INPUT` é inalcançável em produção.** Toda ferramenta
  declara o *mesmo* objeto zod como `inputSchema` do seam e como `schema` do
  guard, e o SDK lança `InvalidParams` antes de chamar o handler — então o
  `safeParse` de [src/mcp/guard.ts](src/mcp/guard.ts), única origem do veredito,
  nunca dispara, e a recusa não deixa linha na trilha (§13). Os testes que o
  afirmam passam porque [tests/mcpHarness.ts](tests/mcpHarness.ts) chama
  `runTool` direto, sem o seam: eles provam que o guard valida, não que a trilha
  registre.
