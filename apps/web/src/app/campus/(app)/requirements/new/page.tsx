import type { Metadata } from "next";
import Link from "next/link";

import { CampusCard, CampusPage } from "@/features/campus/components/campus-page";
import { RequirementForm } from "@/features/campus/components/requirement-form";
import { listCourses } from "@/features/campus/server/campus-service";
import { requireCollegeUser } from "@/server/principal";

export const metadata: Metadata = { title: "Raise a requirement — Gurukulam" };

/**
 * The act that starts the college flow.
 *
 * `collegeId` is never on this form. The API reads it from the principal, so a
 * college raises one for its own institution and could not name another's by
 * editing what the browser sends.
 */
export default async function NewRequirementPage() {
  await requireCollegeUser();
  const courses = await listCourses();

  return (
    <CampusPage
      eyebrow="Requirements"
      title="Ask for a cohort"
      description="Tell us what you need. We come back with dates, a trainer and a price."
      action={
        <Link
          href="/campus/requirements"
          className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Back to requirements
        </Link>
      }
    >
      <CampusCard>
        <RequirementForm courses={courses} />
      </CampusCard>
    </CampusPage>
  );
}
