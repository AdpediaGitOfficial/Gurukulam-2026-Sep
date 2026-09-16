"use client";

import { Button } from "@/components/ui/button";

/**
 * The only interactive thing on a receipt, so the only client component in it.
 *
 * Printing is the browser's job. The print dialogue already offers "Save as
 * PDF", which is the file the operator actually wants to attach to an email —
 * so a server-side PDF library would buy a dependency and a font problem in
 * exchange for the same document.
 */
export function PrintButton() {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
