import type { Route } from "next";

import type { IconName } from "@/components/ui/icon";
import type { ModuleName } from "@gurukulam/contracts";

export interface SubNavItem {
  href: Route;
  label: string;
  /**
   * False while the route does not exist yet.
   *
   * The list stays complete because it documents the module's shape, but an
   * entry with nowhere to go renders as text rather than as a link — a nav that
   * advertises a 404 is worse than one that admits the page is not built, and
   * Next would prefetch it on hover either way.
   */
  built?: boolean;
}

export interface NavItem {
  href: Route;
  /** Accessible name — surfaced as the tooltip and the screen-reader label. */
  label: string;
  icon: IconName;
  /**
   * The permission module this entry opens. The rail renders only what the
   * principal can read, so a regional sub-admin without Hiring never sees the
   * entry rather than seeing it and being refused at the route.
   */
  module: ModuleName;
  /** Route prefix that marks this entry active. Defaults to `href`. */
  match?: string;
  /**
   * Pages inside the module. The rail only goes one level deep; collapsed it
   * shows the count in the tooltip, expanded it discloses them, and the page
   * carries the same list as its own tab strip.
   */
  children?: readonly SubNavItem[];
}

/**
 * The nine primary modules, ordered as the delivery chain rather than
 * alphabetically: a course holds topics, a batch runs them as sessions, a
 * trainer delivers them, and money and hiring follow.
 *
 * Sessions live under Batches and assignments under a session, because
 * `Course › Batch › Session › Assignment` is a containment hierarchy, not four
 * peer modules. A tenth module needs a grouping answer, not a new slot —
 * localisation sits under Settings because it is set-up-once configuration,
 * certificates under Students because a certificate is a student outcome, and
 * the question bank under Courses because assessment belongs to a course.
 */
export const primaryNavItems: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dash", module: "dashboard" },
  {
    href: "/colleges",
    label: "Colleges",
    icon: "college",
    module: "colleges",
    children: [
      { href: "/colleges", label: "All colleges" },
      { href: "/colleges/contacts", label: "Contacts" , built: false },
      { href: "/colleges/requirements", label: "Requirements" },
      { href: "/colleges/access", label: "Portal access" , built: false },
    ],
  },
  {
    href: "/students",
    label: "Students",
    icon: "users",
    module: "students",
    children: [
      { href: "/students", label: "All students" },
      { href: "/students/unallocated", label: "Unallocated" },
      { href: "/students/certificates", label: "Certificates" },
    ],
  },
  {
    href: "/courses",
    label: "Courses",
    icon: "book",
    module: "courses",
    children: [
      { href: "/courses", label: "All courses" },
      { href: "/courses/question-bank", label: "Question bank" },
    ],
  },
  {
    href: "/batches",
    label: "Batches",
    icon: "batch",
    module: "batches",
    children: [
      { href: "/batches", label: "All batches" },
      { href: "/batches/sessions", label: "Sessions" },
    ],
  },
  {
    href: "/trainers",
    label: "Trainers",
    icon: "trainer",
    module: "trainers",
    children: [
      { href: "/trainers", label: "All trainers" },
      { href: "/trainers/calendar", label: "Availability" , built: false },
    ],
  },
  {
    href: "/fee-ledger",
    label: "Fee Ledger",
    icon: "rupee",
    module: "feeLedger",
    children: [
      { href: "/fee-ledger", label: "All students" },
      { href: "/fee-ledger/contracts", label: "Institutional contracts" },
    ],
  },
  { href: "/hiring", label: "Hiring", icon: "brief", module: "hiring" },
  {
    href: "/reports",
    label: "Reports",
    icon: "chart",
    module: "reports",
    children: [
      { href: "/reports", label: "Library" },
      { href: "/reports/outstanding", label: "Outstanding & ageing" },
      { href: "/reports/collections", label: "Collection register" },
      { href: "/reports/unallocated", label: "Unallocated ageing" },
      { href: "/reports/batch-progress", label: "Batch progress" },
    ],
  },
];

/** Utility destinations, pinned to the bottom of the rail. */
export const secondaryNavItems: readonly NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    icon: "gear",
    module: "settings",
    children: [
      { href: "/settings", label: "General" },
      { href: "/settings/roles", label: "Roles" },
      { href: "/settings/administrators", label: "Administrators" },
      { href: "/settings/countries", label: "Countries" },
      { href: "/settings/cities", label: "Cities" },
    ],
  },
  // Your own profile and password. Everyone has one, so it is not gated.
  { href: "/account", label: "Account", icon: "acct", module: "dashboard" },
];

export const navItems: readonly NavItem[] = [...primaryNavItems, ...secondaryNavItems];

/**
 * Which nav entry owns a path.
 *
 * Longest prefix wins, so `/students/certificates` resolves to Students rather
 * than to whichever entry happens to be listed first.
 */
export function navItemFor(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of navItems) {
    const prefix = item.match ?? item.href;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (best === undefined || prefix.length > (best.match ?? best.href).length) best = item;
    }
  }
  return best;
}

/** Whether a sub-nav entry is the current page. */
export function isCurrentPage(pathname: string, href: string): boolean {
  return pathname === href;
}

/**
 * Console routes that actually exist.
 *
 * Derived from the nav rather than kept as a second list, so a page added to
 * one is added to both. Routes outside the rail — the notification queue, the
 * signed-out screens — are named here because nothing else declares them.
 */
const BUILT_ROUTES: ReadonlySet<string> = new Set<string>([
  ...navItems.map((item) => item.href as string),
  ...navItems.flatMap((item) =>
    (item.children ?? []).filter((c) => c.built !== false).map((c) => c.href as string),
  ),
  "/notifications",
]);

/**
 * Whether the console can actually serve this path.
 *
 * A destination that comes from data — a notification's call to action, a
 * report's path — names where it *should* go, which is not the same as where
 * the console can go today. Rendering it as a link anyway produces a 404 that
 * looks like a bug in the notification rather than a screen not yet built.
 */
export function isBuiltRoute(path: string): boolean {
  const [pathname] = path.split("?");
  return pathname !== undefined && BUILT_ROUTES.has(pathname);
}
