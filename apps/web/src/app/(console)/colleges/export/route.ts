import type { NextRequest } from "next/server";
import { PARTNERSHIP_LABELS } from "@gurukulam/contracts";

import { listColleges } from "@/features/colleges/server/colleges-service";
import { requireModule } from "@/server/principal";
import { collectAll, csvResponse, toCsv } from "@/server/csv";

export async function GET(request: NextRequest): Promise<Response> {
  await requireModule("colleges");
  const params = Object.fromEntries(request.nextUrl.searchParams);
  // Pages through: an export that stops at the first page is a file
  // somebody reconciles against and finds most of the register missing from.
  const { rows } = await collectAll(listColleges, params);

  return csvResponse(
    toCsv(
      [
        { header: "College code", value: (r) => r.collegeCode },
        { header: "Name", value: (r) => r.name },
        { header: "Short name", value: (r) => r.shortName },
        { header: "City", value: (r) => r.cityName },
        { header: "Partnership", value: (r) => PARTNERSHIP_LABELS[r.partnershipType] },
        { header: "Disciplines", value: (r) => r.disciplines.join("; ") },
        { header: "Contacts", value: (r) => r.pocCount },
        { header: "Students", value: (r) => r.studentCount },
        { header: "Trainings", value: (r) => r.batchCount },
        { header: "Open requirements", value: (r) => r.openRequirementCount },
        { header: "Portal", value: (r) => r.portalAccessStatus ?? "No account" },
        { header: "Active", value: (r) => (r.isActive ? "Yes" : "No") },
      ],
      rows,
    ),
    "colleges",
  );
}
