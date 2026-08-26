# TMS Finance — decisões técnicas, padrões e regras

Este documento é a referência de como o código deste repositório é escrito, e
**por quê**. Cada regra vem com o motivo: sem ele, a regra parece arbitrária e é
a primeira coisa que alguém contorna sob pressão.

Escopo e precedência:

| Documento | O que manda |
|---|---|
| [docs/business-rules.md](docs/business-rules.md) | O domínio: RN-01 a RN-05. É a fonte de verdade do *o quê*. |
| [prisma/schema.prisma](prisma/schema.prisma) + `prisma/migrations/*.sql` | O modelo de dados e as `CHECK`. Nenhuma regra aqui sobrepõe uma constraint de lá. |
| [AGENTS.md](AGENTS.md) | As 5 regras financeiras críticas, o portão de qualidade e o aviso sobre a versão do Next.js. |
| **Este arquivo** | O *como*: camadas, padrões, armadilhas conhecidas. |
| [.github/skills/](.github/skills/) | Procedimento por tarefa. Não contém regra própria: aponta para a regra daqui. |
| [README.md](README.md) | Subir e configurar o projeto. Não decide nada sobre o código. |

**Afirmação factual sobre o código perde para o código, qualquer que seja o
posto do documento.** A tabela ordena assunto, não verdade: quando um `grep`
contradiz uma frase daqui, quem encontrou corrige a prosa no mesmo commit — ou
corrige o código, se era a frase que estava certa. O que não serve é deixar as
duas.

O código TypeScript **não** cita este documento nem as RN. Comentário explica a
linha que está ao lado; contexto de projeto mora aqui. Quando as duas coisas se
cruzam, quem procura chega por busca de nome, não por referência cruzada que
envelhece.

A exceção é o SQL das migrations, que cita RN de propósito — o motivo está em
Convenções de código.

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
  (`requireAccount`, `assertAccountOwned`, `assertCategoryOwned`,
  `assertPersonOwned`). Serviço nenhum reimplementa a sua: a checagem já esteve
  copiada em vários serviços, e corrigir uma cópia deixava as outras erradas.

Única exceção: [src/lib/session.ts](src/lib/session.ts) chama `auth()` e
`redirect()`, porque **é** o módulo de sessão. Nenhum outro módulo de `src/lib`
pode fazer isso.

### Serviço de entrada e helper de transação

`src/lib/` tem dois tipos de função exportada, e confundi-los faz a regra do
`userId` explícito parecer violada:

- **Serviço de entrada** — `createTransaction(userId, input)`, `payInvoice(userId,
  invoiceId, input)`, `deleteDebt(userId, id)`. Recebe `userId` primeiro, é o que
  a action e a ferramenta MCP chamam, e **é ele** quem abre o `$transaction`.
- **Helper de transação** — recebe `tx: Tx` primeiro e **nenhum** `userId`. Roda
  *dentro* de um `$transaction` já aberto, sobre linhas que o serviço de entrada
  já resolveu e cuja posse ele já conferiu.

São cinco, e a lista é fechada: `applyToBalance` e `lockTransaction` em
[src/lib/accountBalance.ts](src/lib/accountBalance.ts); `resolveInvoice`,
`recalcInvoiceTotal` e `recalcInvoiceTotals` em
[src/lib/invoices.ts](src/lib/invoices.ts).

Eles não recebem `userId` de propósito: recheco de posse dentro da transação
seria uma consulta a mais por linha tocada para reafirmar o que a entrada já
provou. O preço é que **helper de transação nunca é ponto de entrada** — se uma
action ou ferramenta MCP chamar um deles direto, não há checagem de posse
nenhuma no caminho. Helper novo com `tx` primeiro entra nesta lista ou vira
privado do módulo.

### Onde mexer, por tarefa

| Tarefa | Comece por |
|---|---|
| Campo novo num formulário | [src/lib/validations.ts](src/lib/validations.ts) → `<domínio>Fields.tsx` → `data` de **cada** escrita do serviço → [src/mcp/serializers.ts](src/mcp/serializers.ts) |
| Regra de negócio nova | `src/lib/<domínio>.ts`, e a `CHECK` na migration se ela for invariante |
| Ferramenta MCP nova | [src/mcp/scopes.ts](src/mcp/scopes.ts) → `src/mcp/tools/<tipo>.ts` com `defineTool` → `tests/integration/mcpRegistry.test.ts` acusa o esquecimento |
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

