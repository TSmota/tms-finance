---
name: prisma-migration
description: 'Cria e revisa alterações de schema e migrations Prisma/PostgreSQL no TMS Finance. Use para models, campos, enums, índices, constraints CHECK, relações, migrações ou geração do Prisma Client.'
argument-hint: 'Alteração de banco desejada'
user-invocable: true
disable-model-invocation: false
---

# Prisma Migration

## Preparação

Leia `prisma/schema.prisma`, `ARCHITECTURE.md` — Modelo de dados e migrations, as migrations relacionadas e `tests/integration/constraints.test.ts`. As convenções de coluna, tipo, índice e `CHECK` estão naquela seção e não são repetidas aqui.

## Procedimento

1. Altere `prisma/schema.prisma` com a menor mudança necessária, respeitando as convenções daquela seção.
2. Gere o SQL sem usar o fluxo interativo:

   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`

3. Revise o SQL antes de criar `prisma/migrations/<timestamp>_<nome>/migration.sql`.
4. Acrescente manualmente constraints, backfills e validações que o diff não representa.
5. Garanta que a migration preserva dados e pode ser aplicada em banco já populado.
6. Aplique com `npx prisma migrate deploy`.
7. Sempre execute `npx prisma generate` após mudar o schema.
8. Atualize ou crie testes de schema e testes do serviço afetado.
9. Execute primeiro `npm run test:integration -- tests/integration/constraints.test.ts` e depois os testes de integração do domínio.

## Segurança

Nunca execute `prisma migrate reset`, apague dados ou recrie banco sem consentimento explícito do usuário. Não use `prisma migrate dev` neste ambiente, pois ele é interativo.
