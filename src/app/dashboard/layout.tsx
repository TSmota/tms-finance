import type { PropsWithChildren } from "react";

import { requireUser } from "@/lib/session";
import { DashboardShell } from "@/components/DashboardShell";

export default async function DashboardLayout(props: PropsWithChildren) {
  const user = await requireUser();

  return (
    <DashboardShell user={{ name: user.name, email: user.email }}>
      {props.children}
    </DashboardShell>
  );
}
