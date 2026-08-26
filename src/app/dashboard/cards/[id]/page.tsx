import { notFound } from "next/navigation";
import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Badge,
  Card,
  Group,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";

import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/errors";
import { listCreditCards, requireCreditCard } from "@/lib/creditCards";
import {
  listCardInvoices,
  listItemsByInvoice,
  type InvoiceItem,
  type InvoiceSummary,
} from "@/lib/invoices";
import { listAccounts } from "@/lib/accounts";
import { listCategoryOptions } from "@/lib/categories";
import { formatCurrency } from "@/lib/currency";
import { AddCardPurchaseButton } from "@/components/forms/AddCardPurchaseButton";
import { EditCardPurchaseButton } from "@/components/forms/EditCardPurchaseButton";
import { PayInvoiceButton } from "@/components/forms/PayInvoiceButton";
import { UndoInvoicePaymentButton } from "@/components/forms/UndoInvoicePaymentButton";
import { deleteCardPurchase } from "@/actions/cardPurchases";
import { DeleteEntityButton } from "@/components/forms/DeleteEntityButton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackLink } from "@/components/ui/AppLink";
import { toCalendarDate } from "@/lib/dates";
import type { CardPurchaseFormValues } from "@/components/forms/CardPurchaseFields";
import type { AccountOption, CardOption, Option } from "@/lib/options";
import { CategoryBadge } from "@/components/ui/CategoryBadge";

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const STATUS_LABELS: Record<InvoiceSummary["status"], string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  PAID: "Paga",
};

const STATUS_COLORS: Record<InvoiceSummary["status"], string> = {
  OPEN: "blue",
  CLOSED: "orange",
  PAID: "teal",
};

/**
 * "Agosto de 2026" a partir da competência, sem depender do locale do runtime.
 *
 * Capitaliza aqui em vez de usar `tt="capitalize"` no Text: o CSS capitaliza
 * *cada* palavra e produziria "Agosto De 2026".
 */
function competencyLabel(invoice: InvoiceSummary): string {
  const month = MONTH_NAMES[invoice.month - 1]!;

  return `${month[0]!.toUpperCase()}${month.slice(1)} de ${invoice.year}`;
}

/**
 * Usa o export nomeado `TableScrollContainer`, e não `Table.ScrollContainer`.
 *
 * Num Server Component, importar um componente client devolve uma *referência*:
 * propriedades estáticas viram `undefined` e o React quebra com "Element type
 * is invalid". Não aparece no typecheck nem no build, só ao abrir a página.
 */
function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Valores iniciais da edição, a partir do item da fatura.
 *
 * Usa `groupTotal`, não `amount`: o serviço reescreve a compra inteira, então o
 * formulário tem de abrir com o total do grupo de parcelas.
 */
function toPurchaseValues(item: InvoiceItem, creditCardId: string): CardPurchaseFormValues {
  return {
    creditCardId,
    categoryId: item.categoryId ?? "",
    description: item.description,
    amount: item.groupTotal,
    currency: item.currency,
    date: toCalendarDate(item.date),
    installments: item.totalInstallments ?? 1,
    manualFxRate: undefined,
  };
}

