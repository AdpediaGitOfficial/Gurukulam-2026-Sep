"use client";

import { useEffect } from "react";

/**
 * Everything outside the console shell — sign-in, the refresh hop, the public
 * document routes.
 *
 * Deliberately plain: it renders without the rail, without a principal and
 * without assuming anything loaded, because the failures that land here are
 * the ones where those assumptions are what broke. `(console)/error.tsx` is
 * the richer one, and it wins for every console route.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-h1 text-ink">Something went wrong</h1>
      <p className="text-body text-ink-muted">
        This page could not be loaded. It is usually momentary — try again.
      </p>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-12 cursor-pointer items-center rounded-full bg-brand px-6 text-body font-medium text-white"
        >
          Try again
        </button>
      </div>
      {error.digest === undefined ? null : (
        <p className="mt-4 text-body-sm text-ink-muted">
          Reference <span className="font-mono text-ink">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
