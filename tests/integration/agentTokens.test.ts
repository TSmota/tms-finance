import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { NotFoundError, InvalidOperationError } from "@/lib/errors";
import {
  hashAgentToken,
  listAgentTokens,
  mintAgentToken,
  revokeAgentToken,
  verifyAgentToken,
} from "@/lib/agentTokens";
import { makeUser } from "@tests/support/factories";

/**
 * Credenciais de máquina do endpoint MCP.
 *
 * O que estes testes protegem: que o token em claro nunca fique no banco, que
 * revogar tenha efeito imediato, e que a identidade resolvida seja sempre a do
 * dono do token — nunca a de outro usuário. As três são a diferença entre um
 * token e uma senha compartilhada.
 */

const ALL_SCOPES = ["finance:read", "transactions:write"] as const;

/**
 * Espera uma escrita fora do caminho crítico, com teto.
 *
 * Um `setImmediate` não serve: a gravação de `lastUsedAt` é um round-trip ao
 * Postgres, não um microtask.
 */
async function eventually<T>(read: () => Promise<T>, attempts = 50): Promise<T> {
  for (let i = 0; i < attempts; i += 1) {
    const value = await read();

    if (value !== null && value !== undefined) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return read();
}

describe("emissão", () => {
  it("devolve o token em claro uma vez e guarda só o hash", async () => {
    const user = await makeUser();

    const minted = await mintAgentToken(user.id, {
      label: "hermes-teste",
      scopes: ALL_SCOPES,
    });

    expect(minted.token).toMatch(/^hermes_live_[A-Za-z0-9_-]{43}$/);

    const row = await prisma.agentToken.findUniqueOrThrow({
      where: { id: minted.id },
      select: { tokenHash: true, tokenHint: true, scopes: true },
    });

    // O ponto inteiro do desenho: o valor em claro não está em lugar nenhum.
    expect(row.tokenHash).not.toBe(minted.token);
    expect(row.tokenHash).toBe(hashAgentToken(minted.token));
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // O hint identifica sem revelar: é prefixo, não o segredo.
    expect(minted.token.startsWith(row.tokenHint)).toBe(true);
    expect(row.tokenHint.length).toBeLessThan(minted.token.length);
  });

  it("recusa token sem escopo — ele autenticaria sem autorizar nada", async () => {
    const user = await makeUser();

    await expect(
      mintAgentToken(user.id, { label: "vazio", scopes: [] }),
    ).rejects.toThrow(InvalidOperationError);

    expect(await prisma.agentToken.count()).toBe(0);
  });

  it("descarta escopo desconhecido em vez de gravá-lo", async () => {
    const user = await makeUser();

    const minted = await mintAgentToken(user.id, {
      label: "misto",
      // @ts-expect-error entrada deliberadamente inválida, como viria de um CLI
      scopes: ["finance:read", "inventado:write"],
    });

    expect(minted.scopes).toEqual(["finance:read"]);
  });

  it("emite dois tokens independentes para o mesmo usuário — é o que permite rotação sem downtime", async () => {
    const user = await makeUser();

    const first = await mintAgentToken(user.id, { label: "antigo", scopes: ALL_SCOPES });
    const second = await mintAgentToken(user.id, { label: "novo", scopes: ALL_SCOPES });

    expect(first.token).not.toBe(second.token);
    expect(await verifyAgentToken(first.token)).not.toBeNull();
    expect(await verifyAgentToken(second.token)).not.toBeNull();
  });
});

describe("verificação", () => {
  it("resolve a identidade do dono, com escopos e moeda base", async () => {
    const user = await makeUser({ baseCurrency: "USD" });
    const minted = await mintAgentToken(user.id, { label: "h", scopes: ALL_SCOPES });

    const identity = await verifyAgentToken(minted.token);

    expect(identity).toEqual({
      tokenId: minted.id,
      userId: user.id,
      scopes: ["finance:read", "transactions:write"],
      baseCurrency: "USD",
    });
  });

  it("recusa token inexistente, malformado e sem prefixo", async () => {
    expect(await verifyAgentToken("hermes_live_naoexiste")).toBeNull();
    expect(await verifyAgentToken("")).toBeNull();
    expect(await verifyAgentToken("Bearer algo")).toBeNull();
  });

  it("recusa token revogado, imediatamente", async () => {
    const user = await makeUser();
    const minted = await mintAgentToken(user.id, { label: "h", scopes: ALL_SCOPES });

    expect(await verifyAgentToken(minted.token)).not.toBeNull();

    await revokeAgentToken(user.id, minted.id);

    expect(await verifyAgentToken(minted.token)).toBeNull();
  });

  /** Relógio explícito: um teste que depende do relógio real quebra sozinho. */
  it("recusa token expirado", async () => {
    const user = await makeUser();
    const expiresAt = new Date("2026-08-21T12:00:00Z");
    const minted = await mintAgentToken(user.id, {
      label: "h",
      scopes: ALL_SCOPES,
      expiresAt,
    });

    expect(await verifyAgentToken(minted.token, new Date("2026-08-21T11:59:59Z"))).not.toBeNull();
    expect(await verifyAgentToken(minted.token, new Date("2026-08-21T12:00:00Z"))).toBeNull();
    expect(await verifyAgentToken(minted.token, new Date("2026-08-21T12:00:01Z"))).toBeNull();
  });

  /**
   * O isolamento entre usuários não é uma regra da casca MCP — é o serviço que
   * amarra o token a um `userId`. Este teste é o que prova que o token de um
   * não vira acesso ao dado do outro.
   */
  it("nunca resolve para outro usuário", async () => {
    const owner = await makeUser({ email: "owner@test.local" });
    const stranger = await makeUser({ email: "stranger@test.local" });

    const ownerToken = await mintAgentToken(owner.id, { label: "o", scopes: ALL_SCOPES });
    const strangerToken = await mintAgentToken(stranger.id, { label: "s", scopes: ALL_SCOPES });

    expect((await verifyAgentToken(ownerToken.token))?.userId).toBe(owner.id);
    expect((await verifyAgentToken(strangerToken.token))?.userId).toBe(stranger.id);
  });

  /**
   * A escrita é fire-and-forget de propósito — telemetria não pode derrubar a
   * chamada que ela só deveria observar. Então a espera é limitada, e não um
   * tick do event loop: a gravação é uma ida ao banco de verdade. O que este
   * teste protege é que o `catch` do fire-and-forget não está engolindo uma
   * falha real e fingindo sucesso.
   */
  it("registra lastUsedAt sem bloquear a verificação", async () => {
    const user = await makeUser();
    const minted = await mintAgentToken(user.id, { label: "h", scopes: ALL_SCOPES });
    const usedAt = new Date("2026-08-21T12:00:00Z");

    await verifyAgentToken(minted.token, usedAt);

    const recorded = await eventually(async () => {
      const row = await prisma.agentToken.findUniqueOrThrow({
        where: { id: minted.id },
        select: { lastUsedAt: true },
      });

      return row.lastUsedAt;
    });

    expect(recorded?.toISOString()).toBe(usedAt.toISOString());
  });
});

describe("revogação e listagem", () => {
  it("é idempotente e preserva a data da primeira revogação", async () => {
    const user = await makeUser();
    const minted = await mintAgentToken(user.id, { label: "h", scopes: ALL_SCOPES });
    const first = new Date("2026-08-21T10:00:00Z");

    await revokeAgentToken(user.id, minted.id, first);
    await revokeAgentToken(user.id, minted.id, new Date("2026-08-21T11:00:00Z"));

    const row = await prisma.agentToken.findUniqueOrThrow({
      where: { id: minted.id },
      select: { revokedAt: true },
    });

    // A data registra quando o acesso de fato terminou; sobrescrevê-la mentiria.
    expect(row.revokedAt?.toISOString()).toBe(first.toISOString());
  });

  it("recusa revogar token de outro usuário, indistinguível de inexistente", async () => {
    const owner = await makeUser({ email: "o2@test.local" });
    const stranger = await makeUser({ email: "s2@test.local" });
    const minted = await mintAgentToken(owner.id, { label: "h", scopes: ALL_SCOPES });

    await expect(revokeAgentToken(stranger.id, minted.id)).rejects.toThrow(NotFoundError);

    // E não deixou lixo: o token do dono continua válido.
    expect(await verifyAgentToken(minted.token)).not.toBeNull();
  });

  it("lista sem revelar o segredo", async () => {
    const user = await makeUser();
    const minted = await mintAgentToken(user.id, { label: "hermes", scopes: ALL_SCOPES });

    const [listed] = await listAgentTokens(user.id);

    expect(listed.id).toBe(minted.id);
    expect(listed.label).toBe("hermes");
    expect(JSON.stringify(listed)).not.toContain(minted.token);
  });

  it("lista só os tokens do usuário", async () => {
    const owner = await makeUser({ email: "o3@test.local" });
    const stranger = await makeUser({ email: "s3@test.local" });

    await mintAgentToken(owner.id, { label: "do dono", scopes: ALL_SCOPES });
    await mintAgentToken(stranger.id, { label: "do outro", scopes: ALL_SCOPES });

    const listed = await listAgentTokens(owner.id);

    expect(listed).toHaveLength(1);
    expect(listed[0].label).toBe("do dono");
  });
});
