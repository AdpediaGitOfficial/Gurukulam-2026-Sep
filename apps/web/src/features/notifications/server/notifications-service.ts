import "server-only";
import {
  bellSchema, notificationSchema, type Bell, type Notification, type Page,
} from "@gurukulam/contracts";
import { apiFetch } from "@/server/api";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const NOTIFICATION_FILTERS = [...PAGE_KEYS, "class", "status"] as const;

export async function listNotifications(params: SearchParams): Promise<Page<Notification>> {
  return fetchPage("/notifications", notificationSchema, params, NOTIFICATION_FILTERS);
}

/**
 * What the bell shows.
 *
 * `badge` counts only what badges — action required and alerts. FYI never
 * contributes, because a badge that cannot reach zero trains people to stop
 * reading it.
 */
export async function getBell(): Promise<Bell> {
  return bellSchema.parse(await apiFetch("/notifications/bell"));
}
