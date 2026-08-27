import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const findUnique = vi.fn();
const redirect = vi.fn((path: string): never => {
  // O `redirect()` do Next não retorna: quem chama conta com isso para não
  // seguir com um id que não existe.
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("@/auth", () => ({ auth: () => auth() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: (args: unknown) => findUnique(args) } } }));

const { requireUser } = await import("./session");

/**
 * O JWT é auto-contido e sobrevive ao dado que ele nomeia.
 *
 * Duas guardas dependem disso e nenhuma era exercitada: o `UUID_PATTERN`, que
 * impede um `sub` forjado de virar `P2023` no Prisma, e a releitura no banco,
 * que derruba a sessão órfã antes de ela ler listas vazias e quebrar toda
 * escrita com violação de chave estrangeira.
 */

const USER = {
  id: "9f8b2c1e-3d4a-4b5c-8e7f-0a1b2c3d4e5f",
  name: "Thiago",
  email: "t@test.local",
  image: null,
  baseCurrency: "BRL",
};

beforeEach(() => {
  auth.mockReset();
  findUnique.mockReset();
  redirect.mockClear();
});

describe("requireUser", () => {
  it("devolve o usuário quando o token e a linha existem", async () => {
    auth.mockResolvedValue({ user: { id: USER.id } });
    findUnique.mockResolvedValue(USER);

    await expect(requireUser()).resolves.toEqual(USER);
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["sessão ausente", null],
    ["sessão sem usuário", {}],
    ["usuário sem id", { user: {} }],
  ])("manda para /login com %s", async (_label, session) => {
    auth.mockResolvedValue(session);

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
    // Sem id válido, nem chega a consultar.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["id numérico", "42"],
    ["uuid truncado", "9f8b2c1e-3d4a-4b5c-8e7f"],
    ["injeção de SQL", "' OR 1=1 --"],
    ["uuid com sufixo", `${USER.id}x`],
  ])("recusa %s antes de tocar o banco", async (_label, id) => {
    auth.mockResolvedValue({ user: { id } });

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("manda para /login quando o token aponta para um usuário apagado", async () => {
    auth.mockResolvedValue({ user: { id: USER.id } });
    findUnique.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("nunca seleciona a credencial", async () => {
    auth.mockResolvedValue({ user: { id: USER.id } });
    findUnique.mockResolvedValue(USER);

    await requireUser();

    const select = findUnique.mock.calls[0]?.[0] as { select: Record<string, boolean> };

    expect(Object.keys(select.select)).not.toContain("passwordHash");
  });
});
