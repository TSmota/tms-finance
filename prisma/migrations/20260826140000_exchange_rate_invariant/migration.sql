-- Escritas à mão: o Prisma Schema não expressa CHECK.

-- A invariante por linha do multi-moeda (RN-02.2): o valor convertido é sempre
-- o valor lançado vezes a taxa gravada ao lado dele. Até aqui era sustentada só
-- por disciplina em `fxService`, que reduz a taxa às 4 casas da coluna ANTES de
-- multiplicar — gravar a taxa arredondada e converter com a cheia deixaria a
-- invariante falsa no banco.
--
-- O round(..., 2) não é cosmético: Decimal(12,2) × Decimal(10,4) produz 6 casas
-- e "converted_amount" guarda 2, então a igualdade crua nunca fecharia.
ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_exchange_rate_check"
  CHECK (round("amount" * "exchange_rate", 2) = "converted_amount");
