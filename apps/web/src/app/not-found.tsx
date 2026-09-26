import Link from "next/link";

/**
 * A URL that matches no route at all — distinct from `(console)/not-found.tsx`,
 * which is a real screen reporting that a real record is gone.
 */
export default function RootNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
      <p className="text-overline uppercase text-ink-muted">404</p>
      <h1 className="text-h1 text-ink">There is no page here</h1>
      <p className="text-body text-ink-muted">
        The address does not match anything in the console.
      </p>
      <div className="mt-2 flex justify-center">
        <Link
          href="/dashboard"
          className="inline-flex h-12 items-center rounded-full bg-surface-muted px-6 text-body font-medium text-ink"
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
