---
name: quality-gate
description: 'Executa a validação final do TMS Finance. Use ao concluir implementações, corrigir bugs, preparar commits ou PRs, ou quando o usuário pedir typecheck, lint, testes e build.'
argument-hint: 'Área alterada ou validação desejada'
user-invocable: true
disable-model-invocation: false
---

# Quality Gate

## Procedimento

1. Pare qualquer `npm run dev` ativo antes dos testes — o motivo está em `ARCHITECTURE.md` — Testes.
2. Execute, nesta ordem, interrompendo para corrigir falhas causadas pela alteração:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

3. Não corrija falhas não relacionadas. Registre-as separadamente com o comando e a mensagem relevante.
4. Se houve mudança de UI, invoque `/ui-validation` depois das verificações estáticas.
5. Confirme no diff que não houve alteração incidental, segredo, artefato ou migration não intencional.

## Resultado

Informe cada comando como aprovado ou reprovado. Para falhas, diga se foram introduzidas pela mudança ou se parecem preexistentes. Não declare a tarefa concluída sem mencionar qualquer etapa que não pôde ser executada.