**Regra 2: o resto dos centavos vai na primeira parcela.** Uma regra de divisão,
dois pontos de entrada. A aritmética mora em
[src/lib/installmentSplit.ts](src/lib/installmentSplit.ts) (`splitCents`,
centavos inteiros, sem imports) e existe separada por um motivo só: o
formulário precisa da prévia sem arrastar o `Decimal` do Prisma, que é
server-only, para o navegador.
[src/lib/installments.ts](src/lib/installments.ts) é a porta do servidor:
`splitInstallments` valida o número de parcelas, o teto de `MAX_INSTALLMENTS` e
o total mínimo — parcela de zero centavo `transactions_positive_amounts_check`
recusa — converte de e para `Decimal`, e **delega**. Chamar `splitCents` direto
no servidor pula as três validações.

Há teste afirmando que as duas portas concordam para uma tabela de totais ×
parcelas. Ele prova menos do que parece — compara um wrapper com o que ele
delega — e é bom que prove menos: não há duas fontes para divergir. O que ele
trava é a conversão de ida e volta entre `Decimal` e centavos.

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

Estes padrões existem porque a alternativa ingênua falhou em teste. Não os
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

**Estorno lê a pre-image sob o mesmo lock, nunca a leitura de fora.** Editar ou
apagar um lançamento é desfazer o efeito antigo e aplicar o novo — e o retrato
lido antes de abrir a `$transaction` pode ter envelhecido no meio, porque entre
as duas coisas há uma chamada de câmbio. Estornar por ele devolve o valor errado
à conta errada. `lockTransaction`
([src/lib/accountBalance.ts](src/lib/accountBalance.ts)) é o único caminho, e
vale também para o **valor** que a operação vai usar: `payInvoice` relê
`total_amount` sob o lock, porque uma compra lançada no intervalo muda o que a
fatura deve.

**Ordem de lock consistente.** Faturas são sempre travadas em **ordem crescente
de competência** — é o que `recalcInvoiceTotals` garante. Iterar um `Set` deixa
a ordem dependendo do que o Postgres devolveu, e duas operações sobre as mesmas
duas faturas podem travar em sentidos opostos. Em `debts.ts` a ordem é dívida,
depois movimentação, nas duas escritas que travam as duas.

