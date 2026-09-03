import { HttpException, HttpStatus } from "@nestjs/common";
import { ERROR_CODES, type ErrorCode } from "@gurukulam/contracts";

/**
 * Every failure the API raises deliberately. One class, so the filter has one
 * thing to recognise and the response shape cannot drift between modules.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly fields?: Record<string, string>,
  ) {
    super(message, status);
  }

  static validation(fields: Record<string, string>, message = "Check the highlighted fields") {
    return new ApiException(ERROR_CODES.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST, fields);
  }

  static unauthenticated(message = "Sign in to continue") {
    return new ApiException(ERROR_CODES.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }

  static invalidCredentials() {
    // Deliberately identical whether the address is unknown or the password is
    // wrong — a distinct message turns the login form into an account
    // enumeration oracle.
    return new ApiException(
      ERROR_CODES.INVALID_CREDENTIALS,
      "That email and password do not match",
      HttpStatus.UNAUTHORIZED,
    );
  }

  static accountLocked(retryAfterSeconds: number) {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return new ApiException(
      ERROR_CODES.ACCOUNT_LOCKED,
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  static accountInactive() {
    return new ApiException(
      ERROR_CODES.ACCOUNT_INACTIVE,
      "This account is not active. Contact an administrator.",
      HttpStatus.FORBIDDEN,
    );
  }

  static tokenExpired() {
    return new ApiException(ERROR_CODES.TOKEN_EXPIRED, "Your session has expired", HttpStatus.UNAUTHORIZED);
  }

  static tokenReused() {
    return new ApiException(
      ERROR_CODES.TOKEN_REUSED,
      "This session was ended for security reasons. Sign in again.",
      HttpStatus.UNAUTHORIZED,
    );
  }

  static forbidden(message = "You do not have permission to do that") {
    return new ApiException(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  /**
   * Distinct from `forbidden`: the caller has the permission but the record is
   * outside their city or college scope. Returned as 404 rather than 403 so a
   * scoped operator cannot probe for the existence of records in another
   * region.
   */
  static outOfScope() {
    return new ApiException(ERROR_CODES.NOT_FOUND, "Not found", HttpStatus.NOT_FOUND);
  }

  static notFound(what = "Record") {
    return new ApiException(ERROR_CODES.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string, fields?: Record<string, string>) {
    return new ApiException(ERROR_CODES.CONFLICT, message, HttpStatus.CONFLICT, fields);
  }

  /** A business rule from architecture.md §4 was violated. */
  static invariant(message: string) {
    return new ApiException(ERROR_CODES.INVARIANT_VIOLATION, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
