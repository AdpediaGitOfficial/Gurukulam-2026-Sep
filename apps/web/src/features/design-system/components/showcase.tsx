import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface ShowcaseSectionProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function ShowcaseSection({ id, title, description, children }: ShowcaseSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex flex-col gap-4 scroll-mt-topbar">
      <div>
        <h2 id={`${id}-heading`} className="text-h2 text-ink">
          {title}
        </h2>
        <p className="text-body-sm text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export interface SpecimenProps {
  /** The class or component name a developer should copy. */
  name: string;
  usage?: string;
  children: ReactNode;
  className?: string;
}

/** One example, labelled with the exact token or component name to reuse. */
export function Specimen({ name, usage, children, className }: SpecimenProps) {
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-chip bg-surface-sunken px-2 py-1 font-mono text-caption text-ink">
          {name}
        </code>
        {usage ? <span className="text-caption text-ink-muted">{usage}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </Card>
  );
}

export interface SwatchProps {
  token: string;
  /** The Tailwind utility suffix, e.g. `brand` for `bg-brand`. */
  utility: string;
}

export function Swatch({ token, utility }: SwatchProps) {
  return (
    <div className="flex min-w-40 items-center gap-3">
      <span
        className="size-10 shrink-0 rounded-tile border border-hairline"
        style={{ backgroundColor: token }}
      />
      <span className="min-w-0">
        <span className="block font-mono text-caption text-ink">{utility}</span>
        <span className="block truncate font-mono text-caption text-ink-subtle">{token}</span>
      </span>
    </div>
  );
}

export interface SwatchGridProps {
  items: ReadonlyArray<{ token: string; utility: string }>;
}

export function SwatchGrid({ items }: SwatchGridProps) {
  return (
    <div className="flex flex-wrap gap-6">
      {items.map((item) => (
        <Swatch key={item.utility} {...item} />
      ))}
    </div>
  );
}
