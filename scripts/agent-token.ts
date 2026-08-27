import "dotenv/config";

import { AGENT_SCOPES, isAgentScope, type AgentScope } from "../src/lib/agentScopes";
import {
  listAgentTokens,
  mintAgentToken,
  revokeAgentToken,
} from "../src/lib/agentTokens";
import { prisma } from "../src/lib/db";

/**
 * CLI de credenciais de agente.
 *
 * Existe porque emitir o token é a única operação do sistema cujo resultado não
 * pode ser relido: o valor em claro aparece **uma vez**, no stdout, e depois só
 * existe o `tokenHint`. Uma tela faria a mesma coisa, mas o token passaria pelo
 * histórico do navegador e pelo payload de RSC — o terminal é o canal mais
 * estreito disponível.
 *
 *   npx tsx scripts/agent-token.ts mint --user <email> --label hermes-prod \
 *     --scopes finance:read,transactions:write --expires 90d
 *   npx tsx scripts/agent-token.ts list --user <email>
 *   npx tsx scripts/agent-token.ts revoke --user <email> --id <uuid>
 */

interface Flags {
  [key: string]: string | undefined;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    // Flag sem valor é booleana: `--json` vira "true", não engole o próximo.
    flags[key] = next && !next.startsWith("--") ? next : "true";
  }

  return flags;
}

/** `90d`, `12h`, `30` (dias). Ausente = sem expiração. */
function parseExpiry(raw: string | undefined, now: Date): Date | null {
  if (!raw || raw === "true") {
    return null;
  }

  const match = /^(\d+)([dh])?$/.exec(raw);

  if (!match) {
    throw new Error(`--expires inválido: "${raw}". Use 90d, 12h ou um número de dias.`);
  }

  const value = Number(match[1]);
  const hours = match[2] === "h" ? value : value * 24;

  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function parseScopes(raw: string | undefined): AgentScope[] {
  if (!raw || raw === "true") {
    throw new Error(
      `--scopes é obrigatório. Conhecidos: ${AGENT_SCOPES.join(", ")}`,
    );
  }

  const requested = raw.split(",").map((scope) => scope.trim()).filter(Boolean);
  const unknown = requested.filter((scope) => !isAgentScope(scope));

  // Recusar em vez de filtrar: um escopo escrito errado viraria um token com
  // menos poder do que se pediu, e a falha apareceria só na primeira chamada.
  if (unknown.length > 0) {
    throw new Error(
      `Escopo desconhecido: ${unknown.join(", ")}.\nConhecidos: ${AGENT_SCOPES.join(", ")}`,
    );
  }

  return requested.filter(isAgentScope);
}

async function resolveUserId(flags: Flags): Promise<string> {
  const email = flags.user;

  if (!email || email === "true") {
    throw new Error("--user <email> é obrigatório.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`Usuário não encontrado: ${email}`);
  }

  return user.id;
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "—";
}

async function mint(flags: Flags): Promise<void> {
  const userId = await resolveUserId(flags);
  const scopes = parseScopes(flags.scopes);
  const label = flags.label && flags.label !== "true" ? flags.label : "agent";
  const expiresAt = parseExpiry(flags.expires, new Date());

  const minted = await mintAgentToken(userId, { label, scopes, expiresAt });

  console.log("");
  console.log("  Token emitido.");
  console.log("");
  console.log(`    ${minted.token}`);
  console.log("");
  console.log("  ⚠  Este valor NÃO é recuperável. Copie agora.");
  console.log("     Guarde na configuração do agente, nunca no repositório.");
  console.log("");
  console.log(`     id       ${minted.id}`);
  console.log(`     rótulo   ${minted.label}`);
  console.log(`     escopos  ${minted.scopes.join(", ")}`);
  console.log(`     expira   ${formatDate(minted.expiresAt)}`);
  console.log("");
}

async function list(flags: Flags): Promise<void> {
  const userId = await resolveUserId(flags);
  const tokens = await listAgentTokens(userId);

  if (tokens.length === 0) {
    console.log("Nenhum token de agente emitido para este usuário.");

    return;
  }

  console.log("");

  for (const token of tokens) {
    const state = token.revokedAt
      ? `revogado em ${formatDate(token.revokedAt)}`
      : token.expiresAt && token.expiresAt <= new Date()
        ? `expirado em ${formatDate(token.expiresAt)}`
        : "ativo";

    console.log(`  ${token.label}  [${state}]`);
    console.log(`    id        ${token.id}`);
    console.log(`    token     ${token.tokenHint}…`);
    console.log(`    escopos   ${token.scopes.join(", ")}`);
    console.log(`    expira    ${formatDate(token.expiresAt)}`);
    console.log(`    último uso ${formatDate(token.lastUsedAt)}`);
    console.log("");
  }
}

async function revoke(flags: Flags): Promise<void> {
  const userId = await resolveUserId(flags);
  const id = flags.id;

  if (!id || id === "true") {
    throw new Error("--id <uuid> é obrigatório. Use `list` para descobrir.");
  }

  await revokeAgentToken(userId, id);

  console.log(`Token ${id} revogado. O acesso para de valer na próxima chamada.`);
}

const USAGE = `
Uso: npx tsx scripts/agent-token.ts <comando> [flags]

Comandos
  mint     Emite um token novo. Mostra o valor em claro uma única vez.
  list     Lista os tokens do usuário, sem revelar nenhum.
  revoke   Revoga um token pelo id.

Flags
  --user <email>       Dono do token. Obrigatório.
  --label <texto>      Rótulo humano (mint). Default: "agent".
  --scopes <a,b,c>     Escopos separados por vírgula (mint). Obrigatório.
  --expires <90d|12h>  Validade (mint). Ausente = sem expiração.
  --id <uuid>          Token alvo (revoke).

Escopos conhecidos
  ${AGENT_SCOPES.join("\n  ")}
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (command) {
    case "mint":
      await mint(flags);
      break;
    case "list":
      await list(flags);
      break;
    case "revoke":
      await revoke(flags);
      break;
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main()
  .catch((error: unknown) => {
    console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
