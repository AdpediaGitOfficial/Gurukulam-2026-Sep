import Image from "next/image";

import { cn } from "@/lib/cn";

const SIZES = { sm: 32, md: 40, lg: 56 } as const;

export interface AvatarProps {
  /** Omit when there is no photo — initials are drawn instead. */
  src?: string;
  /** Full name of the person — used for the alt text and the initials fallback. */
  name: string;
  size?: keyof typeof SIZES;
  /** Ring colour token, e.g. `var(--color-domain-question-bank)`. */
  ringColor?: string;
  className?: string;
}

/**
 * Two initials from a name: "Aarav Menon" → "AM", "Priya" → "P".
 *
 * First and last rather than the first two words, so a middle name does not
 * displace the surname.
 */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function Avatar({ src, name, size = "md", ringColor, className }: AvatarProps) {
  const px = SIZES[size];

  const shared = cn("shrink-0 rounded-full", ringColor && "border-2", className);
  const style = { width: px, height: px, borderColor: ringColor };

  // Most accounts here are staff records with no photo, so this is the common
  // path rather than the fallback its name suggests.
  if (src === undefined) {
    return (
      <span
        aria-label={name}
        role="img"
        style={style}
        className={cn(
          shared,
          "flex items-center justify-center bg-surface-muted font-semibold text-ink-muted select-none",
          size === "sm" ? "text-caption" : size === "lg" ? "text-h2" : "text-body-sm",
        )}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={name}
      width={px}
      height={px}
      style={style}
      className={cn(shared, "object-cover")}
    />
  );
}
