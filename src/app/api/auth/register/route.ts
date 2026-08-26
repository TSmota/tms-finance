import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { clientIp, consumeRateLimit, REGISTER_BY_IP } from "@/lib/rateLimit";
import { registerSchema } from "@/lib/validations";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  if (ip) {
    const rate = await consumeRateLimit(REGISTER_BY_IP, ip);

    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas de cadastro. Tente novamente mais tarde." },
        { status: 429 },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Entrada inválida" },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: { name, email, passwordHash },
    });
  } catch (err) {
    // Violação da unique de email — a única falha esperada aqui.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Este email já está cadastrado. Entre com a sua senha." },
        { status: 409 },
      );
    }

    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
