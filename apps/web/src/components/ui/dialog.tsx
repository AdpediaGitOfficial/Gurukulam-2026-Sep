"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action row; typically a cancel + confirm pair. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal built on the native `<dialog>` element, which gives focus trapping,
 * inert background and Escape handling without a dependency.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
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
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card bg-surface p-6 text-ink shadow-overlay backdrop:bg-ink/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="dialog-title" className="text-h2 text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1 text-body-sm text-ink-muted">{description}</p> : null}
        </div>
        <Button variant="ghost" size="sm" aria-label="Close dialog" onClick={onClose}>
          Close
        </Button>
      </div>

      {children ? <div className="mt-6">{children}</div> : null}
      {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
    </dialog>
  );
}
