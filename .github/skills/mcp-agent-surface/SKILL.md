---
name: mcp-agent-surface
description: 'Implementa e revisa a superfície MCP do TMS Finance. Use ao alterar src/mcp, o endpoint /api/agent/mcp, tokens, escopos, auditoria, rate limit, confirmação destrutiva, serialização ou deletionImpact.'
argument-hint: 'Ferramenta ou comportamento MCP a alterar'
user-invocable: true
disable-model-invocation: false
---

# MCP Agent Surface

## Preparação obrigatória

Leia `ARCHITECTURE.md` — Superfície de agente antes de editar `src/mcp/`, `src/lib/agent*.ts`, `src/lib/deletionImpact.ts` ou `src/app/api/agent/mcp/route.ts`. É lá que estão as decisões e o porquê de cada uma; esta skill não as repete. Depois leia a ferramenta vizinha e os testes MCP correspondentes.

## Procedimento

1. Reutilize antes de escrever: o schema de `src/lib/validations.ts` **sem
   alteração**, os argumentos comuns de `src/mcp/args.ts`, o serializador de
   `src/mcp/serializers.ts` e o serviço de `src/lib/`. A ferramenta nova é a
   composição dessas peças, e o que sobra de código próprio é a regra que só ela
   tem. Copiou de uma vizinha? O trecho copiado vira peça compartilhada.
2. Registre por `defineTool` ou `defineDestructiveTool` de `src/mcp/define.ts`, nunca por `server.registerTool` direto — o nome é escrito uma vez só.
3. Toda ferramenta nova entra no mapa de escopos de `src/mcp/scopes.ts`; `tests/integration/mcp/registry.test.ts` acusa o esquecimento.
4. Nunca registre, exiba ou persista bearer token ou pepper.
5. Adicione teste para sucesso, escopo insuficiente, ausência de efeito após recusa e auditoria aplicável.

## Verificação

Execute os testes unitários de `src/mcp/` relacionados e os testes específicos em `tests/integration/mcp*.test.ts`. Para alteração transversal, execute também `npm run test:integration` e depois `/quality-gate`.
