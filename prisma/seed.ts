import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

if (isProduction) {
  console.log("Refusing to seed a production database.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "demo@tms.finance";
  const passwordHash = await bcrypt.hash("demo1234", 10);

  // Reset existing demo user data for idempotent seeding.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.delete({ where: { email } });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: "Usuário Demo",
      passwordHash,
      preferredCurrency: "BRL",
    },
  });

  const groceries = await prisma.category.create({
    data: { name: "Mercado", color: "#40c057", userId: user.id },
  });
  const subscriptions = await prisma.category.create({
    data: { name: "Assinaturas", color: "#7950f2", userId: user.id },
  });
  const salary = await prisma.category.create({
    data: { name: "Salário", color: "#228be6", userId: user.id },
  });
  const dining = await prisma.category.create({
    data: { name: "Restaurantes", color: "#fd7e14", userId: user.id },
  });

  const checking = await prisma.financialAccount.create({
    data: {
      name: "Conta corrente Nubank",
      type: "CHECKING",
      currency: "BRL",
      initialBalance: "1000.00",
      userId: user.id,
    },
  });
  await prisma.financialAccount.create({
    data: {
      name: "Poupança Inter",
      type: "SAVINGS",
      currency: "BRL",
      initialBalance: "5000.00",
      userId: user.id,
    },
  });
  const usdInvest = await prisma.financialAccount.create({
    data: {
      name: "Wise USD",
      type: "INVESTMENT",
      currency: "USD",
      initialBalance: "2000.00",
      userId: user.id,
    },
  });

  const now = new Date();
  const thisMonth = (day: number) => new Date(now.getFullYear(), now.getMonth(), day);

  await prisma.transaction.createMany({
    data: [
      {
        amount: "8000.00",
        type: "INFLOW",
        date: thisMonth(5),
        description: "Salário mensal",
        fxRateAtCreation: "1",
        accountId: checking.id,
        categoryId: salary.id,
        userId: user.id,
      },
      {
        amount: "450.30",
        type: "OUTFLOW",
        date: thisMonth(8),
        description: "Supermercado",
        fxRateAtCreation: "1",
        accountId: checking.id,
        categoryId: groceries.id,
        userId: user.id,
      },
      {
        amount: "39.90",
        type: "OUTFLOW",
        date: thisMonth(10),
        description: "Netflix",
        fxRateAtCreation: "1",
        accountId: checking.id,
        categoryId: subscriptions.id,
        userId: user.id,
      },
      {
        amount: "120.00",
        type: "OUTFLOW",
        date: thisMonth(12),
        description: "Restaurante",
        fxRateAtCreation: "1",
        accountId: checking.id,
        categoryId: dining.id,
        userId: user.id,
      },
      {
        // USD expense converted to BRL preferred currency.
        amount: "15.00",
        type: "OUTFLOW",
        date: thisMonth(14),
        description: "Spotify (conta em USD)",
        fxRateAtCreation: "5.40",
        accountId: usdInvest.id,
        categoryId: subscriptions.id,
        userId: user.id,
      },
    ],
  });

  await prisma.recurringExpense.createMany({
    data: [
      {
        name: "Netflix",
        amount: "39.90",
        currency: "BRL",
        interval: "MONTHLY",
        active: true,
        categoryId: subscriptions.id,
        userId: user.id,
      },
      {
        name: "Spotify",
        amount: "15.00",
        currency: "USD",
        interval: "MONTHLY",
        active: true,
        categoryId: subscriptions.id,
        userId: user.id,
      },
      {
        name: "Academia",
        amount: "99.00",
        currency: "BRL",
        interval: "MONTHLY",
        active: true,
        userId: user.id,
      },
    ],
  });

  const debt = await prisma.debt.create({
    data: {
      debtorName: "Alice",
      description: "Ingressos de show",
      totalAmount: "300.00",
      currency: "BRL",
      dueDate: thisMonth(28),
      status: "PARTIAL",
      userId: user.id,
    },
  });
  await prisma.debtPayment.create({
    data: {
      amount: "100.00",
      paymentDate: thisMonth(18),
      fxRateAtCreation: "1",
      debtId: debt.id,
    },
  });

  await prisma.debt.create({
    data: {
      debtorName: "Bob",
      description: "Empréstimo do almoço",
      totalAmount: "50.00",
      currency: "BRL",
      status: "PENDING",
      userId: user.id,
    },
  });

  console.log(`Seeded user ${user.email} (password: demo1234)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