**Idempotência da materialização: dois mecanismos, não um.** A materialização de
recorrentes usa o marcador `lastGeneratedAt` ("tudo até esta data já foi
gerado") **e** o índice único `(recurring_expense_id, date)`. O marcador é o que
faz apagar uma pendência indesejada ser definitivo; o índice é o que segura duas
execuções simultâneas — o cron e uma escrita, por exemplo.

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

Invariante por linha: `amount × exchangeRate = convertedAmount`, garantida por
`transactions_exchange_rate_check` no banco. Numa compra parcelada em moeda
estrangeira, isso significa dividir o total na moeda do lançamento e converter
cada parcela — a soma dos convertidos pode diferir do total convertido em um
centavo, e essa é a escolha deliberada. A divergência é entre a **soma** e o
total, nunca dentro de uma linha, e por isso a constraint continua valendo.

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

### A segunda conversão: cotação da competência no passado, de hoje no presente

`resolveRatesToBase` recebe uma data **opcional**, e a escolha por chamada é
deliberada:

| Pergunta | Onde | Data |
|---|---|---|
| "quanto gastei em janeiro" | `getMonthSummary` | último dia da competência |
| "quanto eu tenho" | `getAccountBalances` | nenhuma (mais recente) |
| "quanto sai deste mês" | `projection.ts` | nenhuma |
| "quanto me devem" | `getOpenInvoices`, `getDebtsByCategory`, `people.ts` | nenhuma |

O relatório de um mês fechado não pode mudar de valor todo dia; saldo,
patrimônio e projeção **são** perguntas sobre o presente, e reexpressá-los pela
cotação de hoje é o certo. A UI diz isso ao usuário na descrição do campo de
moeda base.

A conversão **da época por lançamento** já está gravada no `exchangeRate` que
satisfaz `amount × exchangeRate = convertedAmount`; esta segunda conversão é
outra coisa — a re-expressão de moedas distintas numa só, que `convertedAmount`
sozinho não resolve porque está na moeda da conta.

Quando a competência ainda não fechou, a data é hoje: não existe cotação de data
futura.

### A taxa é arredondada antes de converter, não depois

O invariante por linha `amount × exchangeRate = convertedAmount` só vale porque
`toStoredRate` reduz a taxa às 4 casas da coluna `exchange_rate` **antes** de
qualquer multiplicação ([src/lib/fxService.ts](src/lib/fxService.ts)). Gravar
`rate.toFixed(4)` mas converter com a taxa cheia deixa o invariante falso no
banco: uma taxa manual de `5,12345678` sobre R$ 1.000,00 diverge em 4 centavos.
O bug existiu e passava despercebido nos testes porque
[tests/setup-fx.ts](tests/setup-fx.ts) usava taxas exatas em 4 casas. Hoje o
Postgres recusaria a linha, e o teste da recusa vive em
[tests/integration/schema.test.ts](tests/integration/schema.test.ts).

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
[tests/integration/schema.test.ts](tests/integration/schema.test.ts), que
reprova tanto constraint nova sem entrada na lista quanto constraint removida —
uma contagem em prosa aqui já divergiu do banco uma vez. O Zod valida para dar
mensagem boa; o `CHECK` garante que nenhum caminho de código escape. Enums em
`CHECK` precisam de cast explícito: `"status" <>
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
todas as rotas do app fecham em zero, medidas com axe-core em Chrome real.

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

**Botão só de ícone que o Mantine renderiza por conta própria também precisa de
rótulo, e o lugar disso é o tema.** Três nascem sem nome acessível — o "x" do
`Modal`, o do `clearable` de `Select` e `DatePickerInput`
(`InputClearButton`), e o da `Notification`. Ficam em `components` de
[src/theme.ts](src/theme.ts) e não no componente que os usa: o modal de
confirmação nasce do `modals` manager e a notificação do
`notifications.show`, então não há JSX nosso onde passar o prop. Os dois
primeiros foram achados pelo passe com modal aberto do `test:a11y`; o terceiro
não — a notificação some antes de o axe rodar.

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
| `npm run test:a11y` | [scripts/a11y-audit.ts](scripts/a11y-audit.ts) | dev server + Chrome + banco com dados | axe-core em todas as rotas do app, contra WCAG 2.2 AA |

**Duas passagens, e a segunda é a que achava coisa.** A primeira audita as
rotas; a segunda abre o formulário de cada tela que tem um e audita de novo.
Todo formulário deste app vive dentro de um `Modal`, e o conteúdo só existe no
DOM depois do clique — as sete telas com formulário estavam inteiramente fora da
medição, e o primeiro passe com elas abertas encontrou dois `button-name`
críticos.

O script **recusa** quando não alcança as rotas de detalhe ou quando um botão de
abrir formulário não aparece, em vez de auditar menos telas e sair 0: um gate
que degrada em silêncio não é gate. Na prática isso significa `npm run db:seed`
antes.

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

**O runtime é Node 22**, declarado em `.nvmrc` e em `engines` do
[package.json](package.json) — os dois têm de continuar batendo, ou o `npm ci`
deixa de reclamar e a divergência só aparece em produção. `@types/node` ainda
está na linha 20.x, o que é conservador e não perigoso: ele descreve menos API
do que existe, nunca mais. Quando subir, sobe sozinho.

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

As 30 dependências são pinadas exatas, por reprodutibilidade, e quem as move é o
Renovate ([renovate.json](renovate.json)). O agrupamento não é estético: Mantine,
Prisma e Next saem em PR único porque versões desalinhadas dentro de cada bloco
quebram em runtime, e `next-auth` e o SDK do MCP saem **isolados** porque o
primeiro gateia todo o `/dashboard` e o segundo gateia a escrita do agente — os
dois estão em beta ou major recente, e revisar isso no meio de um lote de
dezoito bumps é como não revisar.

---

## 12. Convenções de código

- Comentários em **pt-BR**; mensagens de commit em **inglês** (`tipo(escopo):
  descrição`).
- Comentário é direto. Diz **por que**, nunca o que a linha faz, e só quando o
  código não consegue dizer sozinho: uma armadilha de concorrência, um campo que
  parece intercambiável e não é, uma alternativa que falha.
- Curto não é críptico. Corte a narrativa, não a informação — quem lê tem de
  entender sem decifrar. Uma ou duas linhas bastam para comentário inline.
- **O cabeçalho do módulo é exceção ao tamanho, não à disciplina.** Pode ocupar
  um parágrafo, ou uma tabela, porque é onde mora o que não cabe em linha
  nenhuma: o que o módulo existe para impedir, o contrato que ele impõe a quem
  chama, e a alternativa óbvia que não funciona. O que ele não faz é enumerar as
  funções do arquivo, repetir as assinaturas nem contar como o módulo chegou ao
  formato atual — isso o código ao lado já diz, e envelhece sozinho. Cabeçalho
  que se lê inteiro sem aprender nada é ruído, só que longo.
- Campo de interface ou prop recebe comentário quando o tipo não diz o que o
  leitor precisa: unidade, faixa, invariante, ou qual de dois campos parecidos é
  o certo. "Na moeda da conta — é este que moveu o saldo" ganha o seu lugar;
  "ícone opcional" sobre `icon?: LucideIcon` não.
- Boa parte dos comentários deste repositório documenta um bug já pago. O que
  fica é a **regra que o bug produziu**, não a crônica do refactor que a
  produziu — "fonte única: duas listas espelhadas divergiam e a tela ficava
  velha conforme quem escrevesse", e não "antes eram duas tabelas, o MCP
  revalidava uma coisa e a action outra". Antes de apagar um comentário que
  parece óbvio, confira se não é o aviso que impede o bug de voltar.
- Comentário em TypeScript não cita documento, seção, RN, fase nem histórico de
  dependência: isso envelhece sem ninguém notar e não ajuda quem está lendo a
  linha. Se a informação importa ali, escreva a informação, não o ponteiro.
- Banner que separa seções dentro de um arquivo é permitido, e é sintoma: ele só
  ajuda quando o arquivo é grande, e arquivo grande costuma ser dois módulos que
  ainda não se separaram. Antes de acrescentar um, pergunte se aquela seção não
  deveria ser um arquivo.
- **A exceção é o SQL de migration, que cita RN.** Migration é append-only: o
  SQL daquele arquivo nunca muda, então a citação não pode divergir do código ao
  lado dela — e é exatamente ali que alguém pergunta por que uma `CHECK` existe.
  O motivo de proibir em TypeScript é o envelhecimento, e ele não se aplica.
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
[src/mcp/](src/mcp/) é a casca; os serviços de `src/lib/` não foram tocados.

Isto foi baratíssimo de construir por um motivo, e o motivo é a regra de Três
camadas:
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

Dinheiro permite `number` na borda de saída "porque nada soma depois dela", e
para a UI é verdade. Para um LLM não é: ele *vai* somar o que receber. Então
[src/mcp/serializers.ts](src/mcp/serializers.ts) emite string de 2 casas, e a
`description` de cada ferramenta manda usar as agregações prontas.

Pelo mesmo motivo de Multi-moeda, fluxo de caixa e gasto por categoria saem com
**nomes distintos** (`cash_flow.cash_out` × `spending.total`) e um campo
`relation` com a identidade entre eles. A exigência de rotular a diferença é
mais forte aqui que na UI: o agente escreve prosa sobre os números, e dois
valores diferentes com o mesmo nome produzem uma frase errada.

Cor de categoria é descartada em toda projeção: é dado de renderização.

### O nome da ferramenta é escrito uma vez

Ferramenta nova entra por `defineTool` ou `defineDestructiveTool`
([src/mcp/define.ts](src/mcp/define.ts)), nunca por `server.registerTool` direto.
A forma manual repetia o nome três vezes — no registro, no `tool:` do guard e em
[src/mcp/scopes.ts](src/mcp/scopes.ts) — e o schema duas, como `inputSchema` e
como `schema` da validação. Divergir em qualquer uma era silencioso: o
`tools/list` anunciaria uma coisa e a validação aplicaria outra, ou a auditoria
gravaria o nome errado.

O helper come duas dessas ocorrências. A terceira é fechada por
`tests/integration/mcpRegistry.test.ts`, que registra num `McpServer` de mentira
e compara os nomes de fato registrados com as chaves de `TOOL_SCOPES` — e que
chama o callback registrado de cada destrutiva para afirmar que a primeira
chamada devolve `input_required`. `src/mcp/scopes.test.ts` não podia fazer isso:
as listas de `scopes.ts` são a única fonte que ele conhece, então ele comparava
o mapa consigo mesmo.

`defineTool` faz uma erasure de tipo sobre `registerTool`, e ela é necessária: o
SDK deriva o tipo dos argumentos por condicional sobre o `inputSchema`, e um
genérico ainda não resolvido a mantém diferida — nenhuma das duas sobrecargas
casa. A erasure fica dentro do helper, uma vez; o call site continua tipado.

### Leitura não materializa recorrentes

O painel materializa durante a renderização (Estado atual e lacunas, "é escrita
num GET"), e para
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
humano na frente exibe o prompt; sem humano, o agente decide, mas tendo lido o
impacto.

O orçamento dessa resposta é `AGENT_CONFIRM_TTL_SECONDS`, default **120s**
([src/mcp/confirm.ts](src/mcp/confirm.ts)). Passou disso, o `requestState`
expirou e a remoção é recusada — um humano que leve três minutos para decidir
recomeça. O `roundTimeoutMs` de 600s que aparece no SDK não governa isto: ele é
o `DEFAULT_LEGACY_SHIM_ROUND_TIMEOUT_MS`, do caminho que a seção abaixo declara
impossível em serving stateless.

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
existe só na revisão **2026-07-28**, e o `initialize` **negocia para 2025-11-25**
— `SUPPORTED_PROTOCOL_VERSIONS` do SDK não lista a 2026-07-28. Ela não é
negociada por handshake: é declarada **por requisição**, o que é o que a mantém
stateless. Esse pressuposto está travado: `MCP_PROTOCOL_REVISION` em
[src/mcp/confirm.ts](src/mcp/confirm.ts) e um teste em `confirm.test.ts` que
reprova no dia em que o SDK promover a revisão — sem ele, este parágrafo
apenas viraria falso, sem nada falhar.

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
  criar conta ou cartão fixa a moeda, que é imutável depois (Multi-moeda). Errar
  ali não se corrige editando.

  A moeda base **não** cai nessa razão — ela é mutável (Multi-moeda), então
  `set_base_currency` seria a primeira ferramenta legítima do escopo. Decidido
  junto com a tela de configurações **não** criá-la: trocar a moeda base
  reexpressa todo número que o
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

Rate limit é janela deslizante em SQL sobre `rate_limit_hits`
([src/lib/rateLimit.ts](src/lib/rateLimit.ts), consumido por
[src/lib/agentRateLimit.ts](src/lib/agentRateLimit.ts)). No Postgres e não em
memória porque o Fluid Compute reusa instâncias mas não garante que duas
chamadas caiam na mesma: um bucket em processo contaria cada instância
separadamente e o limite real seria N vezes o configurado — pior que não ter
limite, porque parece ter. Contém loop desgovernado, não fraude.

A contagem já morou na própria trilha de auditoria, que dispensava tabela nova.
Não servia, e a razão vale para qualquer limitador: **a tentativa é gravada
antes de ser contada**. A auditoria só é escrita depois de a ferramenta rodar,
então N chamadas simultâneas contavam todas zero e passavam juntas — o padrão
exato de uma ferramenta automatizada. Com a gravação antes, cada requisição
enxerga ao menos a própria linha e o excedente fica limitado ao que estiver de
fato em voo. A mesma tabela serve login e cadastro; os baldes estão em
`rateLimit.ts`.

---

## 14. Estado atual e lacunas

**Fases 0 a 6 concluídas — as RN-01 a RN-05 estão implementadas, sem exceção.**
A última a fechar foi a primeira metade da RN-01.2, hoje a tela
`/dashboard/settings` sobre [src/lib/settings.ts](src/lib/settings.ts); o motivo
de a moeda base ser a única moeda mutável está em Multi-moeda.

Lacunas reais, não escondidas. Aqui fica **o mecanismo** — o que é, por que é
assim, o que quebra; a fila e a prioridade ficam no `ACTION-PLAN.md`, e o número
entre parênteses é o item de lá que resolve cada uma. Um dono cada: duas listas
sem referência mútua divergem.

- Não há teste automatizado de UI **funcional** (46). `npm run test:a11y` cobre
  acessibilidade em todas as rotas com axe-core em Chrome real, e desde o passe
  de modais também com cada formulário aberto — mas não exercita fluxo:
  submissão, estado de erro e as armadilhas de Server Components seguem
  dependendo de verificação manual no navegador, e por isso ela não é opcional.
  O tema escuro continua fora da medição, e vai continuar enquanto não houver
  alternador: hoje ele é inalcançável (Acessibilidade).
- `deletePerson` remove o histórico de dívidas quitadas junto (cascade). Os
  lançamentos no fluxo de caixa permanecem, mas o agrupamento por dívida é
  perdido. Recusamos apenas quando há posição em aberto.
- Ajustar uma cobrança de recorrente no cartão corrige **aquele ciclo**; os
  próximos exigem editar a recorrência. Isso é intencional, mas a UI só diz isso
  num aviso dentro do modal.
- A materialização de recorrentes saiu da renderização (31). Quem a dispara é
  `/api/cron/materialize-recurring`, diário, e as escritas de
  [src/actions/recurring.ts](src/actions/recurring.ts) — senão a recorrência
  recém-criada esperaria até o dia seguinte. O horizonte não é mais "a
  competência que o usuário abriu": `materializationHorizon` pergunta às próprias
  regras até onde ir, e uma anual pede até o mês do aniversário enquanto uma
  mensal pede o mês seguinte. Consequência: navegar para um mês além desse
  horizonte mostra projeção sem as ocorrências daquele mês, e a tela de
  recorrentes avisa quais ainda não foram geradas.
- Só a página de um cartão tem algo próximo de paginação — faturas pagas
  recolhidas num accordion (28). `listRecentTransactions` limita as linhas e as
  demais listas trazem tudo; com anos de histórico isso vira problema.
- **A remoção é recusada com mensagem e confirmada com número** (23).
  `accountDeletionBlocker` e `categoryDeletionBlocker` são fonte única — o
  serviço recusa por eles e [src/lib/deletionImpact.ts](src/lib/deletionImpact.ts)
  os consulta, em vez de reescrever a regra —, então conta com fatura paga ou
  movimentação de dívida, e categoria exigida por recorrente ou dívida, param
  em `InvalidOperationError` em pt-BR e não em erro cru do Postgres. No caso
  **permitido**, `DeleteEntityButton` — único botão de remoção do app — mostra o
  que cascateia via `DeletionImpactPreview`, para os cinco alvos que existem em
  `DELETION_TARGETS`. A contagem é buscada só depois de
  o modal abrir — medi-la ao renderizar a lista custaria uma consulta por linha
  —, e por isso o botão "Remover" nasce habilitado e é desabilitado por
  `modals.updateModal` quando o impacto chega com `blockedBy`. As quatro
  remoções restantes (compra, transação, recorrente, movimentação) não têm alvo
  em `DELETION_TARGETS` e seguem com texto fixo.
- **A revogação de sessão só é aplicada no runtime Node.** A comparação de
  `passwordChangedAt` contra o `authTime` do token vive no callback `jwt` de
  [src/auth.ts](src/auth.ts), porque consulta o Postgres;
  [src/auth.config.ts](src/auth.config.ts), que o proxy carrega no edge, não
  pode. Um cookie revogado ainda passa pelo proxy e é cortado no primeiro
  `auth()` — o que gateia dado, porque toda página e toda action começam por
  `requireUser()`. O custo seria uma consulta por requisição, que o
  `React.cache()` de [src/lib/session.ts](src/lib/session.ts) deduplica.
- **O veredito `INVALID_INPUT` é inalcançável em produção.** Toda ferramenta
  declara o *mesmo* objeto zod como `inputSchema` do seam e como `schema` do
  guard, e o SDK lança `InvalidParams` antes de chamar o handler — então o
  `safeParse` de [src/mcp/guard.ts](src/mcp/guard.ts), única origem do veredito,
  nunca dispara, e a recusa não deixa linha na trilha (Superfície de agente). Os
  testes que o afirmam passam porque
  [tests/mcpHarness.ts](tests/mcpHarness.ts) chama `runTool` direto, sem o seam:
  eles provam que o guard valida, não que a trilha registre.
  `tests/integration/mcpRegistry.test.ts` **não** fecha isso: ele chama o
  callback registrado, que é o handler, e não o seam que roda antes dele.
