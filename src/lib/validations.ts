import { z } from "zod";

import { ACCOUNT_TYPE_CODES } from "@/lib/accountTypes";
import { DEBT_TYPE_CODES } from "@/lib/debtTypes";
import { MAX_INSTALLMENTS } from "@/lib/limits";
import { CURRENCIES } from "@/lib/currency";
import { parseCalendarDate } from "@/lib/dates";

/**
 * Schemas Zod compartilhados entre o formulário (via `zod4Resolver` do Mantine)
 * e a validação no servidor. Mensagens em pt-BR porque vão direto para a UI.
 *
 * Nenhum import server-only aqui — este módulo entra no bundle do cliente.
 */

const currencySchema = z.enum(CURRENCIES);

/**
 * Data-calendário `YYYY-MM-DD`, o formato que o `DatePickerInput` do Mantine 9
 * emite. Rejeita datas inexistentes como `2026-02-30`, que o construtor de
 * `Date` aceitaria transbordando para o mês seguinte.
 */
const calendarDateSchema = z.string().refine(
  (value) => {
    try {
      parseCalendarDate(value);

      return true;
    } catch {
      return false;
    }
  },
  { message: "Data inválida" },
);

/** Valor monetário positivo vindo de um `NumberInput`. */
const positiveAmountSchema = z.coerce
  .number()
  .positive("O valor deve ser positivo")
  .max(9_999_999_999, "Valor acima do limite suportado");

const idSchema = z.uuid("Identificador inválido");

/** Select do Mantine devolve "" quando limpo; tratamos como ausente. */
const optionalIdSchema = z
  .union([idSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");

/**
 * Texto opcional que nunca é gravado em branco: o banco tem CHECK exigindo
 * `NULL` ou conteúdo não-vazio, porque string vazia é ruído indistinguível de
 * ausência nos agrupamentos.
 */
const optionalTextSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
  });

// ---------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------

export const loginSchema = z.object({
  email: z.email("Email inválido"),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.email("Email inválido"),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

// ---------------------------------------------------------------
// Configuração do usuário
// ---------------------------------------------------------------

/**
 * Moeda base dos relatórios. Diferente da moeda de conta, cartão e dívida, esta
 * é alterável: ela só é *lida* na agregação, então trocá-la não reinterpreta
 * nenhum valor gravado.
 */
export const baseCurrencySchema = z.object({
  baseCurrency: z.enum(CURRENCIES, { message: "Moeda inválida" }),
});

// ---------------------------------------------------------------
// Contas e carteiras
// ---------------------------------------------------------------

export const accountSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  type: z.enum(ACCOUNT_TYPE_CODES, { message: "Tipo de conta inválido" }),
  /// Banco ou instituição, para agrupar com o cartão da mesma origem.
  institution: optionalTextSchema,
  currency: currencySchema,
  // Pode ser negativo (conta no vermelho) e pode ser zero.
  initialBalance: z.coerce.number().default(0),
});

// ---------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------

export const categorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  color: hexColorSchema.optional().nullable(),
  icon: z.string().optional().nullable(),
  /** Preenchido = subcategoria. A profundidade máxima é validada no serviço. */
  parentId: optionalIdSchema,
});

// ---------------------------------------------------------------
// Transações
// ---------------------------------------------------------------

export const transactionSchema = z.object({
  accountId: idSchema,
  categoryId: optionalIdSchema,
  type: z.enum(["INCOME", "EXPENSE"], { message: "Tipo inválido" }),
  amount: positiveAmountSchema,
  /** Moeda do lançamento; pode diferir da moeda da conta. */
  currency: currencySchema,
  date: calendarDateSchema,
  description: z.string().min(1, "Descrição é obrigatória"),
  /** Informada pelo usuário quando o serviço de câmbio está indisponível. */
  manualFxRate: z.coerce
    .number()
    .positive("A taxa de câmbio deve ser positiva")
    .optional()
    .nullable(),
});

// ---------------------------------------------------------------
// Cartão de crédito, compras e faturas
// ---------------------------------------------------------------

const dayOfMonthSchema = z.coerce
  .number()
  .int("Informe um dia inteiro")
  .min(1, "O dia deve estar entre 1 e 31")
  .max(31, "O dia deve estar entre 1 e 31");

export const creditCardSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  institution: optionalTextSchema,
  closingDay: dayOfMonthSchema,
  dueDay: dayOfMonthSchema,
  currency: currencySchema,
  /** Nulo = limite não informado; a UI então não mostra limite disponível. */
  creditLimit: z
    .union([z.coerce.number().positive("O limite deve ser positivo"), z.null()])
    .optional()
    .transform((value) => value ?? null),
  defaultPaymentAccountId: optionalIdSchema,
});

