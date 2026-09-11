"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Secondary line under the title — the record being edited. */
  subtitle?: string;
  children: ReactNode;
  /** Action row, pinned to the bottom and always visible while the body scrolls. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Right-hand side sheet for editing a record without leaving the list.
 *
 * Built on the native `<dialog>` element, which supplies focus trapping, an
 * inert background and Escape-to-close for free. Prefer this over `Dialog` when
 * the form is long or the user benefits from keeping the list in view.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="drawer-title"
      className={cn(
        "drawer-panel m-0 ml-auto h-dvh max-h-none w-[min(450px,100vw)] max-w-none",
        "flex-col bg-surface text-ink shadow-overlay backdrop:bg-ink/40 open:flex",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-6">
        <div className="min-w-0">
          <h2 id="drawer-title" className="text-h3 text-ink">
            {title}
          </h2>
          {subtitle ? <p className="text-body text-gold">{subtitle}</p> : null}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-8">{children}</div>

      {footer ? (
        <footer className="flex items-center justify-end gap-3 border-t border-hairline bg-canvas px-6 py-6">
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}

export interface DrawerSectionProps {
  title: string;
  children: ReactNode;
}

/** Titled group of fields inside a `Drawer`. */
export function DrawerSection({ title, children }: DrawerSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-body-sm font-bold tracking-[1.6px] text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
