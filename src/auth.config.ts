import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js configuration shared between middleware and the full
 * server-side `auth.ts`. It must not import Prisma or bcrypt (Node-only).
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

      if (isOnDashboard) return isLoggedIn;

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.preferredCurrency = user.preferredCurrency ?? "BRL";
      }

      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") {
        session.user.id = token.id;
      }

      if (typeof token.preferredCurrency === "string") {
        session.user.preferredCurrency = token.preferredCurrency;
      } else {
        session.user.preferredCurrency = "BRL";
      }
      
      return session;
    },
  },
} satisfies NextAuthConfig;
