import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, type Observable } from "rxjs";

/**
 * Makes responses JSON-safe on the way out.
 *
 * `JSON.stringify(1n)` throws outright, so without this every money field
 * would crash its endpoint. Converting to a string rather than a number is the
 * deliberate half: `Number(bigint)` compiles, runs, and silently loses
 * precision above 2^53 — which a college contract's total in paise can reach.
 *
 * Dates go out as ISO strings so clients parse one format everywhere.
 */
@Injectable()
export class SerialiseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => serialise(value)));
  }
}

export function serialise(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);

  if (typeof value === "object") {
    // Anything with a custom prototype (a Buffer, a stream, a class instance
    // the handler meant to return as-is) is left alone.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = serialise(item);
    return out;
  }

  return value;
}
