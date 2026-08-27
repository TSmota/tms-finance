---
name: financial-rules
description: 'Implementa e revisa regras financeiras do TMS Finance. Use ao alterar dinheiro, saldos, transações, parcelas, faturas, recorrências, dívidas, câmbio, datas financeiras ou relatórios.'
argument-hint: 'Regra ou domínio financeiro a analisar'
user-invocable: true
disable-model-invocation: false
---

# Financial Rules

## Preparação obrigatória

As regras não estão nesta skill, de propósito: duas cópias divergem na primeira
alteração. Leia, nesta ordem:

1. `AGENTS.md` — as cinco regras financeiras críticas.
2. `docs/business-rules.md`, especialmente a RN citada pela tarefa.
3. `prisma/schema.prisma`, cujas constraints `CHECK` prevalecem sobre qualquer documento.
4. `ARCHITECTURE.md` — Dinheiro, Datas em UTC, Atomicidade e concorrência, Multi-moeda.
5. O serviço relacionado em `src/lib/` e seus testes vizinhos.

## Procedimento

1. Identifique a RN afetada e escreva a invariante que a mudança deve preservar.
2. Implemente a regra em `src/lib/`; a action apenas autentica, valida, chama o serviço e revalida.
3. Cubra a invariante com teste unitário se a lógica for pura, ou de integração se tocar o Prisma — sem mockar Prisma.
4. Em teste monetário, confira as duas pontas da operação e recompute o valor denormalizado.

## Verificação

Execute primeiro o teste mais específico do domínio alterado. Ao concluir, invoque `/quality-gate`.
