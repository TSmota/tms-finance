import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * Trilha de auditoria da superfície de agente.
 *
 * Escrita em **todos** os caminhos, inclusive recusa por escopo e token
 * inválido: um log que só registra sucesso não serve para investigar
 * incidente, porque é exatamente a chamada negada que se quer ver depois.
 *
 * `CONFIRM_REQUIRED` não é falha — é a primeira metade de uma remoção em duas
 * fases. Uma linha `CONFIRM_REQUIRED` sem o `OK` correspondente diz que o
 * agente pediu a remoção, viu o impacto e não voltou. Isso é informação.
 */

export const AGENT_VERDICTS = [
  "OK",
  "CONFIRM_REQUIRED",
  "INVALID_INPUT",
  "FORBIDDEN_SCOPE",
  "RATE_LIMITED",
  "DOMAIN_ERROR",
  "FX_UNAVAILABLE",
  "ERROR",
] as const;

export type AgentVerdict = (typeof AGENT_VERDICTS)[number];

export interface AgentCallRecord {
  /** Nulo quando o token apresentado não existia: não há a que vincular. */
  tokenId: string | null;
  userId: string | null;
  tool: string;
  verdict: AgentVerdict;
  /** Já sanitizados pelo chamador — ver `src/mcp/guard.ts`. */
  args: Prisma.InputJsonValue;
  affectedIds?: readonly string[];
  errorCode?: string | null;
  durationMs: number;
  ip?: string | null;
}

/**
 * Grava a linha e **nunca** propaga erro.
 *
 * Um log que derruba a operação que ele deveria observar é pior que log
 * ausente: transformaria uma indisponibilidade de escrita da tabela de
 * auditoria em indisponibilidade de todo o endpoint.
 */
export async function recordAgentCall(entry: AgentCallRecord): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        tokenId: entry.tokenId,
        userId: entry.userId,
        tool: entry.tool,
        verdict: entry.verdict,
        args: entry.args,
        affectedIds: [...(entry.affectedIds ?? [])],
        errorCode: entry.errorCode ?? null,
        // O CHECK do banco recusa negativo, e `Math.max` evita que um relógio
        // torto derrube a gravação do log inteiro por causa da duração.
        durationMs: Math.max(0, Math.round(entry.durationMs)),
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    console.error("Falha ao gravar auditoria de agente:", error);
  }
}

/**
 * Retenção da trilha: 90 dias.
 *
 * O índice de `createdAt` no schema já se declarava "para retenção", mas nada
 * apagava — cerca de 10 M de linhas com JSONB por ano, que nenhuma consulta do
 * produto lê. Noventa dias cobrem a janela em que uma investigação de incidente
 * ainda é útil.
 */
export const AGENT_AUDIT_RETENTION_DAYS = 90;

export async function pruneAgentAudit(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AGENT_AUDIT_RETENTION_DAYS * 86_400_000);

  const { count } = await prisma.agentAuditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return count;
}
