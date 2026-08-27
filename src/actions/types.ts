interface SuccessActionResult {
  ok: true;
}

interface FailureActionResult {
  ok: false;
  /** Mensagem em pt-BR exibida direto ao usuário. */
  error: string;
  /** O formulário deve reabrir pedindo a taxa. */
  needsManualFxRate?: boolean;
}

export type ActionResult = SuccessActionResult | FailureActionResult;
