/**
 * What every server action returns.
 *
 * `fields` is keyed by the form's own input names, which are the API's field
 * paths — so an action can hand the API's `fields` straight back and the form
 * binds each message to the right input with nothing in between.
 */
export interface FormState {
  status: "idle" | "error";
  /** Shown above the form: what went wrong overall. */
  message?: string;
  /** Shown under an input: what is wrong with that value. */
  fields?: Record<string, string>;
}

export const IDLE: FormState = { status: "idle" };

export function formError(message: string, fields?: Record<string, string>): FormState {
  return fields === undefined ? { status: "error", message } : { status: "error", message, fields };
}
