import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const { parseFlag, parseId, revalidateDomain, runAction } = await import("./guard");
const { DomainError, InvalidOperationError, NotFoundError } = await import("@/lib/errors");
const { FxUnavailableError } = await import("@/lib/fxService");
const { REVALIDATION_TARGETS } = await import("@/lib/revalidation");

/**
 * A fronteira entre serviços e UI, que nada travava.
 *
 * Dois contratos aqui são internos e frágeis: a tradução de
 * `FxUnavailableError` em `needsManualFxRate`, que é como o formulário sabe
 * pedir a taxa à mão, e o reencaminhamento do `redirect()` do Next — que
 * sinaliza por exceção e seria engolido como "erro inesperado" se o sniffing de
 * `digest` parasse de reconhecê-lo.
 */

beforeEach(() => {
  revalidatePath.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAction", () => {
  it("devolve ok quando a operação conclui", async () => {
    await expect(runAction(async () => undefined)).resolves.toEqual({ ok: true });
  });

  it("pede a taxa manual quando o câmbio está fora", async () => {
    const result = await runAction(async () => {
      throw new FxUnavailableError();
    });

    expect(result).toEqual({
      ok: false,
      needsManualFxRate: true,
      error: "Taxa de câmbio indisponível. Informe manualmente.",
    });
  });

  it("repassa a mensagem de todo erro de domínio", async () => {
    for (const error of [
      new NotFoundError("Conta não encontrada"),
      new InvalidOperationError("Esta fatura já foi paga"),
      new DomainError("Regra de negócio"),
    ]) {
      await expect(
        runAction(async () => {
          throw error;
        }),
      ).resolves.toEqual({ ok: false, error: error.message });
    }
  });

  it("esconde o erro desconhecido atrás de texto genérico", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runAction(async () => {
      throw new Error("SELECT * FROM users falhou: connection refused em 10.0.0.4:5432");
    });

    expect(result).toEqual({ ok: false, error: "Ocorreu um erro inesperado. Tente novamente." });
    // Some da resposta, mas não do servidor.
    expect(logged).toHaveBeenCalled();
  });

  it("deixa o redirect do Next continuar subindo", async () => {
    // `redirect()` sinaliza por exceção: capturá-la aqui viraria um "erro
    // inesperado" na tela em vez da navegação que a action pediu.
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });

    await expect(
      runAction(async () => {
        throw redirectError;
      }),
    ).rejects.toBe(redirectError);
  });

  it("não confunde um erro qualquer com digest com o redirect", async () => {
    const result = await runAction(async () => {
      throw Object.assign(new Error("outra coisa"), { digest: "1234567890" });
    });

    expect(result).toEqual({ ok: false, error: "Ocorreu um erro inesperado. Tente novamente." });
  });
});

describe("parseId", () => {
  it("aceita um uuid", () => {
    const id = "9f8b2c1e-3d4a-4b5c-8e7f-0a1b2c3d4e5f";

    expect(parseId(id)).toBe(id);
  });

  it.each([
    ["string vazia", ""],
    ["id numérico", "42"],
    ["uuid truncado", "9f8b2c1e-3d4a-4b5c-8e7f"],
    ["objeto", {}],
    ["nulo", null],
    ["indefinido", undefined],
  ])("recusa %s como não encontrado", (_label, value) => {
    // NotFoundError, e não erro de validação: um id que não é uuid não aponta
    // para nada, e o P2023 do Prisma viraria "erro inesperado" na tela.
    expect(() => parseId(value)).toThrow(NotFoundError);
  });
});

describe("parseFlag", () => {
  it("aceita booleanos", () => {
    expect(parseFlag(true)).toBe(true);
    expect(parseFlag(false)).toBe(false);
  });

  it.each([["1", 1], ['"true"', "true"], ["nulo", null]])(
    "recusa %s",
    (_label, value) => {
      expect(() => parseFlag(value)).toThrow(NotFoundError);
    },
  );
});

describe("revalidateDomain", () => {
  it("invalida exatamente os caminhos da tabela do domínio", () => {
    revalidateDomain("transactions");

    expect(revalidatePath.mock.calls).toEqual(
      REVALIDATION_TARGETS.transactions.map(([path, type]) => [path, type]),
    );
  });

  it("cobre todo domínio declarado", () => {
    for (const domain of Object.keys(REVALIDATION_TARGETS) as Array<
      keyof typeof REVALIDATION_TARGETS
    >) {
      revalidatePath.mockClear();
      revalidateDomain(domain);

      expect(revalidatePath, `domínio sem caminho: ${domain}`).toHaveBeenCalled();
    }
  });
});
