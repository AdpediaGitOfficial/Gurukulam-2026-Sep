import type { NextRequest } from "next/server";
import { listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import { collectAll, csvResponse, toCsv } from "@/server/csv";

/**
 * The register as a spreadsheet.
 *
 * Same service, same searchParams as the screen — so the file is what the
 * operator was looking at, narrowed the way they narrowed it, and scoped to
 * the cities they may see. `requireModule` is not ceremony: without it this
 * route would be an unauthenticated dump of every student.
 */
export async function GET(request: NextRequest): Promise<Response> {
  await requireModule("students");
  const params = Object.fromEntries(request.nextUrl.searchParams);
  // Pages through: an export that stops at the first page is a file
  // somebody reconciles against and finds most of the register missing from.
  const { rows } = await collectAll(listStudents, params);

  return csvResponse(
    toCsv(
      [
        { header: "Student code", value: (r) => r.studentCode },
        { header: "Name", value: (r) => [r.firstName, r.lastName].filter(Boolean).join(" ") },
        { header: "Email", value: (r) => r.email },
        { header: "Phone", value: (r) => r.phone },
        { header: "Segment", value: (r) => (r.collegeId === null ? "Retail" : "College") },
        { header: "College", value: (r) => r.collegeName },
        { header: "City", value: (r) => r.cityName },
        { header: "Batch", value: (r) => r.batchCode },
        { header: "Progress %", value: (r) => r.progressPct },
        { header: "Created by", value: (r) => r.createdByName },
        { header: "Created by type", value: (r) => r.createdByType },
        { header: "Status", value: (r) => r.accountStatus },
      ],
      rows,
    ),
    "students",
  );
}
