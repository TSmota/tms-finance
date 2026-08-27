-- Faturas que ficaram sem lançamento nenhum antes de `recalcInvoiceTotal`
-- passar a apagá-las. Em aberto e com total zero, elas não têm como ser pagas
-- nem removidas pela interface.
DELETE FROM finance.invoices i
 WHERE i.status <> 'PAID'
   AND NOT EXISTS (
     SELECT 1 FROM finance.transactions t WHERE t.invoice_id = i.id
   );
