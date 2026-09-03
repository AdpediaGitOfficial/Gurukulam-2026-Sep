import type { Route } from "next";

import type { IconName } from "@/components/ui/icon";
import type { ModuleName } from "@gurukulam/contracts";

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
  { href: "/dashboard", label: "Dashboard", icon: "nav-dashboard", module: "dashboard" },
  { href: "/colleges", label: "Colleges", icon: "nav-colleges", module: "colleges" },
  { href: "/students", label: "Students", icon: "nav-students", module: "students" },
  { href: "/courses", label: "Courses", icon: "nav-courses", module: "courses" },
  { href: "/batches", label: "Batches", icon: "nav-batches", module: "batches" },
  { href: "/trainers", label: "Trainers", icon: "nav-trainers", module: "trainers" },
  { href: "/fee-ledger", label: "Fee Ledger", icon: "nav-fee-ledger", module: "feeLedger" },
  { href: "/hiring", label: "Hiring", icon: "nav-hiring", module: "hiring" },
  { href: "/reports", label: "Reports", icon: "nav-reports", module: "reports" },
];

/** Utility destinations, pinned to the bottom of the rail. */
export const secondaryNavItems: readonly NavItem[] = [
  { href: "/settings", label: "Settings", icon: "nav-settings", module: "settings" },
  // Your own profile and password. Everyone has one, so it is not gated.
  { href: "/account", label: "Account", icon: "nav-account", module: "dashboard" },
];

export interface SubNavItem {
  href: Route;
  label: string;
}

/**
 * Sub-navigation inside a module. The rail only goes one level deep, so a
 * module with more than one list needs its own tab strip.
 */
export const collegeTabs: readonly SubNavItem[] = [
  { href: "/colleges", label: "Colleges" },
  { href: "/colleges/contacts", label: "Contacts" },
  { href: "/colleges/requirements", label: "Requirements" },
  { href: "/colleges/contracts", label: "Contracts" },
];

export const studentTabs: readonly SubNavItem[] = [
  { href: "/students", label: "Students" },
  { href: "/students/certificates", label: "Certificates" },
];

export const courseTabs: readonly SubNavItem[] = [
  { href: "/courses", label: "Courses" },
  { href: "/courses/question-bank", label: "Question Bank" },
];

export const settingsTabs: readonly SubNavItem[] = [
  { href: "/settings", label: "General" },
  { href: "/settings/roles", label: "Roles" },
  { href: "/settings/administrators", label: "Administrators" },
  { href: "/settings/countries", label: "Countries" },
  { href: "/settings/cities", label: "Cities" },
];
