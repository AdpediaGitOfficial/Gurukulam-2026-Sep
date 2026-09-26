import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import {
  markReadSchema, notificationQuerySchema,
  type MarkReadInput, type NotificationQuery, type Principal,
} from "@gurukulam/contracts";
import { NotificationsService } from "./notifications.service";
import { NOTIFICATION_CATALOGUE } from "./catalogue";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, RequirePermission } from "../../common/decorators/principal.decorator";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** What the bell renders — counts plus the top of the queue. */
  @Get("bell")
  @RequirePermission("notifications", "read")
  bell(@CurrentPrincipal() p: Principal) {
    return this.notifications.bell(p);
  }

  /** The catalogue, so the set of types is inspectable rather than implied. */
  @Get("catalogue")
  @RequirePermission("notifications", "read")
  catalogue() {
    return {
      total: NOTIFICATION_CATALOGUE.length,
      live: NOTIFICATION_CATALOGUE.filter((n) => n.status === "LIVE").length,
      types: NOTIFICATION_CATALOGUE,
    };
  }

  @Get()
  @RequirePermission("notifications", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(notificationQuerySchema)) q: NotificationQuery) {
    return this.notifications.list(p, q);
  }

  /**
   * Marks FYI and ALERT rows read. Action-required rows are deliberately
   * unaffected — those clear when their condition does, not when someone
   * looks at them.
   */
  @Post("read")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("notifications", "edit")
  markRead(@CurrentPrincipal() p: Principal, @Body(zodBody(markReadSchema)) body: MarkReadInput) {
    return this.notifications.markRead(p, body);
  }
}
