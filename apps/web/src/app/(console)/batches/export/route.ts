import type { NextRequest } from "next/server";

import { listBatches } from "@/features/batches/server/batches-service";
import { requireModule } from "@/server/principal";
import { collectAll, csvResponse, toCsv } from "@/server/csv";

export async function GET(request: NextRequest): Promise<Response> {
  await requireModule("batches");
  const params = Object.fromEntries(request.nextUrl.searchParams);
  // Pages through: an export that stops at the first page is a file
  // somebody reconciles against and finds most of the register missing from.
  const { rows } = await collectAll(listBatches, params);

  return csvResponse(
    toCsv(
      [
        { header: "Batch code", value: (r) => r.batchCode },
        { header: "Name", value: (r) => r.name },
        { header: "Course", value: (r) => r.courseName },
        { header: "Trainer", value: (r) => r.primaryTrainerName },
        { header: "City", value: (r) => r.cityName },
        { header: "Mode", value: (r) => r.mode },
        // A batch with a college is dedicated to it; without one it is retail.
        { header: "Segment", value: (r) => (r.collegeId === null ? "Retail" : "College") },
        { header: "College", value: (r) => r.collegeName },
        { header: "Students", value: (r) => r.enrolledCount },
        { header: "Sessions", value: (r) => r.sessionCount },
        { header: "Sessions delivered", value: (r) => r.completedSessionCount },
        { header: "Starts", value: (r) => r.startDate },
        { header: "Status", value: (r) => r.status },
      ],
      rows,
    ),
    "batches",
  );
}