export const cardPurchaseSchema = z.object({
  creditCardId: idSchema,
  categoryId: optionalIdSchema,
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: positiveAmountSchema,
  currency: currencySchema,
  date: calendarDateSchema,
  installments: z.coerce
    .number()
    .int("O número de parcelas deve ser inteiro")
    .min(1, "Mínimo de 1 parcela")
    .max(MAX_INSTALLMENTS, `Máximo de ${MAX_INSTALLMENTS} parcelas`)
    .default(1),
  manualFxRate: z.coerce
    .number()
    .positive("A taxa de câmbio deve ser positiva")
    .optional()
    .nullable(),
});

// ---------------------------------------------------------------
// Gastos recorrentes
// ---------------------------------------------------------------

export const recurringExpenseSchema = z
  .object({
    description: z.string().min(1, "Descrição é obrigatória"),
    amount: positiveAmountSchema,
    currency: currencySchema,
    frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"], { message: "Periodicidade inválida" }),
    dueDay: dayOfMonthSchema,
    /** Valor variável, a conferir no vencimento. */
    isEstimated: z.coerce.boolean().default(false),
    startDate: calendarDateSchema,
    /** Vazio = recorrência sem fim. */
    endDate: z
      .union([calendarDateSchema, z.literal(""), z.null()])
      .optional()
      .transform((value) => (value ? value : null)),
    /** Obrigatória: é a categoria que o lançamento gerado herda. */
    categoryId: idSchema,
    accountId: optionalIdSchema,
    creditCardId: optionalIdSchema,
  })
  // O banco tem CHECK equivalente; validar aqui devolve mensagem em vez de erro
  // de constraint, e o formulário aponta o campo certo.
  .refine((value) => (value.accountId === null) !== (value.creditCardId === null), {
    message: "Escolha um destino: conta bancária ou cartão de crédito",
    path: ["accountId"],
  });

/** Confirmação de uma pendência, com o valor real do vencimento. */
export const confirmOccurrenceSchema = z.object({
  amount: positiveAmountSchema,
  date: calendarDateSchema,
  manualFxRate: z.coerce
    .number()
    .positive("A taxa de câmbio deve ser positiva")
    .optional()
    .nullable(),
});

export const invoicePaymentSchema = z.object({
  accountId: idSchema,
  date: calendarDateSchema,
  manualFxRate: z.coerce
    .number()
    .positive("A taxa de câmbio deve ser positiva")
    .optional()
    .nullable(),
});

// ---------------------------------------------------------------
// Pessoas e dívidas
// ---------------------------------------------------------------

export const personSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  notes: optionalTextSchema,
});

/** Data opcional; `""` do `DatePickerInput` limpo conta como ausente. */
const optionalCalendarDateSchema = z
  .union([calendarDateSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

export const debtSchema = z.object({
  personId: idSchema,
  /** Motivo/origem: obrigatória, diferente das transações comuns. */
  categoryId: idSchema,
  type: z.enum(DEBT_TYPE_CODES, { message: "Tipo de dívida inválido" }),
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: positiveAmountSchema,
  currency: currencySchema,
  /** Conta pela qual o dinheiro saiu (LENT) ou entrou (BORROWED). */
  accountId: idSchema,
  date: calendarDateSchema,
  dueDate: optionalCalendarDateSchema,
  manualFxRate: z.coerce
    .number()
    .positive("A taxa de câmbio deve ser positiva")
    .optional()
    .nullable(),
});

/** Abate parcial ou total. */
export const debtSettlementSchema = z.object({
  amount: positiveAmountSchema,
  currency: currencySchema,
  accountId: idSchema,
  date: calendarDateSchema,
  /** Vazia = herda a categoria de origem da dívida. */
  categoryId: optionalIdSchema,
  description: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();

      return trimmed ? trimmed : null;
    }),
  manualFxRate: z.coerce
    .number()
    .positive("A taxa de câmbio deve ser positiva")
    .optional()
    .nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type BaseCurrencyInput = z.infer<typeof baseCurrencySchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type CreditCardInput = z.infer<typeof creditCardSchema>;
export type CardPurchaseInput = z.infer<typeof cardPurchaseSchema>;
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;
export type RecurringExpenseInput = z.infer<typeof recurringExpenseSchema>;
export type ConfirmOccurrenceInput = z.infer<typeof confirmOccurrenceSchema>;
export type PersonInput = z.infer<typeof personSchema>;
export type DebtInput = z.infer<typeof debtSchema>;
export type DebtSettlementInput = z.infer<typeof debtSettlementSchema>;
