/**
 * IDs de usuário são UUID. A versão anterior do schema usava `cuid`, e um JWT
 * assinado com o mesmo `AUTH_SECRET` continua válido depois da migração —
 * carregando um id em formato antigo. Consultar o Postgres com ele levantaria
 * `invalid input syntax for type uuid` em vez de simplesmente não encontrar.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
