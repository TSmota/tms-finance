interface SuccessActionResult {
  /** A ação foi concluída. */
  ok: true;
}

interface FailureActionResult {
  /** A ação falhou. */
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
