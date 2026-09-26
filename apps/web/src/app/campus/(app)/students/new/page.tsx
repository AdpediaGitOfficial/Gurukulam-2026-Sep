import type { Metadata } from "next";
import Link from "next/link";

import { CampusCard, CampusPage } from "@/features/campus/components/campus-page";
import { StudentForm } from "@/features/campus/components/student-form";
import { requireCollegeUser } from "@/server/principal";

export const metadata: Metadata = { title: "Add a student — Gurukulam" };

export default async function NewCampusStudentPage() {
  await requireCollegeUser();

  return (
    <CampusPage
      eyebrow="Students"
      title="Add a student"
      description="One at a time. They get their own sign-in once they are placed on a cohort."
      action={
        <Link
          href="/campus/students"
          className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Back to students
        </Link>
      }
    >
      <CampusCard>
        <StudentForm />
      </CampusCard>
    </CampusPage>
  );
}
