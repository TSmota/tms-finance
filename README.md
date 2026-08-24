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
  críticas e o aviso sobre a versão do Next.js. Vale para qualquer ferramenta;
  [.claude/CLAUDE.md](.claude/CLAUDE.md) apenas o importa.

## Desenvolvimento

```bash
npm ci
npx prisma migrate deploy && npx prisma generate
npm run db:seed          # usuário demo@tms.finance / demo1234
npm run dev
```

Testes (pare o dev server antes — ver ARCHITECTURE.md — Testes):

```bash
npm test                 # unitários + integração
npm run test:unit
npm run test:integration
```

Portão de qualidade — nada é dado por pronto sem estes quatro, e sem abrir cada
tela nova no navegador (ARCHITECTURE.md — Server Components):

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

O banco de testes é `tms_finance_test`, configurado em `.env.test`.

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
