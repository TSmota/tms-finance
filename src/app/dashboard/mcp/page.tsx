import { redirect } from "next/navigation";

export default function McpRedirectPage() {
  redirect("/dashboard/agents");
}
