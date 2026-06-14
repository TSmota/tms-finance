interface SuccessActionResult {
  /** Indicates the action was successful */
  ok: true;
}

interface FailureActionResult {
  /** Indicates the action failed */
  ok: false;
  /** The error message describing why the action failed */
  error: string;
}

export type ActionResult = SuccessActionResult | FailureActionResult;