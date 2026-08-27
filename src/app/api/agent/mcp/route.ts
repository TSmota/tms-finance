import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { verifyAgentToken } from "@/lib/agentTokens";
import { confirmCodec } from "@/mcp/confirm";
import { registerTools } from "@/mcp/registry";

/**
 * Endpoint MCP: `POST /api/agent/mcp`.
 *
 * Runtime Node, nunca edge: o Prisma com `PrismaPg` precisa de Node.
 *
 * Fora do matcher do proxy, que cobre só `/dashboard/:path*`: a autenticação
 * aqui é bearer token, e um redirect para `/login` no lugar de 401 quebraria o
 * cliente.
 *
 * Serving stateless — único modo do `mcp-handler` 2.x. Como consequência,
 * ferramenta destrutiva só funciona com cliente que declara elicitação por
 * requisição: não há canal server→client.
 */

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: "tms-finance", version: "1.0.0" },
    instructions:
      "Controle financeiro pessoal. Três coisas que mudam a resposta certa: " +
      "(1) valores monetários vêm como string — não some, use as agregações; " +
      "(2) compra no cartão não sai da conta, o que sai é o pagamento da fatura; " +
      "(3) `complete: false` num total significa cotação faltando — relate a " +
      "incerteza em vez de apresentar o número como fato.",
    /**
     * O `requestState` volta pelo cliente e é entrada não confiável; o SDK não
     * verifica nada por default. Sem este hook, um cliente forjaria uma
     * confirmação. Roda antes do handler: state adulterado vira `-32602`.
     *
     * Em closure porque o codec lê `AGENT_TOKEN_PEPPER` em runtime, não no
     * import.
     */
    requestState: {
      verify: (state, ctx) => confirmCodec().verify(state, ctx),
    },
  },
);

/**
 * Resolve o bearer token na identidade do agente.
 *
 * `undefined` para toda falha — ausente, malformado, inexistente, revogado,
 * expirado — porque de fora elas devem ser indistinguíveis.
 *
 * `clientId` recebe o id do token: é o que amarra a confirmação ao principal,
 * impedindo que state emitido para um token sirva a outro.
 */
const verifyToken = async (_req: Request, bearerToken?: string) => {
  if (!bearerToken) {
    return undefined;
  }

  const identity = await verifyAgentToken(bearerToken);

  if (!identity) {
    return undefined;
  }

  return {
    token: bearerToken,
    clientId: identity.tokenId,
    scopes: identity.scopes,
    extra: {
      userId: identity.userId,
      baseCurrency: identity.baseCurrency,
    },
  };
};

/**
 * Sem `requiredScopes`: a checagem é por ferramenta, dentro do `runTool`. Um
 * escopo global responderia 403 antes de saber qual ferramenta foi pedida, e a
 * auditoria perderia essa informação.
 */
const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST };
