import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CampusCard, CampusPage, CampusStat } from "@/features/campus/components/campus-page";
import { StudentRow } from "@/features/campus/components/student-row";
import { listBatches, listStudents } from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";

export const metadata: Metadata = { title: "Students — Gurukulam" };

/**
 * The college's own intake.
 *
 * ── Why this is the admin endpoint and not a portal copy ───────────────
 *
 * `/students` with `collegeScope` applied inside the service. Driving it as a
 * real college user returned 51 of 51 theirs, and a parallel
 * `/me/college/students` would be a second copy of a filter that already works —
 * the copy being the one that drifts.
 *
 * ── Why unplaced students lead ─────────────────────────────────────────
 *
 * It is the one thing on this screen that is the college's to act on. A student
 * they added and never put on a cohort is enrolled with nobody, and nothing else
 * in the product will chase it for them.
 */
export default async function CampusStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCollegeUser();
  const query = await searchParams;
  const search = typeof query["q"] === "string" ? query["q"] : undefined;

  const [students, batches] = await Promise.all([listStudents(search), listBatches()]);
  const unplaced = students.rows.filter((student) => !student.batchId);
  // Only cohorts that can still take somebody. A finished batch in the picker is
  // an allocation the API would refuse.
  const open = batches.filter((batch) => batch.status === "SCHEDULED" || batch.status === "IN_PROGRESS");

  return (
    <CampusPage
      eyebrow="Students"
      title="Your students"
      description="Everyone you have sent to us, and which cohort they sit on."
      action={
        <Link href="/campus/students/new" className={buttonVariants({ size: "md" })}>
          Add a student
        </Link>
      }
    >
      {query["added"] === "1" ? (
        <Alert intent="success" title="Student added">
          Place them on a cohort when you are ready — they can sign in once they are on one.
        </Alert>
      ) : query["allocated"] === "1" ? (
        <Alert intent="success" title="Placed on the cohort">
          Their sign-in details go out with the welcome pack, and the cohort's sessions are now
          theirs.
        </Alert>
      ) : null}

      <CampusCard>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <CampusStat label="On our books" value={students.total} />
          <CampusStat
            label="Not placed"
            value={unplaced.length}
            intent={unplaced.length > 0 ? "danger" : "neutral"}
            caption="Yours to place"
          />
          <CampusStat label="Cohorts open" value={open.length} href="/campus/schedule" />
        </div>
      </CampusCard>

      {students.rows.length === 0 ? (
        <CampusCard>
          <EmptyState
            title="No students yet"
            description="Add the students you want trained. Each one gets their own sign-in once they are placed on a cohort."
            action={
              <Link href="/campus/students/new" className={buttonVariants({ variant: "secondary" })}>
                Add a student
              </Link>
            }
          />
        </CampusCard>
      ) : (
        <>
          {unplaced.length === 0 ? null : (
            <CampusCard title="Waiting to be placed">
              <ul className="flex flex-col">
                {unplaced.map((student) => (
                  <StudentRow key={student.studentId} student={student} batches={open} />
                ))}
              </ul>
            </CampusCard>
          )}

          <CampusCard title={unplaced.length === 0 ? "Your students" : "Everyone"}>
            <ul className="flex flex-col">
              {students.rows.map((student) => (
                <StudentRow key={student.studentId} student={student} batches={open} />
              ))}
            </ul>
          </CampusCard>
        </>
      )}
    </CampusPage>
  );
}