export default async function CardInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const card = await requireCreditCard(user.id, id).catch((error) => {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  });

  const [invoices, accounts, categories, cards] = await Promise.all([
    listCardInvoices(user.id, card.id),
    listAccounts(user.id),
    listCategoryOptions(user.id),
    // Todos os cartões, e não só este: a edição permite mover a compra de cartão.
    listCreditCards(user.id),
  ]);

  // Os itens de todas as faturas em duas consultas, e não duas por fatura.
  const itemsByInvoice = await listItemsByInvoice(
    user.id,
    invoices.map((invoice) => invoice.id),
  );

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.name,
    currency: account.currency,
  }));

  const cardOptions = cards.map((item) => ({
    value: item.id,
    label: item.name,
    currency: item.currency,
    closingDay: item.closingDay,
    dueDay: item.dueDay,
  }));

  // A fatura corrente é a única acionável; o resto é histórico.
  const current = invoices.filter((invoice) => invoice.status !== "PAID");
  const settled = invoices.filter((invoice) => invoice.status === "PAID");

  return (
    <Stack gap="lg">
      <BackLink href="/dashboard/cards">Cartões</BackLink>

      <PageHeader
        title={card.name}
        subtitle={`Fecha dia ${card.closingDay} · vence dia ${card.dueDay} · ${card.currency}`}
        action={
          <AddCardPurchaseButton
            cards={cardOptions}
            categories={categories}
            defaultCardId={card.id}
            baseCurrency={user.baseCurrency}
          />
        }
      />

      {invoices.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <EmptyState
            message="Nenhuma fatura ainda. A primeira nasce quando você lançar uma compra."
            action={
              <AddCardPurchaseButton
                cards={cardOptions}
                categories={categories}
                defaultCardId={card.id}
                baseCurrency={user.baseCurrency}
              />
            }
          />
        </Card>
      ) : (
        <>
          {current.map((invoice) => (
            <Card key={invoice.id} withBorder radius="md" padding="lg">
              <InvoiceHeader
                invoice={invoice}
                accountOptions={accountOptions}
                defaultAccountId={card.defaultPaymentAccountId}
              />
              <InvoiceItems
                invoice={invoice}
                items={itemsByInvoice.get(invoice.id) ?? []}
                cardId={card.id}
                cardOptions={cardOptions}
                categories={categories}
              />
            </Card>
          ))}

          {settled.length > 0 && (
            <Card withBorder radius="md" padding="lg">
              <Text fw={600} mb="xs">
                Faturas pagas
              </Text>
              {/* Recolhidas: o histórico de um cartão antigo tem dezenas de
                  faturas, e todas expandidas empurram a fatura corrente — a
                  única acionável — para fora da tela. */}
              <Accordion variant="separated" chevronPosition="left">
                {settled.map((invoice) => (
                  <AccordionItem key={invoice.id} value={invoice.id}>
                    <AccordionControl>
                      <Group justify="space-between" wrap="wrap" pr="sm">
                        <Text fw={500}>{competencyLabel(invoice)}</Text>
                        <Group gap="sm">
                          <Text size="sm" c="dimmed">
                            {invoice.itemCount}{" "}
                            {invoice.itemCount === 1 ? "lançamento" : "lançamentos"}
                          </Text>
                          <Text fw={600}>
                            {formatCurrency(invoice.total, invoice.currency)}
                          </Text>
                        </Group>
                      </Group>
                    </AccordionControl>
                    <AccordionPanel>
                      <InvoiceHeader
                        invoice={invoice}
                        accountOptions={accountOptions}
                        defaultAccountId={card.defaultPaymentAccountId}
                      />
                      <InvoiceItems
                        invoice={invoice}
                        items={itemsByInvoice.get(invoice.id) ?? []}
                        cardId={card.id}
                        cardOptions={cardOptions}
                        categories={categories}
                      />
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}

interface InvoiceHeaderProps {
  invoice: InvoiceSummary;
  accountOptions: AccountOption[];
  defaultAccountId: string | null;
}

function InvoiceHeader(props: InvoiceHeaderProps) {
  const { invoice, accountOptions, defaultAccountId } = props;

  return (
    <>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <Text fw={600}>{competencyLabel(invoice)}</Text>
          <Badge color={STATUS_COLORS[invoice.status]} variant="light" size="sm">
            {STATUS_LABELS[invoice.status]}
          </Badge>
          <Text size="xs" c="dimmed">
            Fecha {formatDay(invoice.closingDate)} · vence {formatDay(invoice.dueDate)}
          </Text>
        </Group>

        <Group gap="sm">
          <Text fw={700} size="lg">
            {formatCurrency(invoice.total, invoice.currency)}
          </Text>
          {invoice.status === "PAID" ? (
            <UndoInvoicePaymentButton invoiceId={invoice.id} />
          ) : (
            invoice.total > 0 && (
              <PayInvoiceButton
                invoiceId={invoice.id}
                total={invoice.total}
                currency={invoice.currency}
                dueDate={invoice.dueDate}
                accounts={accountOptions}
                defaultAccountId={defaultAccountId}
              />
            )
          )}
        </Group>
      </Group>

      {invoice.paidAt && (
        <Text size="xs" c="dimmed" mb="sm">
          Paga em {formatDay(invoice.paidAt)}
        </Text>
      )}
    </>
  );
}

interface InvoiceItemsProps {
  invoice: InvoiceSummary;
  items: InvoiceItem[];
  cardId: string;
  cardOptions: CardOption[];
  categories: Option[];
}

function InvoiceItems(props: InvoiceItemsProps) {
  const { invoice, items, cardId, cardOptions, categories } = props;

  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nenhum lançamento nesta fatura.
      </Text>
    );
  }

  return (
    <TableScrollContainer minWidth={560}>
      <Table highlightOnHover>
        <TableThead>
          <TableTr>
            <TableTh>Data</TableTh>
            <TableTh>Descrição</TableTh>
            <TableTh>Categoria</TableTh>
            <TableTh ta="right">Valor</TableTh>
            <TableTh w={80} />
          </TableTr>
        </TableThead>
        <TableTbody>
          {items.map((item) => {
            const isConverted = item.currency !== invoice.currency;

            return (
              <TableTr key={item.id}>
                <TableTd>{formatDay(item.date)}</TableTd>
                <TableTd>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{item.description}</Text>
                    {(item.totalInstallments ?? 1) > 1 && (
                      <Badge size="xs" variant="outline" color="gray" tt="none">
                        {item.installmentNumber}/{item.totalInstallments}
                      </Badge>
                    )}
                  </Group>
                </TableTd>
                <TableTd>
                  {item.categoryName ? (
                    <CategoryBadge name={item.categoryName} color={item.categoryColor} />
                  ) : (
                    <Text c="dimmed" size="sm">
                      —
                    </Text>
                  )}
                </TableTd>
                <TableTd ta="right">
                  <Stack gap={0} align="flex-end">
                    <Text fw={500}>
                      {formatCurrency(item.convertedAmount, invoice.currency)}
                    </Text>
                    {isConverted && (
                      <Text size="xs" c="dimmed">
                        {formatCurrency(item.amount, item.currency)} ×{" "}
                        {item.exchangeRate.toLocaleString("pt-BR", {
                          minimumFractionDigits: 4,
                        })}
                      </Text>
                    )}
                  </Stack>
                </TableTd>
                <TableTd>
                  {invoice.status !== "PAID" && (
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <EditCardPurchaseButton
                        id={item.id}
                        values={toPurchaseValues(item, cardId)}
                        cards={cardOptions}
                        categories={categories}
                        totalInstallments={item.totalInstallments}
                        fromRecurring={item.fromRecurring}
                      />
                      <DeleteEntityButton
                        id={item.id}
                        title="Remover compra"
                        successMessage="Compra removida"
                        question={
                          (item.totalInstallments ?? 1) > 1
                            ? `"${item.description}" está parcelada em ${item.totalInstallments}x. Remover apaga todas as parcelas, em todas as faturas.`
                            : `Remover a compra "${item.description}"?`
                        }
                        action={deleteCardPurchase}
                      />
                    </Group>
                  )}
                </TableTd>
              </TableTr>
            );
          })}
        </TableTbody>
      </Table>
    </TableScrollContainer>
  );
}
