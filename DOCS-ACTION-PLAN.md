# Plano de ação — correção dos documentos

Origem: revisão documental de 26/08/2026 por cinco lentes adversariais (agente
sem contexto, auditor doc↔código, analista de negócio, árbitro de precedência,
mantenedor de 2027) sobre `AGENTS.md`, `ARCHITECTURE.md`,
`docs/business-rules.md` e `README.md`. 45 asserções verificáveis extraídas e
conferidas por `grep`: 31 passaram, 8 são falsas hoje, 6 são verdadeiras só sob
condição não declarada. O relatório completo, com a tabela afirmação →
documento:linha → comando → veredito, está em
[claude.ai/code/artifact/cd4066e1-01b9-4855-be4f-bb6aa0180d60](https://claude.ai/code/artifact/cd4066e1-01b9-4855-be4f-bb6aa0180d60).

**Este plano foi aplicado em 26/08/2026.** As fases 0 a 6 estão feitas, incluindo
o item **17**: o **D2** do `ACTION-PLAN.md` foi decidido (recusar na entrada do
usuário, pular na materialização) e a regra está escrita como **RN-03.5**. O que
resta é o código alcançá-la — item 6 de lá.

A ordem é de dependência, não de severidade. A fase 0 vem primeiro porque o
`AGENTS.md` é o único documento que um agente recebe por default: enquanto ele
aponta para o arquivo errado, cada tarefa nova paga o custo outra vez. A fase 2
vem antes das de conteúdo porque uma contagem sem trava volta a divergir no mês
seguinte, e corrigir o número sem travar é trabalho que se repete.

Gate a cada fase — os documentos não têm typecheck, então o gate aqui é outro:

```bash
# toda afirmação alterada tem de vir com o comando que a prova
grep -rn "<a afirmação>" src/ prisma/ tests/ scripts/
```

E o gate normal (`AGENTS.md`) nas fases 2 e 5, que tocam código e teste.

---

## Relação com o `ACTION-PLAN.md`

Os dois planos se cruzam em cinco pontos, e é deliberado que este documento os
nomeie: duas listas de dívida sem referência mútua divergem, e foi um dos
achados desta revisão.

| Item de lá | Relação |
|---|---|
| **43** (`AccountFields`/`CategoryFields` não existem) | É a causa do item **7** daqui. Corrigir o código resolve os dois; corrigir só a frase resolve um. |
| **46** (gate de a11y que não mente — piso de rotas) | É o item **12** daqui, visto do outro lado. Mesmo commit. |
| **48** (documentação: competência, contradição RN, tabela tarefa → módulo) | **Absorvido por este plano.** Os itens 15, 20 e 22 daqui o substituem com o texto e a decisão que faltavam. Marcar o 48 como resolvido por referência. |
| **D2** (compra retroativa em fatura paga) | É a decisão que o item **17** daqui precisa. Não duplicar: este plano só escreve a RN depois que aquele decidir. |
| **§14 do `ARCHITECTURE`** | Item **27** daqui: a §14 vira inventário de mecanismo e cada lacuna dela recebe o número do item de lá. |

---

## Decisões que precisam de você

Quatro correções dependem de uma escolha que o texto não pode fazer sozinho.
Marcadas **[D1]**–**[D4]** nos itens. Minha recomendação para confirmar ou
trocar:

| | Pergunta | Recomendação | Por quê |
|---|---|---|---|
| **D1** | Citar RN em comentário: **permitir** (e corrigir a §12) ou **proibir** (e limpar as 15 citações)? | Permitir em SQL de migration, proibir em TS | O motivo da §12 é que a citação envelhece sem ninguém notar. Migration é append-only: o SQL daquele arquivo nunca muda, então a citação não pode divergir do código ao lado dela — e é exatamente ali que alguém pergunta "por que esta constraint existe". Em TS o motivo da §12 vale integralmente. As 4 citações de `ARCHITECTURE` em `theme.ts`, `globals.css`, `theme.test.ts` e `a11y-audit.ts` saem pela mesma régua. |
| **D2** | `amount × exchangeRate = convertedAmount`: promover a **`CHECK`** ou registrar como **exceção declarada** à política da §6? | `CHECK` com `round(...)`, depois de conferir as linhas existentes | É aritmética de linha, sem consulta a outra tabela — o caso que a §6 descreve. O cuidado é o arredondamento: `Decimal(12,2) × Decimal(10,4)` produz 6 casas, então a constraint é `round("amount" * "exchange_rate", 2) = "converted_amount"`. Rodar o `SELECT` de conferência antes de escrever a migration é obrigatório: se alguma linha antiga não satisfaz, a decisão muda de constraint para backfill. |
| **D3** | Portão de qualidade canônico: **README** ou **AGENTS.md**? | AGENTS.md, com o README apontando para ele | O AGENTS.md é o único que um agente lê por default, é o mais completo dos três hoje (é o único que menciona `test:a11y`) e é o que a `quality-gate/SKILL.md` já espelha. O README fica com a receita de setup, que é seu assunto real. |
| **D4** | Profundidade de 2 níveis da categoria: **`CHECK`** ou **fica em código**? | Fica em código, e a §6 diz por quê | Uma `CHECK` não alcança outra linha, então "meu pai não tem pai" é inexpressável como constraint — precisaria de trigger. O comentário em `invariant_checks/migration.sql:95` já admite a limitação; o que falta é a §6 registrar que esta é a exceção e qual é o motivo, para ninguém "consertar" com trigger depois. |

---

## Fase 0 — o que muda o que um agente faz amanhã

Três frases do `AGENTS.md`. É a fase mais curta e a de maior alcance: enquanto
ela não é feita, todo agente novo paga o mesmo pedágio.

1. **O ponteiro das `CHECK` aponta para o arquivo errado.** `AGENTS.md:22-23`
   diz "`prisma/schema.prisma` — o modelo de dados. Suas constraints `CHECK`
   valem mais que qualquer coisa escrita fora dele". O `schema.prisma` não tem
   uma única `CHECK`: as quatro ocorrências da palavra são comentário. As 20
   constraints estão em `prisma/migrations/*/migration.sql`, escritas à mão.
   Um agente que faça `grep CHECK prisma/schema.prisma` conclui que não há
   invariante e produz migration sem constraint.
   *Substituir por:* o schema como modelo de dados, e uma frase própria dizendo
   que as `CHECK` vivem nas migrations, são escritas à mão, e que o Prisma não
   as gera nem as remove.
   *Prova:* `grep -c "CHECK" prisma/schema.prisma` → 4, todas em `///`.

2. **A regra 2 induz a violar a regra que ela protege.** `AGENTS.md:35-37` diz
   que `@/lib/installmentSplit` é a fonte única "consumida pelo servidor e pela
   prévia". A regra da divisão é de fato única — `installments.ts:49` delega a
   `splitCents` — mas o servidor não chama `splitCents`: chama
   `splitInstallments`, que antes valida `count` inteiro, o teto de
   `MAX_INSTALLMENTS` e `totalCents >= count`, esta última a guarda que impede
   parcela de zero centavo que `transactions_positive_amounts_check` recusaria.
   Seguir a regra ao pé da letra no servidor é pular as três.
   *Substituir por:* uma regra de divisão, dois pontos de entrada —
   `splitInstallments` no servidor porque valida e lança erro de domínio,
   `splitCents` só na prévia porque entra no bundle do cliente.
   *Prova:* `grep -n splitCents src/lib/installments.ts` e
   `grep -n splitInstallments src/lib/cardPurchases.ts`.

3. **As três frases que faltam.** O `AGENTS.md` é hoje um índice: três das suas
   quatro instruções operacionais são "leia outro arquivo". Um agente que não
   abra o `ARCHITECTURE` fica com cinco regras corretas e nenhuma informação
   sobre onde qualquer uma delas mora. Acrescentar, no tom do documento:
   - `@/lib/validations` é fonte única de validação, compartilhada pelo
     formulário e pelas ferramentas MCP de escrita. **Campo novo num schema muda
     a API do agente no mesmo commit** — e obriga o campo correspondente no DTO
     de `@/mcp/serializers`, porque `agent_audit_log.args` não guarda o que a
     saída não expõe (`prisma/schema.prisma:519-521`).
   - As três camadas em três linhas: `src/lib` serviço com `userId` explícito,
     `src/actions` casca fina, `page.tsx` leitura. Campo novo entra no `data` de
     **cada** função de escrita — o `update` monta campo por campo e esquecer um
     ali não quebra o typecheck.
   - Antes de criar ferramenta MCP, confira `src/mcp/scopes.ts`: é o inventário.
     *(Na verificação desta revisão, um agente recebeu a tarefa de criar
     `list_categories`. Ela já existe, em `scopes.ts:27` e `tools/read.ts:374`.
     Nada no documento diz onde olhar.)*

`docs(agents): fix the CHECK pointer and name the installment entry points`

---

## Fase 1 — as afirmações falsas do ARCHITECTURE

Sete asserções que um `grep` refuta. Cada uma é uma escolha de dois lados:
corrigir a frase, ou corrigir o código que a desmente. Deixar as duas é o que
não serve.

4. **"As duas implementações existem" (`ARCHITECTURE.md:110-113`).** Há uma.
   `installments.ts:49` delega a `splitCents`, e o docblock de
   `installmentSplit.ts:5-6` afirma o contrário do documento: "Duas
   implementações fariam a prévia divergir do valor gravado no primeiro ajuste
   de arredondamento". O teste de acordo (`installmentSplit.test.ts:42`) hoje
   compara um wrapper com o que ele delega — prova menos do que o documento
   promete, e é bom que prove menos, porque não há duas fontes para divergir.
   *Corrigir:* a frase, e explicar a divisão real de responsabilidade (validação
   e `Decimal` de um lado, aritmética de centavos do outro).

5. **"Serviço nenhum reimplementa a sua [guarda de posse]"
   (`ARCHITECTURE.md:44-46`).** `recurring.ts:410-439` (`resolveTargets`
   reimplementa categoria, conta e cartão) e `creditCards.ts:19-29`
   (`assertPaymentAccountOwned` reimplementa conta). O bug que a seção diz ter
   fechado voltou. Item **38** do `ACTION-PLAN.md`.
   *Corrigir:* o código, não a frase — a frase é a regra certa. Enquanto o
   código não for corrigido, a seção precisa dizer que há duas exceções
   conhecidas, ou ela ensina uma regra que o próprio repositório desmente.

6. **"três cópias" × "quatro serviços" (`ARCHITECTURE.md:45` ×
   `src/lib/ownership.ts:10`).** Duas contagens do mesmo evento histórico, em
   desacordo. Nenhuma das duas é verificável hoje.
   *Corrigir:* tirar o número dos dois lados. "Já esteve copiada em vários
   serviços" diz tudo o que a regra precisa e não pode envelhecer.

7. **"Padrão de formulário em modal, repetido em todos os domínios"
   (`ARCHITECTURE.md:421-425`).** Seis de oito: faltam `AccountFields.tsx` e
   `CategoryFields.tsx`, e nesses dois domínios os campos estão duplicados entre
   criar e editar. Item **43** do `ACTION-PLAN.md`.
   *Corrigir:* o código. É a única das sete em que corrigir a frase seria pior —
   ela descreve o padrão que se quer, e enfraquecê-la para "quase todos" tira a
   força do único lugar que declara o padrão.

8. **"O código não cita este documento" (`ARCHITECTURE.md:16`).** Cinco
   citações: `theme.ts:13`, `globals.css:11`, `theme.test.ts:8`,
   `a11y-audit.ts:7` e `agent_access/migration.sql:57`. Quatro delas são dos
   commits mais recentes — a frase perdeu justamente na última fase de trabalho.
   **[D1]**

9. **"Comentário não cita documento, seção, RN, fase nem histórico de
   dependência" (`ARCHITECTURE.md:619`).** Violada 15 vezes: 10 citações de RN
   em migrations, 5 de `ARCHITECTURE`. É a regra que o `AGENTS.md:17-18` e o
   `business-rules.md:6-7` contradizem ao afirmar que "o código as cita como
   `(RN-03.2)`" — a contradição direta que a rodada anterior achou (item **48**).
   Depende de **[D1]**, e a decisão precisa cair sobre os três documentos e sobre
   as 15 citações no mesmo commit, ou volta.

10. **"O `roundTimeoutMs` default do SDK é 600s, descrito como *human-paced*"
    (`ARCHITECTURE.md:711`).** O número existe, mas é
    `DEFAULT_LEGACY_SHIM_ROUND_TIMEOUT_MS` — o timeout do *legacy shim*, o
    caminho que a mesma seção declara impossível em serving stateless. O
    orçamento humano real é `AGENT_CONFIRM_TTL_SECONDS`, default **120s**
    (`src/mcp/confirm.ts:32`), que o documento não menciona. Um host com humano
    na frente que leve três minutos para confirmar recebe recusa.
    *Corrigir:* trocar a justificativa pelo número que governa de fato, e dizer
    que 120s é o orçamento — ou subir o default, que é decisão de produto e não
    de documentação.

`docs(architecture): replace the seven assertions that grep refutes`

---

## Fase 2 — trocar contagem por trava

Toda fotografia que venceu nesta revisão era um número contado à mão ou uma
negativa absoluta. O repositório já tem o padrão que funciona — `theme.test.ts`
prende as razões de contraste da §9 e roda em milissegundos; `scopes.test.ts`
prende o par ferramenta↔escopo. Falta aplicá-lo aos três números que
envelheceram.

11. **A contagem de `CHECK`.** `ARCHITECTURE.md:320` diz "Já são 16"; são 20 —
    as quatro faltantes são as de `agent_tokens` e `agent_audit_log`, da última
    fase. `tests/integration/schema.test.ts:18` já afirma a lista literal de
    tabelas: acrescentar ali a lista literal de constraints (`pg_constraint`
    filtrado por `contype = 'c'` no schema `finance`), e trocar o número da §6
    por "estão enumeradas em `tests/integration/schema.test.ts`". A frase deixa
    de poder envelhecer e a lista ganha quem a mantenha.
    *Teste:* constraint nova sem entrada na lista reprova; constraint removida
    também.

12. **A contagem de rotas.** "13 rotas" aparece em quatro lugares —
    `AGENTS.md:57`, `ARCHITECTURE.md:466`, `ARCHITECTURE.md:535` e
    `.github/skills/quality-gate/SKILL.md`. São 11 fixas
    (`scripts/a11y-audit.ts:21-33`) mais duas descobertas por
    `discoverDetailRoutes`, que dependem de existir cartão e dívida no banco. Sem
    dados, audita 11 e **sai 0** (`:332`) — degrada em silêncio, que é o pior
    modo de falha de um gate.
    *Corrigir:* piso mínimo de rotas no script, falhando quando não alcançar; e
    os quatro textos passam a dizer "todas as rotas do app", sem número. Item
    **46** do `ACTION-PLAN.md`, mesmo commit.

13. **As dez razões de contraste da §9 (`ARCHITECTURE.md:463-515`).** Este é o
    caso que **não** precisa de correção, e vale registrar por quê: os números
    são calculados contra a paleta padrão do Mantine 9.3.1, exatamente o formato
    que envelhece mal — mas `src/theme.test.ts` prende os tokens e roda no `npm
    test`. É o padrão a copiar nos itens 11 e 12. O que fica exposto é só a
    narrativa em prosa, a um minor do Mantine, e o teste avisa antes.

14. **As citações por número de seção.** O `ARCHITECTURE` referencia a si mesmo
    11 vezes por `§N` (`§1`, `§2`, `§5`×4, `§8`×2, `§13`×2, `§14`), enquanto
    `AGENTS.md`, `README.md`, as seis skills e o código citam por **nome**
    ("ARCHITECTURE — Testes", "ARCHITECTURE — Superfície de agente"). Inserir uma
    seção rompe as 11 referências numéricas em silêncio e nenhuma das nomeadas.
    *Corrigir:* trocar as 11 `§N` por nome de seção. Sem número, sem drift.

`test(schema): assert the CHECK constraint list, and drop the hand counts`

---

## Fase 3 — a especificação indecidível

A pergunta era se duas pessoas implementariam a RN-03 igual. Não. A fronteira
mais consequente do sistema não está na especificação, e a palavra que o código
usa para o conceito não aparece nela.

15. **Definir "competência" no `docs/business-rules.md`.** 153 ocorrências em 22
    arquivos de `src/`, zero no documento que é a fonte de verdade do domínio.
    É a maior lacuna de especificação do conjunto. Item **48** do
    `ACTION-PLAN.md`, absorvido aqui.

16. **Escrever a fronteira do fechamento na RN-03.2.** Hoje ela diz "acumula na
    fatura do mês correspondente" e para. Qual mês corresponde a uma compra do
    dia 20 num cartão que fecha dia 20 — e o que vale quando o cartão fecha dia
    31 em fevereiro — vive só na regra 3 do `AGENTS.md` e em
    `invoiceCycle.ts:41-52`. A regra de negócio mais citada do sistema não está
    na especificação dele.
    *Acrescentar também:* onde cai o vencimento. A RN-03.1 diz que o cartão tem
    data de fechamento e de vencimento e não decide a relação entre elas;
    `invoiceCycle.ts:69-72` decide (`dueDay > closingDay` vence no mesmo mês,
    senão no seguinte). Todo cartão com "fecha 20, vence 5" depende de uma regra
    que não está escrita.

17. **Decidir a imutabilidade de fatura paga, e escrevê-la.** Não há RN que a
    exija, e o código a implementa em dois dos três caminhos de escrita:
    `updateCardPurchase:155` e `deleteCardPurchase:294` recusam com "o dinheiro
    já saiu pelo total antigo"; `createCardPurchase:42` não recusa. Uma compra
    retroativa com data ≤ `closingDay` de competência já paga entra na fatura
    paga, `recalcInvoiceTotals` sobe o `total_amount`, e a fatura fica `PAID` com
    total maior que o `INVOICE_PAYMENT` que a quitou. Depende de **D2** do
    `ACTION-PLAN.md` (item **6** de lá); aqui entra só o texto da RN, depois da
    decisão.

18. **Fechar os três "etc." e os dois "ou".** São indecidíveis por construção:
    - RN-04.1, "periodicidade (mensal, anual, **etc.**)" — o código escolheu
      `WEEKLY · MONTHLY · YEARLY`. Nada na RN obriga semanal nem exclui
      trimestral.
    - RN-05.4, "a amortização **herda a categoria original ou recebe a sua**" —
      um "ou" sem regra de escolha, e duas implementações conformes produzem
      relatórios diferentes na RN-05.2, que é a razão de a categoria existir na
      dívida.
    - RN-02.3, "categorias têm subcategorias" — admite N níveis; o código impõe
      exatamente 2. **[D4]** decide se isso ganha constraint; a RN precisa dizer
      2 de qualquer forma.

19. **Reconciliar a RN-02.1 com o schema.** Ela diz que toda transação tem
    "categoria" e "tipo (entrada/receita ou saída/despesa)". No banco,
    `categoryId` é nulável (`prisma/schema.prisma:412`) e o `ARCHITECTURE.md:855`
    conta com isso ("deixa os lançamentos como 'Sem categoria'"); e o tipo tem
    **três** valores — `INCOME · EXPENSE · INVOICE_PAYMENT`. O terceiro é
    load-bearing: é o que a §5 exclui de `byCategory` para que a identidade
    `expenses = spendingTotal − cardSpending + invoicePayments` feche. A RN
    descreve um modelo que o sistema não tem, e o campo que falta nela é o que
    sustenta a distinção central do relatório.

`docs(rules): specify the closing boundary, competency, and the third transaction type`

---

## Fase 4 — precedência e superfícies não declaradas

A tabela de `ARCHITECTURE.md:9-14` ordena quatro documentos por assunto. Isso
resolve conflito de assunto. Nenhum dos conflitos realmente presentes no
repositório é de assunto.

20. **Uma frase acima da tabela.** No único conflito factual real — item 4 desta
    lista, `AGENTS.md` × `ARCHITECTURE` sobre o parcelamento — a tabela dá "o
    como" à `ARCHITECTURE`, que é justamente quem está errado. Ela elege por
    posto uma afirmação que um `grep` refuta.
    *Acrescentar:* "Afirmação factual sobre o código perde para o código,
    qualquer que seja o posto do documento. Quem encontrar a divergência corrige
    a prosa no mesmo commit."
    É a correção estrutural desta revisão: sem ela, a tabela continua capaz de
    dar razão ao documento errado.

21. **Duas linhas na tabela: `README.md` e `.github/skills/`.** O
    `ARCHITECTURE.md:628` elege o README como portão de qualidade canônico, e o
    README não está na tabela — nem menciona `test:a11y`, que o `AGENTS.md:57`
    exige. O portão canônico é definido no documento não ranqueado e é o menos
    completo dos três. **[D3]** decide qual passa a ser canônico; a tabela
    precisa das duas linhas de qualquer modo.

22. **Declarar as seis skills.** `.github/skills/` tem seis arquivos de instrução
    vinculante que nenhum dos quatro documentos cita, e o `AGENTS.md:11-13`
    afirma que "nenhuma ferramenta tem cópia própria destas regras". Elas foram
    escritas com o cuidado explícito de não duplicar as regras —
    `financial-rules/SKILL.md` até diz por quê, "duas cópias divergem na primeira
    alteração" — então a letra da frase sobrevive. O que não sobrevive é o
    espírito: há mais de um lugar com procedimento, e duas skills repetem
    contagens ("13 rotas", "as quatro armadilhas") que o item 12 vai tirar dos
    outros quatro lugares.
    *Corrigir:* uma linha na tabela de precedência, um ponteiro no README, e as
    contagens saem das skills junto com as do item 12. Item **48** do
    `ACTION-PLAN.md`, absorvido.

23. **Resolver a colisão de "Fase 6".** `ARCHITECTURE.md:762` ("Decidido na Fase
    6 não criá-la") e `:810` ("Fases 0 a 6 concluídas") falam das fases de
    implementação; o `ACTION-PLAN.md` numera Fase 0 a Fase 6 para trabalho
    futuro. Duas numerações disjuntas, uma delas em arquivo não versionado.
    "Decidido na Fase 6" já é ambíguo hoje.
    *Corrigir:* no `ARCHITECTURE`, trocar "na Fase 6" pela decisão em si
    ("decidido junto com a tela de configurações"). Referência a fase é histórico
    de projeto, que é exatamente o que a §12 manda não citar.

`docs(architecture): rank the README and the skills, and let facts outrank standing`

---

## Fase 5 — o que ainda vai vencer

Nada aqui é falso hoje. Tudo aqui caduca em silêncio.

24. **A mecânica de protocolo da §13 (`ARCHITECTURE.md:722-740`).** Ancorada em
    duas coisas que não estão no repositório: o conteúdo de
    `SUPPORTED_PROTOCOL_VERSIONS` e os nomes de header e `_meta` da revisão
    2026-07-28. Conferi: **está correta hoje** —
    `[2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07]`, e a
    2026-07-28 vive em `MODERN_PROTOCOL_VERSION`, separada de propósito. Mas
    `2026-07-28` não aparece em uma linha de `src/` ou `tests/`, e
    `tests/mcpHarness.ts:11-14` diz explicitamente que não negocia protocolo. No
    dia em que a revisão entrar em `SUPPORTED_PROTOCOL_VERSIONS`, nada falha — o
    parágrafo apenas passa a ser falso.
    *Corrigir:* uma constante `MCP_PROTOCOL_REVISION` em `src/mcp/`, citada pelo
    documento, e um teste unitário afirmando que ela **não** está em
    `SUPPORTED_PROTOCOL_VERSIONS`. Quando o SDK a promover, o teste quebra e
    alguém lê o parágrafo. É o mesmo movimento do item 11: transformar prosa
    verificável em prosa travada.

25. **As afirmações amarradas a versão de dependência.** Verdadeiras hoje, sem
    trava: "o Prisma 7 não gera implicitamente", "`migrate reset` tem proteção
    contra agentes de IA no Prisma 7", "o formato que o `DatePickerInput` do
    Mantine 9 emite", "o `PieChart` do Mantine 9 não tem legenda", "único modo do
    `mcp-handler` 2.x", "o Mantine resolve `--button-color` inline no SSR", "o
    `luminanceThreshold` do Mantine é 0.3".
    *Corrigir:* não tirar nenhuma — cada uma explica um mecanismo e é por isso
    que estão certas há meses. O que falta é a versão junto do fato, uma vez, no
    topo da seção que a usa: "medido em Mantine 9.3.1 / Prisma 7.8 /
    `@modelcontextprotocol/server` 2.0". Um leitor de 2027 sabe então se o
    parágrafo se aplica a ele, sem ter de descobrir por tentativa.

26. **`.nvmrc` pede Node 22 e `@types/node` é 20.19.** A §11 não menciona
    runtime. Ou os dois batem, ou a §11 diz qual manda. Item **4** do
    `ACTION-PLAN.md` já mexe no `engines`; este item é a linha correspondente no
    documento.

27. **Cruzar a §14 com o `ACTION-PLAN.md`.** Conferi as sete lacunas da §14 uma a
    uma: **todas continuam verdadeiras, nenhuma piorou, nenhuma foi corrigida em
    silêncio.** É a seção mais honesta do documento, e envelheceu bem
    precisamente porque descreve mecanismo, não contagem. O problema é outro: o
    `ACTION-PLAN.md` agora prioriza e agenda os mesmos itens, com 49 numerados, e
    nenhum dos dois cita o outro. Em seis meses haverá duas listas divergindo, e
    a §14 é a que os agentes leem.
    *Corrigir:* a §14 fica como inventário de mecanismo — o que é, por que é
    assim, o que quebra — e cada lacuna recebe o número do item que a resolve. O
    `ACTION-PLAN` fica com a fila e a prioridade. Um dono cada.

`docs(architecture): pin the dependency-measured facts and link the debt lists`

---

## Fase 6 — a invariante sem constraint

Item próprio porque é o único desta lista que mexe em banco, e porque a decisão
tem consequência de dados.

28. **`amount × exchangeRate = convertedAmount` não tem `CHECK`.**
    `ARCHITECTURE.md:250` a chama de "invariante por linha", o
    `prisma/schema.prisma:405` a comenta, e `toStoredRate` existe por causa dela
    (`fxService.ts:34`, com o bug de 4 centavos já documentado na §5). A única
    constraint em `transactions` nesse terreno é a de positividade. Isso
    contradiz a política declarada na §6 — "invariantes que o Zod não consegue
    garantir vão para `CHECK` no banco" — para a invariante mais load-bearing do
    sistema, sustentada hoje por disciplina em `fxService` e por asserções
    pontuais (`cardPurchases.test.ts:338`, `mcpFxFailure.test.ts:111`).
    **[D2]** decide entre constraint e exceção declarada. Se for constraint:
    conferência antes da migration, `round(amount * exchange_rate, 2) =
    converted_amount`, e o caso da compra parcelada em moeda estrangeira
    (`cardPurchases.ts:37`) revisado — a divergência de um centavo que o
    `ACTION-PLAN` registra como "não vale corrigir" é entre a *soma* das parcelas
    e o total, não por linha, então a constraint por linha continua válida. Vale
    conferir isso com o `SELECT` antes, não com raciocínio.
    *Teste:* gravar linha que viola pelo Prisma cru e afirmar que o Postgres
    recusa — o padrão de `tests/integration/schema.test.ts:88`.

`fix(db): enforce the per-row exchange rate invariant as a CHECK`

---

## O que não vale corrigir

Registrado para ninguém "consertar" depois sem contexto:

- **As medições históricas da §9** ("53 violações só no painel", "31 violações →
  1" no escuro). São relato de trabalho feito, no passado, e leem como passado.
  Não podem ser reverificadas e não precisam ser: o que vale hoje é o zero que o
  `test:a11y` mede e os tokens que o `theme.test.ts` prende.
- **A §14 dizer "Fases 0 a 6 concluídas".** O item 23 tira a referência a fase de
  dentro da §13, onde ela é citação de histórico numa decisão técnica. Na §14 a
  frase é o próprio assunto — o estado do projeto — e ali contar fases é legítimo.
- **As duas lacunas de auditoria do endpoint MCP.** Já registradas na §13 com a
  troca e a razão, e o `ACTION-PLAN` já as classificou como não corrigíveis a
  custo razoável. A revisão documental confirma: o texto está certo e completo.
- **O `AGENTS.md` ser curto.** A tentação, depois da fase 0, é continuar
  acrescentando — cada lacuna encontrada pelo agente sem contexto parece merecer
  uma frase. Não merece: o documento inteiro tem 60 linhas e é lido por default
  em toda sessão. As três frases do item 3 são as que fecham violação de
  invariante; as demais lacunas daquela lente são resolvidas por ponteiro, não
  por texto.
- **`docs/business-rules.md` não falar de MCP, auditoria, escopo ou token.** É
  superfície técnica, não domínio. A ausência está certa.

---

## Se der para fazer só uma coisa

O item **1**. Quatro linhas de `AGENTS.md`, e ela fecha a única frase de todo o
conjunto que ativamente produz código errado: hoje o documento manda respeitar as
`CHECK` e aponta para o arquivo que não as tem. Todo o resto desta lista corrige
um documento; esse corrige o que a próxima migration vai ser.
