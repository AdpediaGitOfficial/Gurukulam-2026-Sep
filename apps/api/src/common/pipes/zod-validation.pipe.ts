import { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { ApiException } from "../errors";

/**
 * Validates a request against a schema from `@gurukulam/contracts` and turns
 * failures into the field-keyed error shape a form can bind to directly.
 *
 * Validation lives here rather than in the console, because the console is one
 * of three consumers and the other two would otherwise be unvalidated.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      // First message per field wins — a form shows one message per input, and
      // the first is the most specific.
      const key = issue.path.length > 0 ? issue.path.join(".") : "_";
      fields[key] ??= issue.message;
    }

    throw ApiException.validation(fields);
  }
}

/** `@Body(zodBody(loginSchema)) body: LoginInput` */
export const zodBody = <T>(schema: ZodType<T>) => new ZodValidationPipe(schema);
