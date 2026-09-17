import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Principal, ModuleName, Action } from "@gurukulam/contracts";

/** `handler(@CurrentPrincipal() principal: Principal)` */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!request.principal) {
      // Reaching here means a handler asked for the principal on a route the
      // auth guard did not cover. That is a wiring bug, not a client error.
      throw new Error(
        "No principal on the request. Add @Auth() to the route, or @Public() if it is unauthenticated.",
      );
    }
    return request.principal;
  },
);

export const IS_PUBLIC = "auth:public";
/** Opts a route out of authentication. Used sparingly — login and health. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_PERMISSION = "auth:permission";
/**
 * `@RequirePermission("students", "edit")`
 *
 * Coarse gate only: it answers "may this actor touch this module at all?".
 * WHICH records they may touch is scope, and scope is applied inside the
 * service (invariant 11) — never here, because a guard cannot see the rows.
 */
export const RequirePermission = (module: ModuleName, action: Action) =>
  SetMetadata(REQUIRED_PERMISSION, { module, action });
