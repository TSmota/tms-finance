/**
 * Erros de domínio.
 *
 * Os serviços em `src/lib/` lançam estes erros; as server actions em
 * `src/actions/` os capturam e traduzem para `ActionResult`. Assim o serviço
 * não precisa carregar o formato de resposta da UI, e os testes de integração
 * podem afirmar sobre o tipo do erro em vez de comparar strings.
 *
 * A `message` é escrita em pt-BR porque chega ao usuário como está.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Recurso inexistente, ou existente mas de outro usuário — indistinguíveis de fora, de propósito. */
export class NotFoundError extends DomainError {}

/** Estado inválido que o Zod não cobre porque depende do banco. */
export class InvalidOperationError extends DomainError {}

/**
 * Escrita que mexeria no total de uma fatura já paga.
 *
 * Subclasse porque para a UI é uma recusa de domínio como outra qualquer. O
 * tipo próprio existe para a materialização de recorrentes, que roda dentro da
 * renderização e precisa pular em vez de derrubar a página.
 */
export class PaidInvoiceError extends InvalidOperationError {}
