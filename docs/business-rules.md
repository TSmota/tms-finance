# Regras de negócio (RN) — TMS Finance

Gestão financeira pessoal: fluxo de caixa, cartão de crédito, gastos
recorrentes, empréstimos entre pessoas e transações multi-moeda.

Esta é a fonte de verdade do *o quê*, e o código cita as regras daqui como
`(RN-03.2)`. O *como* e o *porquê* estão em
[ARCHITECTURE.md](../ARCHITECTURE.md).

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
  categoria, tipo (entrada/receita ou saída/despesa), descrição e moeda.
- **RN-02.2 (Conversão multi-moeda):** registro em moeda diferente da moeda
  nativa da conta grava o valor convertido **e** a taxa usada no momento.
- **RN-02.3 (Categorização):** categorias têm subcategorias (ex.: *Moradia >
  Luz*).

## RN-03: Cartão de crédito e parcelamento

- **RN-03.1 (Meio de pagamento):** o cartão tem data de fechamento e data de
  vencimento.
- **RN-03.2 (Fatura, não saldo):** compra no cartão **não** altera o saldo
  disponível da conta bancária; acumula na fatura do mês correspondente.
- **RN-03.3 (Compras parceladas):** compra em N vezes gera N lançamentos
  vinculados, em faturas sequenciais a partir do ciclo da compra. Cada parcela é
  o total dividido por N, com os centavos de resto na **primeira**.
- **RN-03.4 (Pagamento da fatura):** registrado como **despesa consolidada**
  saindo de uma conta bancária; ao confirmar, as parcelas daquela fatura ficam
  quitadas.

## RN-04: Gastos recorrentes

- **RN-04.1 (Definição):** valor fixo ou estimado, periodicidade (mensal, anual,
  etc.), dia do vencimento e meio de pagamento preferencial.
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
  amortização herda a categoria original ou recebe a sua.
