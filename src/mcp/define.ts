import type {
  CallToolResult,
  InputRequiredResult,
  McpServer,
  ServerContext,
} from "@modelcontextprotocol/server";
import type { z, ZodType } from "zod";

import type { DeletionTarget } from "@/lib/deletionImpact";
import type { RevalidationDomain } from "@/lib/revalidation";
import { idArgs } from "@/mcp/args";
import type { AgentContext } from "@/mcp/context";
import { runDestructiveTool, runTool } from "@/mcp/guard";

/**
 * Registro de ferramenta MCP com o nome escrito uma vez só.
 *
 * A forma manual repetia o nome três vezes — no `registerTool`, no `tool:` do
 * guard e em `scopes.ts` — e o schema duas, como `inputSchema` e como `schema`.
 * Divergir em qualquer uma delas era silencioso: o `tools/list` anunciaria uma
 * coisa e a validação aplicaria outra, ou a auditoria gravaria o nome errado.
 *
 * `registry.test.ts` fecha a terceira ocorrência, conferindo os nomes de fato
 * registrados contra `TOOL_SCOPES`.
 */

/**
 * `registerTool` deriva o tipo dos argumentos por condicional sobre o schema, e
 * um genérico ainda não resolvido a mantém diferida: nenhuma das duas
 * sobrecargas casa. A erasure fica aqui, uma vez — os call sites continuam
 * tipados por {@link ToolDefinition}, que é onde o erro custa caro.
 */
type Register = (
  name: string,
  config: { title: string; description: string; inputSchema: ZodType },
  cb: (args: unknown, ctx: ServerContext) => Promise<CallToolResult | InputRequiredResult>,
) => void;

interface ToolDefinition<TSchema extends ZodType, TResult> {
  title: string;
  description: string;
  /** O mesmo objeto anunciado no `tools/list` e aplicado antes de executar. */
  schema: TSchema;
  run: (agent: AgentContext, input: z.infer<TSchema>) => Promise<TResult>;
  serialize: (result: TResult, agent: AgentContext) => unknown;
  /** IDs tocados — é o que permite reconstituir e desfazer depois. */
  affected?: (result: TResult) => string[];
  /** Domínio afetado. Ausente = leitura, nada a invalidar. */
  revalidates?: RevalidationDomain;
}

export function defineTool<TSchema extends ZodType, TResult>(
  server: McpServer,
  name: string,
  definition: ToolDefinition<TSchema, TResult>,
): void {
  const register = server.registerTool.bind(server) as unknown as Register;

  register(
    name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.schema,
    },
    async (args, ctx) =>
      runTool<z.infer<TSchema>, TResult>({
        ctx,
        tool: name,
        input: args,
        schema: definition.schema as ZodType<z.infer<TSchema>>,
        run: definition.run,
        serialize: definition.serialize,
        affected: definition.affected,
        revalidates: definition.revalidates,
      }),
  );
}

interface DestructiveToolDefinition {
  title: string;
  description: string;
  /** Qual medição de impacto responde a pergunta de confirmação. */
  target: DeletionTarget;
  run: (agent: AgentContext, id: string) => Promise<void>;
  revalidates: RevalidationDomain;
}

/** Toda remoção em cascata recebe `{ id }` e passa pela confirmação em duas fases. */
export function defineDestructiveTool(
  server: McpServer,
  name: string,
  definition: DestructiveToolDefinition,
): void {
  const register = server.registerTool.bind(server) as unknown as Register;

  register(
    name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: idArgs,
    },
    async (args, ctx) =>
      runDestructiveTool({
        ctx,
        tool: name,
        target: definition.target,
        input: args,
        schema: idArgs,
        run: definition.run,
        revalidates: definition.revalidates,
      }),
  );
}
