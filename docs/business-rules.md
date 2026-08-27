# Regras de negócio (RN) — TMS Finance

Gestão financeira pessoal: fluxo de caixa, cartão de crédito, gastos
recorrentes, empréstimos entre pessoas e transações multi-moeda.

Esta é a fonte de verdade do *o quê*. O SQL das migrations cita as regras daqui
como `(RN-03.2)`, porque migration é append-only e a citação não pode divergir
do código ao lado dela; código TypeScript não cita. O *como* e o *porquê* estão
em [ARCHITECTURE.md](../ARCHITECTURE.md).

---

## Vocabulário

- **Competência:** o par ano-mês a que um registro pertence, que nem sempre é o
  mês da data dele. A competência de uma fatura é o ciclo que ela fecha
  (RN-03.2); a de um relatório é o mês que ele recorta. Uma compra de 25/08 num
  cartão que fecha dia 20 tem **data** em agosto e **competência** setembro — e
  aparece no gasto por categoria de agosto, porque foi quando o dinheiro foi
  comprometido, mas na fatura de setembro, porque foi quando ele vai sair.

---

## RN-01: Contas e carteiras

- **RN-01.1 (Saldos independentes):** múltiplas contas, cada uma com saldo
  próprio (ex.: conta corrente, carteira física, conta internacional).
- **RN-01.2 (Moeda base):** o usuário define a moeda principal do sistema; cada
  conta tem sua própria moeda nativa.
- **RN-01.3 (Atualização de saldo):** entrada ou saída imediata atualiza o saldo
  da conta vinculada em tempo real.

## RN-02: Fluxo de caixa

- **RN-02.1 (Registro):** toda transação simples tem valor, data, conta,
  descrição, moeda e tipo. O tipo tem **três** valores: entrada (receita), saída
  (despesa) e **pagamento de fatura**. O terceiro existe para que o gasto do
  cartão seja contado uma vez só: ele sai da conta como despesa, mas *o quê* foi
  comprado já está categorizado nas compras da fatura (RN-03.4), então ele fica
  de fora do relatório por categoria. Categoria é **opcional** — lançamento sem
  categoria é relatado como "Sem categoria", e pagamento de fatura nunca tem.
- **RN-02.2 (Conversão multi-moeda):** registro em moeda diferente da moeda
  nativa da conta grava o valor convertido **e** a taxa usada no momento.
- **RN-02.3 (Categorização):** categorias têm subcategorias (ex.: *Moradia >
  Luz*), em **exatamente dois níveis**. Subcategoria não recebe subcategoria, e
  categoria que já tem filhas não vira subcategoria.

## RN-03: Cartão de crédito e parcelamento

- **RN-03.1 (Meio de pagamento):** o cartão tem dia de fechamento e dia de
  vencimento. O vencimento cai no mês **seguinte** ao do fechamento quando o dia
  de vencimento é menor ou igual ao de fechamento (*fecha 20, vence 5*), e no
  **mesmo** mês quando é maior (*fecha 5, vence 20*).
- **RN-03.2 (Fatura, não saldo):** compra no cartão **não** altera o saldo
  disponível da conta bancária; acumula na fatura da sua competência. A
  competência é a do mês da compra quando o dia da compra é **menor ou igual**
  ao dia de fechamento — no próprio dia do fechamento a compra ainda entra na
  fatura corrente — e a do mês **seguinte** quando é maior. Quando o dia de
  fechamento não existe no mês (31 em fevereiro), vale o último dia dele.
- **RN-03.3 (Compras parceladas):** compra em N vezes gera N lançamentos
  vinculados, em faturas sequenciais a partir do ciclo da compra. Cada parcela é
  o total dividido por N, com os centavos de resto na **primeira**.
- **RN-03.4 (Pagamento da fatura):** registrado como **despesa consolidada**
  saindo de uma conta bancária; ao confirmar, as parcelas daquela fatura ficam
  quitadas.
- **RN-03.5 (Fatura paga é imutável):** depois do pagamento, o **total** daquela
  fatura não muda — o dinheiro já saiu por ele, e alterá-lo deixaria a fatura
  paga por um valor que não é o dela. Lançamento não é criado, alterado nem
  removido ali, e isso vale também para compra retroativa cuja data caia numa
  competência já paga. O caminho é desfazer o pagamento, corrigir e pagar de
  novo.

  A recusa é para o que o **usuário** lança. A materialização de recorrente
  (RN-04.2) não recusa: ela roda sozinha ao abrir uma tela, e erro ali derrubaria
  uma página que o usuário só queria ler. A ocorrência que cair em competência
  paga fica **pendente** e é relatada como tal na tela de recorrentes, sem
  avançar o marcador — desfeito o pagamento, ela se materializa sozinha na
  fatura certa. Deslocar para outra competência não serve: quebraria a RN-03.2.

## RN-04: Gastos recorrentes

- **RN-04.1 (Definição):** valor fixo ou estimado, periodicidade, dia do
  vencimento e meio de pagamento preferencial. As periodicidades são três:
  **semanal**, **mensal** e **anual**. Na semanal o dia do vencimento é
  ignorado — ela segue o dia da semana da data de início.
- **RN-04.2 (Cartão ou conta):** no **cartão** (ex.: assinatura), gera
  automaticamente o lançamento na fatura a cada ciclo; em **conta bancária**
  (ex.: débito automático ou PIX), gera pendência agendada no fluxo de caixa.
- **RN-04.3 (Projeção e execução):** recorrentes projetam o saldo futuro antes
  da confirmação do pagamento. No vencimento o usuário confirma o valor real —
  é o que permite ajustar uma conta de luz variável.

## RN-05: Empréstimos e dívidas pessoais

- **RN-05.1 (Terceiros e posições):** registros de pessoas (amigos, familiares)
  com saldo acumulado devedor ou a receber.
- **RN-05.2 (Motivo/origem):** cada dívida recebe **categoria e subcategoria**
  (ex.: *Lazer > Viagem*, *Saúde > Farmácia*). É o que permite relatar não só
  *para quem* o usuário deve ou *quem* lhe deve, mas **com o quê** o valor foi
  gasto.
- **RN-05.3 (Vínculo com transações):** uma **saída** pode ser marcada como
  empréstimo feito, incrementando o saldo a receber daquela pessoa; uma
  **entrada** pode amortizar dívida existente, reduzindo-o. O mesmo vale no
  sentido inverso, quando o usuário pega dinheiro emprestado.
- **RN-05.4 (Quitação parcial e histórico):** abates e pagamentos parciais são
  permitidos, com histórico de toda movimentação vinculada àquela dívida. A
  amortização **herda a categoria da dívida** quando o usuário não escolhe
  outra; escolhida, vale a escolhida. Herdar por padrão é o que preserva a
  RN-05.2: sem isso, metade do movimento de uma dívida sairia do relatório por
  origem.
