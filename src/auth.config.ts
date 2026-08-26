import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Configuração do Auth.js compartilhada entre o proxy e o `auth.ts` completo.
 * Não pode importar Prisma nem bcrypt, que são Node-only.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    /**
     * Expiração deslizante: 24h **de inatividade**, renovadas a cada 15 min de
     * uso. Os 30 dias do default deixavam um cookie roubado valendo um mês.
     *
     * O que corta a sessão na hora é a troca de senha, em `auth.ts` — a
     * renovação não a burla, porque a comparação é contra `authTime`, fixado no
     * login, e não contra o `iat` que a renovação reescreve.
     */
    maxAge: 24 * 60 * 60,
    updateAge: 15 * 60,
  },
  providers: [Google],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

      if (isOnDashboard) {
        return isLoggedIn;
      }

      return true;
    },
    /**
     * Só o `id` e o instante do login entram no token.
     *
     * O JWT é auto-contido e só é reescrito no login, então uma `baseCurrency`
     * copiada aqui ficaria velha assim que o usuário a trocasse. Quem precisa
     * do valor lê do banco.
     *
     * Esta versão não consulta o banco, porque roda também no proxy (edge). A
     * revogação por troca de senha é acrescentada em `auth.ts`, no runtime Node.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.authTime = Math.floor(Date.now() / 1000);
      }

      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") {
        session.user.id = token.id;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
