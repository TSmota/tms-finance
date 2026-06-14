import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Session } from "next-auth";

/** 
 * Returns the authenticated user or redirects to /login.
 */
export async function requireUser(): Promise<Session['user']> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return {
    id: session.user.id,
    preferredCurrency: session.user.preferredCurrency ?? "BRL",
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };
}
