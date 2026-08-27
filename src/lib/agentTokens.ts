import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Currency } from "@prisma/client";

import { prisma } from "@/lib/db";
import { InvalidOperationError, NotFoundError } from "@/lib/errors";
import { parseAgentScopes, type AgentScope } from "@/lib/agentScopes";

/**
 * Credenciais de máquina do endpoint MCP.
 *
 * Serviço como qualquer outro de `src/lib/`: recebe parâmetros explícitos,
 * escopa por `userId`, lança erro de domínio, não conhece HTTP.
 *
 * **Por que token opaco em banco, e não JWT:** JWT não é revogável antes de
 * expirar, e a única forma de invalidá-lo em massa seria reciclar
 * `AUTH_SECRET` — que derrubaria todas as sessões web de todos os usuários. O
 * oposto de contenção. Aqui, revogar é um `UPDATE` numa linha.
 *
 * **Por que HMAC e não bcrypt:** o token é 256 bits aleatórios, então não é
 * força-brutável e o custo de um KDF não compra nada. Ele entraria no caminho
 * quente de *toda* chamada de ferramenta. O pepper dá a defesa em profundidade
 * que interessa: um dump do banco sem acesso ao ambiente não permite montar a
 * tabela de hashes.
 */

const TOKEN_PREFIX = "hermes_live_";

/** 32 bytes = 256 bits, em base64url sem padding: 43 caracteres. */
const TOKEN_BYTES = 32;

/** `hermes_live_` + 6 caracteres do segredo. Identifica sem revelar. */
const HINT_SECRET_CHARS = 6;

/**
 * O pepper é lido a cada chamada, não capturado no import.
 *
 * Ler no topo do módulo congelaria o valor no primeiro import — o que quebra
 * os testes, que injetam o ambiente por project do Vitest, e esconderia a
 * ausência da variável atrás de um `undefined` silencioso.
 */
function requirePepper(): string {
  const pepper = process.env.AGENT_TOKEN_PEPPER;

  if (!pepper || pepper.length < 32) {
    throw new Error(
      "AGENT_TOKEN_PEPPER ausente ou com menos de 32 caracteres. " +
        "Gere com: openssl rand -base64 33",
    );
  }

  return pepper;
}

/** HMAC-SHA256 do token, em hex. É o que vai para a coluna `token_hash`. */
export function hashAgentToken(rawToken: string): string {
  return createHmac("sha256", requirePepper()).update(rawToken, "utf8").digest("hex");
}

export interface AgentIdentity {
  tokenId: string;
  userId: string;
  scopes: AgentScope[];
  /** Moeda dos relatórios do dono do token. */
  baseCurrency: Currency;
}

export interface MintedAgentToken {
  /** O token em claro. Existe **uma vez**: não é recuperável depois. */
  token: string;
  id: string;
  label: string;
  tokenHint: string;
  scopes: AgentScope[];
  expiresAt: Date | null;
}

export async function mintAgentToken(
  userId: string,
  params: { label: string; scopes: readonly AgentScope[]; expiresAt?: Date | null },
): Promise<MintedAgentToken> {
  const scopes = parseAgentScopes(params.scopes);

  // O banco também recusa (CHECK `agent_tokens_scopes_not_empty`), mas a
  // mensagem dele não diz o que fazer. Esta diz.
  if (scopes.length === 0) {
    throw new InvalidOperationError(
      "Um token precisa de pelo menos um escopo conhecido.",
    );
  }

  const label = params.label.trim();

  if (label.length === 0) {
    throw new InvalidOperationError("O token precisa de um rótulo.");
  }

  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  const token = `${TOKEN_PREFIX}${secret}`;

  const record = await prisma.agentToken.create({
    data: {
      userId,
      label,
      tokenHash: hashAgentToken(token),
      tokenHint: `${TOKEN_PREFIX}${secret.slice(0, HINT_SECRET_CHARS)}`,
      scopes,
      expiresAt: params.expiresAt ?? null,
    },
    select: { id: true, label: true, tokenHint: true, expiresAt: true },
  });

  return { token, scopes, ...record };
}

/**
 * Resolve um bearer token no `AgentToken` correspondente, ou `null`.
 *
 * `null` para toda falha — inexistente, revogado, expirado, formato errado —
 * porque de fora elas devem ser indistinguíveis. Mesma razão pela qual
 * `NotFoundError` cobre "não existe" e "é de outro usuário".
 */
export async function verifyAgentToken(
  rawToken: string,
  now: Date = new Date(),
): Promise<AgentIdentity | null> {
  // Rejeição barata antes de tocar o banco: um token sem o prefixo não pode
  // ter sido emitido aqui.
  if (!rawToken.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const expected = hashAgentToken(rawToken);

  const record = await prisma.agentToken.findUnique({
    where: { tokenHash: expected },
    select: {
      id: true,
      tokenHash: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { id: true, baseCurrency: true } },
    },
  });

  if (!record) {
    return null;
  }

  // O `findUnique` já casou o hash, então esta comparação não decide nada — ela
  // existe para que a igualdade final não seja um `===` de string, que compara
  // byte a byte com saída antecipada. Defesa em profundidade barata.
  if (!timingSafeEqual(Buffer.from(record.tokenHash, "hex"), Buffer.from(expected, "hex"))) {
    return null;
  }

  if (record.revokedAt !== null) {
    return null;
  }

  if (record.expiresAt !== null && record.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  // Telemetria fora do caminho crítico: uma falha ao gravar `lastUsedAt` não
  // pode derrubar a chamada que ela só deveria observar.
  void prisma.agentToken
    .update({ where: { id: record.id }, data: { lastUsedAt: now } })
    .catch((error: unknown) => {
      console.error("Falha ao registrar lastUsedAt do token de agente:", error);
    });

  return {
    tokenId: record.id,
    userId: record.user.id,
    scopes: parseAgentScopes(record.scopes),
    baseCurrency: record.user.baseCurrency,
  };
}

export interface AgentTokenSummary {
  id: string;
  label: string;
  tokenHint: string;
  scopes: AgentScope[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export async function listAgentTokens(userId: string): Promise<AgentTokenSummary[]> {
  const rows = await prisma.agentToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      tokenHint: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({ ...row, scopes: parseAgentScopes(row.scopes) }));
}

/**
 * Revoga o token. Idempotente: revogar duas vezes preserva a primeira data,
 * porque é ela que registra quando o acesso de fato terminou.
 */
export async function revokeAgentToken(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  const { count } = await prisma.agentToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: now },
  });

  if (count > 0) {
    return;
  }

  // Nada atualizado: ou não existe / é de outro usuário, ou já estava revogado.
  // Só o primeiro caso é erro.
  const exists = await prisma.agentToken.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!exists) {
    throw new NotFoundError("Token de agente não encontrado");
  }
}
