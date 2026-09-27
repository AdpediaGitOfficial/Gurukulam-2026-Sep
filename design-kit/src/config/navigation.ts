import type { Route } from "next";

import type { IconName } from "@/components/ui/icon";

export interface NavItem {
  href: Route;
  /** Accessible name — surfaced as the tooltip and the screen-reader label. */
  label: string;
  icon: IconName;
}

/** Primary modules, rendered in the middle of the navigation rail. */
export const primaryNavItems: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: "nav-dashboard" },
  { href: "/question-bank", label: "Question Bank", icon: "nav-question-bank" },
  { href: "/courses", label: "Courses & Batches", icon: "nav-courses" },
  { href: "/colleges", label: "Colleges", icon: "nav-colleges" },
  { href: "/trainers", label: "Trainers", icon: "nav-trainers" },
  { href: "/students", label: "Students", icon: "nav-students" },
  { href: "/localisation", label: "Localisation", icon: "nav-localisation" },
];

/**
 * Sub-navigation within the Localisation module. The rail only goes one level
 * deep, so a module with more than one master list needs its own tab strip.
 */
export const localisationTabs = [
  { href: "/localisation/countries" as Route, label: "Countries" },
  { href: "/localisation/cities" as Route, label: "Cities" },
];

/** Utility destinations, pinned to the bottom of the rail. */
export const secondaryNavItems: readonly NavItem[] = [
  { href: "/settings", label: "Settings", icon: "nav-settings" },
  { href: "/account", label: "Account", icon: "nav-account" },
];
