/**
 * `@/lib/db` no project `unit` aponta para cá.
 *
 * A separação entre os dois níveis vivia só no glob do `include` e na ausência
 * de `DATABASE_URL` no ambiente do project unitário — e essa ausência não é
 * garantida: `src/lib/db.ts` lê a variável no momento do import, então um shell
 * que a tenha exportada faria um teste colocalizado conectar no banco de
 * desenvolvimento, em silêncio.
 *
 * Com este stub a regra do ARCHITECTURE.md — "módulo puro → teste unitário" —
 * passa a falhar alto, e a mensagem diz para onde mover o teste.
 */
function recusa(): never {
  throw new Error(
    "Teste unitário alcançou @/lib/db. Módulo que fala com o banco é testado em " +
      "tests/integration/, contra o Postgres de teste — ver ARCHITECTURE.md, seção Testes.",
  );
}

export const prisma: unknown = new Proxy(
  {},
  {
    get: recusa,
    has: recusa,
    set: recusa,
  },
);
