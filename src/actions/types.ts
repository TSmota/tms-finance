interface SuccessActionResult {
  ok: true;
}

interface FailureActionResult {
  ok: false;
  /** Mensagem em pt-BR exibida direto ao usuário. */
  error: string;
  /**
   * Verdadeiro quando o câmbio está indisponível e o formulário deve pedir a
   * taxa manualmente.
   */
  needsManualFxRate?: boolean;
}

export type ActionResult = SuccessActionResult | FailureActionResult;
