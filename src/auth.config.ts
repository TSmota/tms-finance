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
     * Só o `id` entra no token.
     *
     * O JWT é auto-contido e só é reescrito no login, então uma `baseCurrency`
     * copiada aqui ficaria velha assim que o usuário a trocasse. Quem precisa
     * do valor lê do banco.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
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
