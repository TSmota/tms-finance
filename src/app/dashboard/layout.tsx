import { requireUser } from "@/lib/session";
import { DashboardShell } from "@/components/DashboardShell";
import { PropsWithChildren } from "react";

export default async function DashboardLayout(props: PropsWithChildren) {
  const { children } = props;
  
  const user = await requireUser();
  return (
    <DashboardShell user={{ name: user.name, email: user.email }}>
      {children}
    </DashboardShell>
  );
}
