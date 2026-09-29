# Roadmap de melhorias financeiras

Este documento registra uma análise inicial dos pontos propostos. A ordem abaixo é uma sugestão de validação e implementação; não representa escopo fechado. Antes de desenvolver cada item, confirmar as decisões de produto indicadas.

## 2. Metas de poupança

**Análise inicial:** registrar objetivo, valor-alvo, prazo opcional e progresso. A principal decisão de domínio é como reconhecer contribuições: progresso manual, lançamentos vinculados, saldo de uma conta dedicada ou combinação desses métodos. Sem vínculo, transferências internas podem ser confundidas com renda ou despesa.

**Trabalho provável:** definir ciclo de vida (ativa, concluída, pausada), persistência e regras de contribuição/retirada; criar consultas de progresso e interface de acompanhamento; considerar histórico de aportes e edição do alvo; cobrir cálculos e concorrência caso o progresso seja derivado de transações.

**Validar:** progresso manual ou calculado? A meta pode ter prazo, conta reservada e retiradas? Como tratar mudança do valor-alvo?

## 4. Transferências entre contas

**Análise inicial:** representar uma transferência como operação vinculada com duas pontas atômicas, preservando origem, destino, data, valor e moeda. Deve alterar ambos os saldos sem aparecer como renda ou despesa nos relatórios. Conversão cambial entre contas, edição e exclusão precisam manter as duas pontas consistentes.

**Trabalho provável:** decidir se será entidade própria ou transações pareadas com identificador comum; validar propriedade das duas contas; executar criação/edição/exclusão em transação de banco; definir arredondamento e taxa de câmbio; atualizar saldos, listagens, importação/exportação e serializadores MCP se aplicável.

**Validar:** permitir moedas diferentes? Como informar câmbio/tarifas? Transferências pendentes são necessárias? Como exibir no histórico e nos relatórios?

## 10. Dashboard e visão consolidada

**Análise inicial:** o painel existente já apresenta saldos, resumo financeiro e distribuição por categoria. A lacuna parece ser de histórico comparável e visualizações temporais (evolução mensal e comparação entre meses), além de verificar se a distribuição atual atende à necessidade de gráfico de pizza. Os dados devem usar a moeda-base e distinguir valores completos de estimativas/parciais.

**Trabalho provável:** inventariar componentes e consultas existentes; definir métricas, intervalo e filtros; acrescentar agregações mensais e visuais acessíveis com alternativa textual; observar desempenho, limites de consulta e consistência entre transações, pagamentos de fatura e patrimônio.

**Validar:** quais gráficos e indicadores são prioritários? Quantos meses de histórico? Patrimônio deve incluir dívidas? Como destacar dados incompletos?

## 12. Pagamento em lote

**Análise inicial:** permitir selecionar faturas e/ou dívidas pendentes e quitar várias numa única ação. É necessário definir se “todas” significa tudo vencido, tudo aberto ou itens selecionados, e como escolher a conta de pagamento. Falha parcial pode deixar o usuário sem saber quais pagamentos foram aplicados; a semântica precisa ser explícita.

**Trabalho provável:** inventariar os fluxos atuais de quitação; criar seleção e prévia dos valores/conta/data; validar propriedade e estado de cada item; decidir atomicidade total ou resultado por item; reaproveitar regras de pagamento e atualização de saldos/dívidas em transação; impedir duplicidade em chamadas repetidas e mostrar resumo de sucesso/erro.

**Validar:** incluir faturas e dívidas no mesmo lote? Pagamento totalmente atômico ou parcial? Uma única conta/data para todos? Permitir seleção em vez de ação global?

## Sequência sugerida para validação

1. Definir o modelo de transferências e tratamento de câmbio; essa decisão também habilita metas com progresso baseado em aportes.
2. Escolher as métricas prioritárias do dashboard e documentar quais dados entram em cada cálculo.
3. Fechar a semântica de lote (seleção, conta, atomicidade e reprocessamento) antes de desenhar a interface.
4. Para cada iniciativa aprovada, detalhar migração, API/ações, UI, acessibilidade, observabilidade e critérios de aceite antes de implementar.


## Escopo implementado nesta entrega

Decisões adotadas para a primeira versão: metas manuais com histórico e prazo opcional; transferências imediatas na mesma moeda; histórico de 12 meses e patrimônio incluindo dívidas/faturas; lote selecionado, integral e atômico, na moeda de uma conta comum. As regras completas estão em `docs/business-rules.md`, RN-06 a RN-09.

Ficam para versões futuras: vínculo automático de metas a contas/transações, câmbio/tarifas em transferências, transferências pendentes e lotes com conversão cambial. Exportação inclui os novos registros; não há importador no produto atual.

Novos escopos MCP: `transfers:write`, `goals:write` e `payments:write`. Tokens existentes mantêm suas permissões; emitir novos escopos é uma concessão explícita.
