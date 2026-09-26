import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TeachCard, TeachPage } from "@/features/teach/components/teach-page";
import { getTrainer } from "@/features/teach/server/teach-service";
import { logout } from "@/features/auth/server/actions";
import { requireTrainer } from "@/server/principal";

export const metadata: Metadata = { title: "Account — Gurukulam" };

/**
 * Who they are, as this product holds it.
 *
 * ── Why nothing here is editable ───────────────────────────────────────
 *
 * A trainer's name is on the certificate their cohort receives, their approved
 * courses are invariant 15's enforcement point, and their engagement decides
 * whether an assignment needs their answer at all. Every one of those is an
 * operations decision with consequences the person cannot see from here. The
 * one thing that IS theirs — their diary — has its own screen, because it is
 * the one that changes what Ops may do.
 *
 * Shown locked with a reason rather than hidden, for the reason the student's
 * account screen records: a field that is absent reads as a field the product
 * forgot.
 */
export default async function TrainerAccountPage() {
  /* Guarded here as well as in the layout — see the dashboard. */
  await requireTrainer();

  const trainer = await getTrainer();

  return (
    <TeachPage eyebrow="Account" title="You" description="What the office holds about you.">
      <TeachCard title="Your record">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" value={trainer.name} hint="Printed on your cohort's certificates." />
          <Field label="Trainer ID" value={trainer.trainerCode} mono hint="Issued once, never changes." />
          <Field
            label="You sign in as"
            value={trainer.loginEmail ?? "—"}
            mono
            hint="Deliberately different from your own address."
          />
          <Field
            label="Email"
            value={trainer.email}
            hint="Where the office writes to you. Ask them to change it."
          />
          {trainer.phone === null ? null : <Field label="Phone" value={trainer.phone} />}
          <Field
            label="Engagement"
            value={trainer.engagement === "IN_HOUSE" ? "In-house" : "Freelance"}
            hint={
              trainer.engagement === "IN_HOUSE"
                ? "Batches are assigned to you directly, so there is nothing to accept."
                : "Batches are proposed to you, and yours to accept or turn down."
            }
          />
        </dl>
      </TeachCard>

      <TeachCard title="Courses you are approved for">
        {trainer.approvedCourses.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            None yet. A batch can only be proposed to you for a course you are approved on, so ask
            the office if one is missing.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {trainer.approvedCourses.map((course) => (
              <li
                key={course.courseId}
                className="rounded-chip bg-teach-soft px-3 py-1.5 text-body-sm text-on-teach"
              >
                {course.name}
              </li>
            ))}
          </ul>
        )}
      </TeachCard>

      <TeachCard title="Sign in">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/teach/account/password"
            className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Change your password
          </Link>
          <form action={logout} className="ml-auto">
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </TeachCard>
    </TeachPage>
  );
}

function Field({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-overline text-ink-subtle uppercase">{label}</dt>
      <dd
        className={
          mono ? "mt-0.5 font-mono text-body break-all text-ink" : "mt-0.5 text-body break-words text-ink"
        }
      >
        {value}
      </dd>
      {hint === undefined ? null : (
        <p className="mt-1 text-caption text-ink-subtle">{hint}</p>
      )}
    </div>
  );
}
