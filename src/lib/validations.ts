import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Email inválido"),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.email("Email inválido"),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export const accountSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  type: z.enum(["CHECKING", "SAVINGS", "INVESTMENT", "CREDIT_CARD", "CASH"]),
  currency: z.string().length(3, "Use um código de moeda com 3 letras").toUpperCase(),
  initialBalance: z.coerce.number().default(0),
});

export const transactionSchema = z.object({
  accountId: z.string().min(1, "Conta é obrigatória"),
  categoryId: z.string().optional().nullable(),
  type: z.enum(["INFLOW", "OUTFLOW"]),
  amount: z.coerce.number().positive("O valor deve ser positivo"),
  date: z.coerce.date(),
  description: z.string().min(1, "Descrição é obrigatória"),
  manualFxRate: z.coerce.number().positive("A taxa de câmbio deve ser positiva").optional().nullable(),
});

export const categorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
  isRecurring: z.boolean().default(false),
});

export const recurringExpenseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  amount: z.coerce.number().positive("O valor deve ser positivo"),
  currency: z.string().length(3, "Use um código de moeda com 3 letras").toUpperCase(),
  interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  nextDueDate: z.coerce.date(),
  active: z.boolean().default(true),
  categoryId: z.string().optional().nullable(),
});

export const debtSchema = z.object({
  debtorName: z.string().min(1, "Nome do devedor é obrigatório"),
  description: z.string().optional().nullable(),
  totalAmount: z.coerce.number().positive("O valor deve ser positivo"),
  currency: z.string().length(3, "Use um código de moeda com 3 letras").toUpperCase(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const debtPaymentSchema = z.object({
  debtId: z.string().min(1),
  amount: z.coerce.number().positive("O valor deve ser positivo"),
  paymentDate: z.coerce.date(),
  manualFxRate: z.coerce.number().positive("A taxa de câmbio deve ser positiva").optional().nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type AccountInput = z.infer<typeof accountSchema>;