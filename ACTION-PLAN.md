# Plano de ação — correção dos achados da revisão

Origem: revisão de 26/08/2026 por sete revisores independentes (dev recém-chegado,
usuário, dev sênior, segurança, auditoria financeira, QA, SRE). 86 achados, 19
conferidos à mão contra o código. O relatório completo, com evidência e cenário
de falha por achado, está em
[claude.ai/code/artifact/5d9b4fee-a5a3-4fe2-a601-4cd3f6b96a23](https://claude.ai/code/artifact/5d9b4fee-a5a3-4fe2-a601-4cd3f6b96a23).

**Fases 0 a 6 aplicadas.** As decisões D1, D3, D4 e D5 foram confirmadas como
recomendadas. Na fase 6, quatro escolhas foram suas: Renovate em vez de
Dependabot, o `defineTool` aplicado a todas as ferramentas, o botão de remoção
genérico sem invólucros, e o tema escuro fora da auditoria enquanto não houver
alternador.

A ordem não é a de severidade: é a de dependência. A fase 0 existe porque hoje
nada obriga um teste a passar, e corrigir dinheiro sem rede é como o
`ARCHITECTURE` descreve a origem da separação em camadas — funciona até a
primeira pressa.

Gate a cada fase (AGENTS.md):

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

E `npm run test:a11y` depois dos quatro, com o dev server no ar, quando a fase
tocar UI.

---

## Decisões que precisam de você

Cinco correções dependem de uma escolha de domínio que o código não pode fazer
sozinho. Elas estão marcadas com **[D1]**–**[D5]** nos itens correspondentes.
Minha recomendação em cada uma, para você confirmar ou trocar:

| | Pergunta | Recomendação | Por quê |
|---|---|---|---|
| **D1** | Transação vinculada a dívida, editada ou apagada pela tela de transações: **recusar** ou **estornar o `remainingAmount`**? | Recusar, com mensagem apontando a tela de dívidas | `deleteSettlement` já faz o estorno correto e conhece as invariantes. Duplicar essa lógica em `transactions.ts` cria a segunda cópia que o `ownership.ts` foi criado para evitar. Recusar é uma linha no filtro; estornar é reimplementar um serviço. |
| **D2** | Compra retroativa em competência de fatura já paga: **recusar** ou **jogar na primeira fatura em aberto**? | **Decidido: recusar** — e a materialização de recorrente **pula**, sem lançar | Realocar silenciosamente quebra a RN-03 (a competência deixa de ser função da data) e o usuário perde a rastreabilidade. Mas `insertCardOccurrences` roda dentro da renderização de três Server Components, e `materializeRecurring` só engole `FxUnavailableError`: recusar ali derrubaria o painel a cada visita. Está escrito como RN-03.5. |
| **D3** | Remoção de conta com histórico: **bloquear sempre**, **bloquear só quando houver dívida ou fatura paga**, ou **permitir com aviso quantificado**? | Bloquear quando houver dívida ou fatura paga; permitir o resto com o impacto quantificado no modal | Dívida órfã e fatura paga sem conta de origem produzem estado que nenhuma tela conserta. O resto é escolha legítima do usuário — desde que ele veja o número antes. |
| **D4** | Amortização em moeda cruzada com câmbio fora do ar: **dois campos de taxa** ou **recusar a operação**? | Dois campos, rotulados pelo par | Com três moedas distintas, uma taxa só está errada por construção. Recusar transforma indisponibilidade de API em bloqueio de uso; o app já escolheu o caminho oposto (taxa manual) e escolheu bem. |
| **D5** | `test:a11y` entra no CI (precisa de dev server no runner) ou fica gate local? | Entra, num job separado depois do build | É o único gate que cobre as telas renderizadas. Job separado porque a dependência de Chrome e de seed é frágil e não deve bloquear o feedback rápido dos outros quatro. |

---

## Fase 0 — tornar o gate executável

Pré-requisito de todo o resto. Hoje `npm test` não roda numa clonagem limpa e
nenhum teste é obrigado a passar antes de um merge.

1. ~~**Versionar `.env.test.example`**~~ **feito.** Com as três variáveis que
   `tests/global-setup.ts` exige e a exceção `!.env.test.example` no
   `.gitignore`.
2. ~~**Passo de `.env` no README**~~ **feito.** Os dois `cp` entre `npm ci` e
   `migrate deploy`, mais o aviso de que `migrate deploy` não cria o banco.
3. ~~**`.github/workflows/ci.yml`**~~ **feito.** Service Postgres 16, os quatro
   comandos do gate num job, e o a11y num segundo job com `needs: gate` — **[D5]**
   confirmado.
4. ~~**`engines` no `package.json`**~~ **feito.** Bate com o `.nvmrc` (Node 22).
   Sobrou `@types/node` na linha 20.x — conservador, não perigoso; ver
   ARCHITECTURE — Deploy.

`chore: make the quality gate runnable in CI`

---

## Fase 1 — parar a perda de dinheiro

Os três achados críticos e o `deleteMany` que produz estado irreparável. Cada
item vem com o teste que o teria pegado — a suíte tem cultura de "toda recusa
afirma também que nada mudou", e essas correções são todas recusas.

5. ~~**`ownedAccountTransaction` deixa passar dívida e pagamento de fatura.**~~
   **feito.** Virou `requireEditableTransaction`, que carrega a linha e recusa
   com `InvalidOperationError` apontando `deleteSettlement` e
   `undoInvoicePayment` — **[D1]** confirmado. `NotFoundError` mentiria: a linha
   existe. As duas listagens **continuam trazendo** os dois — o dinheiro se
   moveu de verdade e escondê-los faria o extrato do mês não fechar com o saldo
   —, marcados por `managedBy`, que a tabela troca pelos botões de editar e
   apagar. O comentário de `transactions/page.tsx` que afirmava o oposto saiu.

6. ~~**Compra retroativa entra em fatura `PAID`.**~~ **feito.** A guarda ficou em
   `resolveInvoice` (`src/lib/invoices.ts:44`), e não nos chamadores: os três
   inserem lançamento na fatura que recebem, então nos chamadores seriam três
   cópias. Ela lança `PaidInvoiceError`, subclasse de `InvalidOperationError`
   para a UI, com tipo próprio para `materializeRecurring` (`:165-171`)
   distinguir e **pular** — lançar ali derrubaria o painel, os lançamentos e os
   recorrentes a cada visita.
   Isso fechou de graça uma brecha que este item não nomeava:
   `updateCardPurchase` recusava fatura paga na **origem** do grupo, mas deixava
   mover a compra para dentro de uma fatura paga pelo **destino**.

7. ~~**Taxa manual aplicada a dois pares de moedas.**~~ **feito.** A checagem
   `from === to` passou para **antes** do `manualRate` em `fxService`, e
   `debtSettlementSchema` ganhou `manualDebtFxRate` — **[D4]** confirmado. O
   formulário mostra um campo por par que exista, rotulado pelas duas moedas. O
   mock de `tests/setup-fx.ts` reproduzia a ordem antiga e foi alinhado: ele
   validava um comportamento que a produção não tem mais.

8. ~~**`deleteAccount` e `deleteCategory` sem guarda de negócio.**~~ **feito.**
   Cada serviço expõe um `*DeletionBlocker` e recusa por ele; `deletionImpact`
   passou a consultar os quatro em vez de reescrever a regra. Conta com fatura
   paga **ou** com movimentação de dívida é bloqueada — **[D3]** confirmado — e
   os `deleteMany` viraram `delete` depois da guarda.

`fix(finance): close the ownership gaps that corrupt debts and invoices`

---

## Fase 2 — fechar as portas de entrada

O especialista em segurança não achou IDOR. O caminho realista para o usuário B
ler os dados do usuário A é adivinhar a senha.

9. ~~**Rate limit em login e registro.**~~ **feito.** Virou
   [src/lib/rateLimit.ts](src/lib/rateLimit.ts), sobre a tabela nova
   `rate_limit_hits`, com três baldes — login por e-mail, login por IP, cadastro
   por IP. A janela de corrida foi fechada por construção: **a tentativa é
   gravada antes de ser contada**, então duas requisições simultâneas não leem
   as duas o mesmo zero. `agentRateLimit.ts` passou a consumir o mesmo módulo e
   deixou de contar sobre `agent_audit_log` — era exatamente a leitura tardia
   que abria a corrida. `clientIp` devolve `null` sem cabeçalho, e o chamador
   **pula** o balde por IP: agrupar os desconhecidos numa chave só transformaria
   um proxy sem `x-forwarded-for` em negação de serviço.
10. ~~**Política de senha.**~~ **feito.** Mínimo de 12 e **nenhuma** regra de
    composição, seguindo o NIST 800-63B — exigir símbolo e maiúscula produz
    `Senha@123`, que está em toda base de vazamento. A conferência contra o
    Have I Been Pwned foi descartada: não vale depender de uma API externa no
    caminho do cadastro. `loginSchema` **não** subiu para 12: quem se cadastrou
    antes da política continua entrando.
11. ~~**Cabeçalhos de segurança.**~~ **feito.** CSP, HSTS, `Referrer-Policy`,
    `nosniff` e `X-Frame-Options` em `next.config.ts`. `'unsafe-inline'` fica em
    `script-src` e `style-src` porque o Mantine emite estilo inline em todo
    componente e o Next injeta o bootstrap no HTML; trocar por nonce exige
    gerá-lo por requisição no proxy, e só compensa quando houver conteúdo de
    terceiro na página.
12. ~~**Sessão revogável.**~~ **feito.** `maxAge` de 24h com `updateAge` de 15
    min, e `passwordChangedAt` no `User`. A comparação é contra `authTime`,
    fixado no login — **não** contra o `iat`: a sessão deslizante reemite o
    token a cada uso, e o `iat` do cookie roubado ficaria sempre mais novo que a
    troca de senha que deveria matá-lo. A consulta mora em `auth.ts`, e não em
    `auth.config.ts`, que o proxy carrega no edge.
13. ~~**`.max()` em todo campo de texto e `@db.VarChar(n)` nas colunas.**~~
    **feito.** `TEXT_LIMITS` em `validations.ts` espelha os `VarChar` da
    migration. Os `ALTER COLUMN` falham se alguma linha exceder o teto novo, e
    isso é deliberado: truncar uma descrição em silêncio é perda de dado.
14. ~~**Enumeração no registro.**~~ **revertido.** O cadastro voltou ao padrão
    comum: 409 com "email já cadastrado", e a tela manda para `/login`. A
    resposta uniforme confundia quem se cadastrava de verdade — o login
    automático falhava sem explicar o motivo. O que sobra contra enumeração em
    massa é o rate limit por IP (`REGISTER_BY_IP`).
15. ~~**Guarda do seed por allowlist.**~~ **feito.** `NODE_ENV` ausente conta
    como desenvolvimento — é como o Node o interpreta e é o que acontece na
    máquina e no CI. O que fecha o Preview é a segunda guarda: `process.env.VERCEL`.

`fix(auth): rate-limit credentials and harden session and headers`

Os itens 9-15 são independentes entre si; se precisar fatiar, 9 e 10 juntos são
o que mais compra.

---

## Fase 3 — consistência de dado e concorrência

16. ~~**`payInvoice` fixa o valor antes do lock.**~~ **feito.** `lockInvoice`
    devolve `status` **e** `total_amount`, e o valor convertido é recomputado
    sob o lock. A taxa continua resolvida antes de abrir a transação — chamada
    de rede lá dentro seguraria o lock esperando a API.
17. ~~**Estorno usa pre-image lido fora do lock.**~~ **feito.** `lockTransaction`
    em [src/lib/accountBalance.ts](src/lib/accountBalance.ts), consumido por
    `updateTransaction`, `deleteTransaction`, `deleteSettlement` e — pelo mesmo
    defeito, que o item não nomeava — `updateDebt`. Em `debts.ts` a ordem de
    lock é dívida, depois movimentação, nos dois lugares.
18. ~~**Teste de concorrência para `settleDebt`.**~~ **feito.** Duas
    amortizações simultâneas do restante inteiro: uma resolve, uma rejeita,
    `remainingAmount` é 0 e a conta foi creditada uma vez. Era o único dos
    quatro locks `FOR UPDATE` do código sem prova.
19. ~~**`itemCount` conta o próprio pagamento.**~~ **feito.** O `_count` passou a
    usar `INVOICE_ITEMS_WHERE`, o mesmo recorte de `listInvoiceItems`. As cinco
    asserções de `itens: 2` que afirmavam o contrário foram corrigidas no mesmo
    commit, e uma nova em `invoicePayments.test.ts` fixa a regra: o número não
    muda ao pagar.
20. ~~**Relatório de mês fechado reconvertido pela cotação de hoje.**~~
    **feito.** `resolveRatesToBase` recebe data opcional, e `getMonthSummary`
    passa o último dia da competência — ou hoje, enquanto o mês não fechou, que
    é o limite de onde existe cotação. Saldo, projeção e as perguntas sobre
    posição em aberto continuam em `"latest"`; a tabela de quem usa o quê está
    em ARCHITECTURE — Multi-moeda.
21. ~~**`resolveRatesToBase` sob teste de verdade.**~~ **feito.** Cinco casos em
    `src/lib/fxService.test.ts` com `fetch` stubbado: dedup, moeda sem cotação,
    `"latest"` contra data, e nenhuma consulta quando tudo já está na base. O
    mock de `tests/setup-fx.ts` continua existindo — em ESM a chamada interna do
    módulo não passa pelo mock — mas encolheu: agora delega ao mesmo `lookup` do
    `getExchangeRate` mockado, em vez de reescrever a regra de completude.

`fix(finance): read invoice and transaction state under lock`

---

## Fase 4 — o que o usuário vê

22. ~~**A prévia dos formulários nunca atualiza.**~~ **feito.** Confirmado no
    navegador antes de mexer: em `mode: "uncontrolled"` o `onChange` de
    `getInputProps` grava com `forceUpdate: false`, então nada re-renderiza e
    `form.getValues()` no corpo do render devolve o valor do último
    re-render. `form.watch` sozinho **não** resolve — ele é um subscriber, não
    causa re-render —, então virou
    [src/components/ui/useFormValue.ts](src/components/ui/useFormValue.ts),
    `useState` alimentado por `watch`. Os seis lugares passaram a usá-lo, e a
    prévia do parcelamento agora acompanha o campo.
23. ~~**Impacto de remoção no modal.**~~ **feito.** `getDeletionImpact` em
    [src/actions/deletionImpact.ts](src/actions/deletionImpact.ts) e
    `DeletionImpactPreview` no modal dos **cinco** botões cujo alvo existe em
    `DELETION_TARGETS` — conta, categoria, cartão, pessoa e dívida. Os outros
    quatro (compra, transação, recorrente, movimentação) não têm o que medir.
    A contagem chega depois de o modal abrir, então o "Remover" é desabilitado
    por `modals.updateModal` quando o impacto vem com `blockedBy`. O
    `settlementCount` de `DeleteDebtButton` saiu: o impacto medido diz o mesmo
    sem a prop.
24. ~~**Primeiro acesso sem beco sem saída.**~~ **feito.** O prop `action` do
    `EmptyState` passou a ser usado em contas, categorias, transações, dívidas e
    faturas do cartão. `TransactionsTable` ganhou `emptyAction` para receber o
    botão de um Server Component. O `Alert` de pré-requisitos de `recurring` foi
    copiado para transações (sem conta) e dívidas — onde a mensagem lista os
    três que faltam, não só pessoas.
25. ~~**Troca de senha e exportação.**~~ **feito.** Reset por e-mail ficou de
    fora por decisão sua: exigiria dependência de envio, tabela de tokens e
    migration. [src/lib/userAccount.ts](src/lib/userAccount.ts) traz
    `changePassword`, que confere a senha atual e grava
    `passwordChangedAt` — o que já revoga as sessões abertas —, e
    `exportUserData`, um JSON com tudo menos credencial. O download é montado no
    cliente, sem rota nova.
26. ~~**Telas de erro em português.**~~ **feito.** `global-error.tsx` com HTML
    cru, porque substitui o layout raiz e não tem `MantineProvider`;
    `dashboard/not-found.tsx`, que cobre os dois `notFound()` do app; e
    `dashboard/error.tsx` perdeu o `error.message` — em produção o Next o
    substitui por texto em inglês que é *truthy*, então o fallback em português
    nunca era alcançado.
27. ~~**Mensagens.**~~ **feito.** Login só culpa a senha quando o erro é
    `CredentialsSignin`. O nome de `summary.expenses` é "Saídas de caixa" nas
    duas telas e no gráfico. O card de pendências troca valor e contagem de
    lugar. Os 17 ícones de ação viraram
    [src/components/ui/IconButton.tsx](src/components/ui/IconButton.tsx), com
    `Tooltip` e um rótulo só servindo ao mouse e ao leitor de tela.
    **Uma troca em relação ao plano:** em vez do toast dizendo qual fatura
    recebeu a compra, o formulário passa a dizer **antes** — "Entra na fatura de
    setembro/2026", ou o intervalo quando parcelada. `invoiceCompetencyFor` é
    puro e client-safe, então é a mesma função do servidor; o toast diria a
    mesma coisa depois de a decisão já ter sido tomada.
28. ~~**Página do cartão paginada.**~~ **feito.** Faturas em aberto expandidas;
    pagas num `Accordion`, com competência, contagem e total no controle.

`feat(ui): show what the app already knows before it acts`

---

## Fase 5 — escala e operação

Os custos abaixo são contagem estática de round-trips e crescimento de linhas,
não tempo medido. Vale um `EXPLAIN ANALYZE` antes de otimizar o que não dói.

29. ~~**`React.cache()` em `requireUser`, `listAccounts` e `listCategoryOptions`.**~~
    **feito.** Uma linha por função, sem mudar assinatura.
30. ~~**N+1 na página do cartão.**~~ **feito.** `listItemsByInvoice` faz duas
    consultas para todas as faturas, e `listInvoiceItems` passou a ser um
    invólucro dela — o que mantém o chamador de uma fatura só sem duas cópias da
    montagem do DTO.
31. ~~**`materializeRecurring` fora do caminho de render.**~~ **feito.** As duas
    coisas: `MATERIALIZE_TX_OPTIONS` com os mesmos 30s de `cardPurchases.ts`, e
    a saída do render. Quem dispara agora é `/api/cron/materialize-recurring`,
    diário, e as escritas de `src/actions/recurring.ts`. O horizonte deixou de
    ser "a competência aberta" e passou a ser `materializationHorizon`, que
    pergunta às regras: mensal e semanal pedem o mês seguinte, anual pede até o
    aniversário. **Efeito visível:** navegar além desse horizonte mostra a
    projeção sem as ocorrências daquele mês. O `Alert` de `recurring/page.tsx`
    mudou de fonte — antes vinha do `skipped` da materialização feita ali, agora
    é derivado de `lastGeneratedAt`, sem consulta nova.
    De graça, `isFxFailure` passou a usar `instanceof` (item 42): estava a duas
    linhas do que já estava sendo editado.
32. ~~**Pool explícito.**~~ **feito.** `max` 5 com `DB_POOL_MAX` para sobrepor,
    `connectionTimeoutMillis` de 5s e `idleTimeoutMillis` de 10s.
33. ~~**Índices.**~~ **feito.** `(user_id, status, date)` entra;
    `(recurring_expense_id)` sai, por ser prefixo do UNIQUE de ocorrência. **E
    `(user_id, status)` sai junto** — o plano não pedia, mas o índice novo o
    torna redundante pela mesma razão, e manter os dois só custa escrita. Os de
    `invoices` e `debts` continuam de fora.
34. ~~**Retenção de `agent_audit_log`.**~~ **feito.** `pruneAgentAudit` com 90
    dias, exposto em `/api/cron/prune-audit`.
35. ~~**Uma tabela de revalidação, não três.**~~ **feito pela metade, e a metade
    que faltou não é adiamento.**
    [src/lib/revalidation.ts](src/lib/revalidation.ts) é a fonte única, com o
    par `[path, type]`, consumida por `revalidateDomain` das actions e pelo
    `runTool`/`runDestructiveTool` do MCP; as quatro divergências fecharam.
    **`revalidateTag` não se aplica a este app hoje:** a doc local do Next 16 é
    explícita em que ele só invalida dado marcado com `cacheTag` dentro de
    `'use cache'` (ou `fetch` com `next.tags`), e aqui toda leitura é Prisma em
    página dinâmica por cookie. Trocar agora quebraria a atualização imediata da
    tela após cada mutação, que é o que `revalidatePath` em Server Function
    garante. Adotar `'use cache'` é um item próprio, não um passo deste.
36. ~~**`/api/health` com `SELECT 1`.**~~ **feito.** 200 com
    `{ status: "ok" }`, ou 503 com `{ database: "down" }`.

`perf: dedupe per-request reads and bound the query fan-out`

---

## Fase 6 — dívida estrutural

Nada aqui era bug. Tudo aqui era o que faz o próximo bug passar — e dois
passaram: o item 46 encontrou duas violações críticas de `button-name` na
primeira vez que o axe viu um modal aberto.

37. ~~**Ferramentas MCP sob teste.**~~ **feito.**
    [src/mcp/define.ts](src/mcp/define.ts) traz `defineTool` e
    `defineDestructiveTool`, e as 38 ferramentas passaram a usá-los: o nome, que
    era escrito três vezes, agora é escrito uma, e o schema deixou de ser
    declarado duas (como `inputSchema` e como `schema`). A terceira ocorrência
    fechou em `tests/integration/mcpRegistry.test.ts`, que registra num
    `McpServer` de mentira e afirma as duas coisas pedidas. **`scopes.test.ts`
    não podia fazê-lo**, e o comentário que dizia o contrário saiu dos dois
    arquivos: importar `registerTools` traz o grafo inteiro dos serviços, então
    o teste é de integração. `defineTool` precisou de uma erasure de tipo sobre
    `registerTool` — o SDK deriva os argumentos por condicional sobre o schema,
    e um genérico não resolvido a mantém diferida; a erasure fica dentro do
    helper, uma vez.
38. ~~**`ownership.ts` nos dois serviços que o reimplementam.**~~ **feito.**
    `resolveTargets` e o antigo `assertPaymentAccountOwned` agora chamam
    `assertCategoryOwned`, `assertAccountOwned` (nova) e `requireCreditCard`.
39. ~~**`getAccountBalances` consome `resolveRatesToBase`.**~~ **feito.** Sumiram
    o dedup, a taxa neutra, o `Promise.all` com catch e a contabilidade de
    completude: os dois números da mesma tela vinham de regras diferentes.
40. ~~**`export type CurrencyCode = Currency`**~~ **feito**, e os 14 `as` de
    `src/app/dashboard/**` saíram. `CURRENCIES` virou `satisfies readonly
    Currency[]`, então acrescentar uma moeda ao enum sem acrescentar à lista cai
    em `currency.test.ts` — que é o que os casts trocavam por silêncio.
41. ~~**Mover `Option`/`AccountOption` para `src/lib/`.**~~ **feito.**
    [src/lib/options.ts](src/lib/options.ts), com os 24 importadores apontados
    para lá e o módulo antigo apagado.
42. ~~**`isFxFailure` com `instanceof`.**~~ **feito** junto do item 31, que
    reescreveu o bloco ao lado.
43. ~~**`AccountFields` e `CategoryFields`.**~~ **feito.** Os dois `*Fields.tsx`
    existem e os quatro botões de criar/editar os consomem.
44. ~~**`DeleteEntityButton`**~~ **feito.** Os nove arquivos foram apagados e os
    dez call sites passaram a usar um componente só, que recebe a server action
    como prop. As divergências que ninguém tinha escolhido fecharam junto: uns
    mostravam `result.error`, outros o substituíam por texto genérico; cinco
    declaravam `modalId` duas vezes e quatro nenhuma — agora ele é derivado do
    `id`, uma vez. `toTransactionRow` e `TransactionRow` foram para
    [src/lib/transactionRow.ts](src/lib/transactionRow.ts), e não para o
    componente: `TransactionsTable` é `"use client"`, e Server Component que
    importe função de lá recebe uma referência de cliente, não a função.
45. ~~**Testes das bordas sem cobertura.**~~ **feito**, 80 casos novos:
    `src/actions/guard.test.ts` (incluindo o caso que separa o `digest` do
    `NEXT_REDIRECT` de um `digest` qualquer), `src/lib/validations.test.ts` com
    a tabela por schema, `src/lib/session.test.ts` provando que id não-uuid nem
    chega ao Prisma, e as bordas de 120 parcelas e total de três casas em
    `installmentSplit.test.ts`.
46. ~~**Gate de a11y que não mente.**~~ **feito, e não de graça.** O passe com
    modal aberto cobre as sete telas com formulário, e recusa quando o botão não
    aparece — são 20 telas medidas, contra 13 antes. **Achou dois `button-name`
    críticos**: o conta-gotas do `ColorInput` e o "x" de todo `clearable`. Os
    dois foram corrigidos, o segundo no tema, junto do botão de fechar da
    `Notification` — mesmo defeito, e fora do alcance do axe porque a
    notificação some antes. **O tema escuro ficou de fora**, por decisão sua:
    não há alternador, o `MantineProvider` fica em `light`, e medir um estado
    inalcançável não é gate. Está registrado no ARCHITECTURE — Estado atual.
47. ~~**Limpeza.**~~ **feito.** `toNumber` e seu teste saíram; `date-fns`, `pg` e
    `@types/pg` saíram do `package.json`. `pg` continua instalado — é
    dependência direta do `@prisma/adapter-pg`, que traz a própria cópia — e era
    exatamente a duplicata que confundia.
48. ~~**Documentação.**~~ **feito.** O ARCHITECTURE ganhou "Serviço de entrada e
    helper de transação", que nomeia as cinco funções exportadas que recebem
    `tx` em vez de `userId` e diz por que isso não viola a regra — e o que
    quebra se uma delas virar ponto de entrada —, mais a tabela "Onde mexer, por
    tarefa". Os textos que envelheceram nesta fase foram corrigidos no mesmo
    commit.
49. ~~**Renovate.**~~ **feito**, e não Dependabot, por decisão sua.
    [renovate.json](renovate.json) agrupa Mantine, Prisma e Next em PR único —
    versões desalinhadas dentro de cada bloco quebram em runtime — e mantém
    `next-auth` e o SDK do MCP **isolados**, porque são os dois gateways da
    aplicação e revisá-los no meio de um lote é como não revisar. Alerta de
    vulnerabilidade ignora o agendamento.

`refactor: write each tool name once and delete the nine copied buttons`

---

## O que não vale corrigir

Registrado para ninguém "consertar" depois sem contexto:

- **Divergência de um centavo entre a soma das parcelas convertidas e o total
  convertido** (`cardPurchases.ts:81`). Já documentada no docblock.
  `recalcInvoiceTotal` soma as linhas reais, então a fatura é internamente
  coerente e o pagamento debita exatamente o que ela mostra. Limite teórico com
  120 parcelas: R$ 0,60, e só visível para quem recalcular por fora.
- **As duas lacunas de auditoria do endpoint MCP** (`guard.ts:283`). O
  `ARCHITECTURE` §13 já registra a troca e a razão: declarar `inputSchema`
  frouxo tiraria do `tools/list` a única forma de o agente saber como chamar as
  ferramentas. As categorias que importam num incidente são todas auditadas; o
  impacto é forense, não de acesso.
- **`AGENT_TOKEN_PEPPER` servindo a dois propósitos.** Sem cenário de
  exploração — as duas construções são distintas e nenhuma expõe oráculo sobre a
  outra. O custo é a rotação nunca acontecer. Vale um HKDF com dois rótulos
  quando alguém encostar em `confirm.ts`, não um commit próprio.
- **Fatura fechando e vencendo no mesmo dia em fevereiro** (`invoiceCycle.ts:69`,
  com `closingDay` 30 e `dueDay` 31). Nenhum valor muda; o usuário perde um dia
  de prazo num mês por ano, num par de parâmetros incomum.
- **`TZ` mutado em `it.each`.** O isolamento por arquivo do Vitest contém o
  vazamento. Vale um comentário no fim dos três arquivos avisando que caso novo
  colado ali herda o último fuso do laço.

---

## Se der para fazer só uma coisa

O item 5. Uma linha no filtro de posse de `transactions.ts`, e ela fecha os dois
achados críticos que três revisores independentes encontraram por caminhos
diferentes — dívida quitada que ninguém pagou, e total de fatura corrompido —
nas duas operações que a tela principal oferece em cada linha da tabela.
