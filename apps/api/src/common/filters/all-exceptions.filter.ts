import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ERROR_CODES, type ApiError } from "@gurukulam/contracts";
import { ApiException } from "../errors";

/**
 * One error shape leaves this API, whatever went wrong inside it.
 *
 * Anything unrecognised becomes a generic 500 with its detail logged rather
 * than returned — a stack trace or a Prisma message in a response body tells
 * an attacker the schema.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Api");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = request.id as string | undefined;

    const { status, body } = this.describe(exception, requestId);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status !== HttpStatus.NOT_FOUND) {
      this.logger.warn(`${request.method} ${request.url} → ${status} ${body.error.code}`);
    }

    void reply.status(status).send(body);
  }

  private describe(exception: unknown, requestId?: string): { status: number; body: ApiError } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.fields ? { fields: exception.fields } : {}),
            ...(requestId ? { requestId } : {}),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          error: {
            // Clients branch on the code, so a client-side failure must not
            // arrive labelled INTERNAL — that reads as "retry later" for
            // something that will never succeed as sent.
            code: codeForStatus(status),
            message: exception.message,
            ...(requestId ? { requestId } : {}),
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ERROR_CODES.INTERNAL,
          message: "Something went wrong. The failure has been logged.",
          ...(requestId ? { requestId } : {}),
        },
      },
    };
  }
}

/**
 * Maps a framework-raised status to a stable code. Only reached for exceptions
 * this API did not raise itself — an ApiException already carries its own.
 */
function codeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ERROR_CODES.CONFLICT;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ERROR_CODES.INVARIANT_VIOLATION;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMITED;
    default:
      return ERROR_CODES.INTERNAL;
  }
}
