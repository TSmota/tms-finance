import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { clientIp, consumeRateLimit, LOGIN_BY_EMAIL, LOGIN_BY_IP } from "@/lib/rateLimit";
import { UUID_PATTERN } from "@/lib/uuid";
import { loginSchema } from "@/lib/validations";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Acrescenta ao callback compartilhado a revogação por troca de senha.
     *
     * Mora aqui, e não em `auth.config.ts`, porque consulta o Postgres: aquele
     * arquivo também é carregado pelo proxy, que roda no edge.
     *
     * A comparação é contra `authTime`, gravado uma única vez no login. Contra
     * o `iat` ela não funcionaria: a sessão deslizante reemite o token a cada
     * 15 minutos de uso, e o `iat` do cookie roubado ficaria sempre mais novo
     * que a troca de senha que deveria matá-lo.
     */
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

      if (params.user) {
        return token;
      }

      if (typeof token.id !== "string" || !UUID_PATTERN.test(token.id)) {
        return null;
      }

      const owner = await prisma.user.findUnique({
        where: { id: token.id },
        select: { passwordChangedAt: true },
      });

      // Sessão sem `authTime` é anterior a este campo: vale até a troca de senha.
      const issuedAt = typeof token.authTime === "number" ? token.authTime * 1000 : 0;

      if (owner?.passwordChangedAt && owner.passwordChangedAt.getTime() > issuedAt) {
        return null;
      }

      return token;
    },
  },
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // Contada antes de conferir a senha: o que a janela precisa medir é a
        // tentativa, e só o erro seria contado se a contagem viesse depois.
        const ip = clientIp(request.headers);
        const quotas = await Promise.all([
          consumeRateLimit(LOGIN_BY_EMAIL, email.toLowerCase()),
          ip ? consumeRateLimit(LOGIN_BY_IP, ip) : null,
        ]);

        // Mesma recusa de senha errada, de propósito: distinguir as duas diria
        // ao atacante que o endereço existe e que vale insistir de outro IP.
        if (quotas.some((quota) => quota && !quota.allowed)) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        // Sem `baseCurrency`: o JWT não a carrega mais, porque a cópia ficava
        // velha depois da troca em `/dashboard/settings`. Ver `auth.config.ts`.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
});
