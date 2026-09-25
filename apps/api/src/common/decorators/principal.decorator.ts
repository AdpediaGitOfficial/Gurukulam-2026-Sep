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

export const REQUIRED_ACTOR = "auth:actor";
/**
 * `@RequireActor("STUDENT")`
 *
 * ── Why a permission cannot express this ────────────────────────────────
 *
 * A student principal carries `permissions: {}` — deliberately. They are kept
 * out of the admin surface by having no permissions at all rather than by
 * being scoped to themselves, which fails closed and is the right default.
 *
 * It also means `@RequirePermission` can never admit them: there is no module
 * and action they hold. And a route with NO gate at all is worse — it is
 * authenticated but open to every actor, so an admin token would reach a
 * handler that assumes `principal.id` is a student id and quietly answer with
 * whatever a student-shaped query returns for an administrator's uuid.
 *
 * So `/me/*` gates on WHO IS ASKING rather than on what they may do. It is the
 * one place in the product where that is the right question, and it is
 * declared on the route rather than inferred inside the service, because a
 * check you can see in the controller is a check somebody can audit.
 */
export const RequireActor = (...actors: Principal["actor"][]) =>
  SetMetadata(REQUIRED_ACTOR, actors);
