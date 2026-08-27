# TMS Finance

Controle financeiro pessoal: contas e carteiras multi-moeda, cartões de crédito
com fatura e parcelamento, gastos recorrentes com projeção de saldo, e
empréstimos entre pessoas.

## Documentação

- [docs/business-rules.md](docs/business-rules.md) — as regras de negócio (RN-01
  a RN-05). A fonte de verdade do *o quê*.
- [ARCHITECTURE.md](ARCHITECTURE.md) — **decisões técnicas, padrões e regras do
  repositório.** Leia antes de escrever código aqui.
- [AGENTS.md](AGENTS.md) — instruções para agentes: as cinco regras financeiras
  críticas, o **portão de qualidade** e o aviso sobre a versão do Next.js. Vale
  para qualquer ferramenta; [.claude/CLAUDE.md](.claude/CLAUDE.md) apenas o
  importa.
- [.github/skills/](.github/skills/) — seis procedimentos por tarefa
  (`financial-rules`, `mcp-agent-surface`, `nextjs-local-docs`,
  `prisma-migration`, `quality-gate`, `ui-validation`). Eles não contêm regra
  própria: apontam para a regra dos documentos acima, de propósito.

Este arquivo trata de **subir e configurar** o projeto. O que precisa passar
antes de algo ser dado por pronto está no [AGENTS.md](AGENTS.md).

## Desenvolvimento

Precisa de um PostgreSQL no ar e dos dois arquivos de ambiente. `prisma migrate
deploy`, ao contrário de `migrate dev`, **não cria o banco**: crie os dois antes
(`createdb tms_finance && createdb tms_finance_test`).

```bash
npm ci
cp .env.example .env            # preencha DATABASE_URL e AUTH_SECRET
cp .env.test.example .env.test  # banco dedicado: a suíte TRUNCA tudo a cada teste
npx prisma migrate deploy && npx prisma generate
npm run db:seed          # usuário demo@tms.finance / demo1234
npm run dev
```

`AUTH_SECRET` sai de `npx auth secret`; `AGENT_TOKEN_PEPPER` só é necessário
para a superfície MCP, e sai de `openssl rand -base64 33`. `CRON_SECRET` só é
necessário em deploy: as rotas de `/api/cron/*` — que geram as ocorrências dos
recorrentes e podam a trilha de auditoria — recusam tudo sem ele. Em
desenvolvimento a geração acontece a cada escrita de recorrência, então a
ausência não trava nada.

Testes (pare o dev server antes — ver ARCHITECTURE.md — Testes):

```bash
npm test                 # unitários + integração
npm run test:unit
npm run test:integration
```

O banco de testes é `tms_finance_test`, configurado em `.env.test` — o modelo
está em [.env.test.example](.env.test.example). `tests/global-setup.ts` recusa
rodar contra qualquer outro nome, e aplica as migrations sozinho.

## Superfície de agente (MCP)

Um agente externo lê e escreve os dados de um usuário por `POST /api/agent/mcp`,
autenticado por token opaco com escopos. O desenho e o *por quê* estão em
[ARCHITECTURE.md](ARCHITECTURE.md) — Superfície de agente. Leia antes de mexer
em `src/mcp/`.

Emitir e revogar credenciais:

```bash
# Concessão recomendada: leitura ampla + escrita, SEM destructive:write nem setup:write
npm run agent:token -- mint --user demo@tms.finance --label hermes \
  --scopes finance:read,transactions:write,cards:write,invoices:pay,debts:write,recurring:write \
  --expires 90d

npm run agent:token -- list   --user demo@tms.finance
npm run agent:token -- revoke --user demo@tms.finance --id <uuid>
```

O token em claro aparece **uma única vez**, no stdout. Ele não entra no
repositório: `AGENT_TOKEN_PEPPER` (ver `.env.example`) precisa existir em
runtime para que ele possa ser verificado.

Rotação é sem downtime: emita o novo, configure no agente, revogue o antigo.

As remoções em cascata (`delete_account`, `delete_person`, …) exigem
`destructive:write` **e** confirmação em duas fases: a primeira chamada devolve
o impacto medido e não apaga nada. Isso só funciona para clientes que falam a
revisão 2026-07-28 do protocolo e declaram capacidade de elicitação — os
detalhes de header e envelope estão em Superfície de agente.
