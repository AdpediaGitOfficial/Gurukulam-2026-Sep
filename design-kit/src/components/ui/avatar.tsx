import Image from "next/image";

import { cn } from "@/lib/cn";

const SIZES = { sm: 32, md: 40, lg: 56 } as const;

export interface AvatarProps {
  src: string;
  /** Full name of the person — used for the alt text and the initials fallback. */
  name: string;
  size?: keyof typeof SIZES;
  /** Ring colour token, e.g. `var(--color-domain-question-bank)`. */
  ringColor?: string;
  className?: string;
}

export function Avatar({ src, name, size = "md", ringColor, className }: AvatarProps) {
  const px = SIZES[size];

  return (
    <Image
      src={src}
      alt={name}
      width={px}
      height={px}
      style={{ width: px, height: px, borderColor: ringColor }}
      className={cn(
        "shrink-0 rounded-full object-cover",
        ringColor && "border-2",
        className,
      )}
    />
  );
}
