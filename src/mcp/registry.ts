import type { McpServer } from "@modelcontextprotocol/server";

import { registerReadTools } from "@/mcp/tools/read";
import { registerWriteTools } from "@/mcp/tools/write";
import { registerDestructiveTools } from "@/mcp/tools/destructive";

/**
 * Ponto único de registro das ferramentas.
 *
 * **Todas as ferramentas são registradas para todo token**, e a recusa por
 * escopo acontece no `runTool`. Filtrar o `tools/list` por escopo foi tentado e
 * revertido: ferramenta não registrada não é chamável, então a tentativa morre
 * como `-32602 "Tool not found"` antes do guard e não deixa linha na auditoria.
 *
 * O custo é uma ida e volta desperdiçada quando o agente tenta algo fora do
 * escopo. Em troca a recusa é auditada e nomeia o escopo faltante.
 *
 * `disable()` do SDK não resolve: some da lista, mas também torna a ferramenta
 * não-chamável, caindo no mesmo caminho sem auditoria.
 */
export function registerTools(server: McpServer): void {
  registerReadTools(server);
  registerWriteTools(server);
  registerDestructiveTools(server);
}
