import type { Metadata } from "next";
import type { BatchSession } from "@gurukulam/contracts";

import { PageBody, PageSection } from "@/components/patterns/page-section";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { BatchHeader } from "@/features/batches/components/batch-header";
import { getBatch, listSessions } from "@/features/batches/server/batches-service";
import { listStudents } from "@/features/students/server/students-service";
import { requireModule } from "@/server/principal";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Batch recordings" };

const COLUMNS: Column<BatchSession>[] = [
  {
    id: "session",
    header: "Session",
    cell: (row) => (
      <div className="flex flex-col">
        <span className="text-body font-semibold text-ink">{row.title}</span>
        <span className="font-mono text-caption text-ink-subtle">{row.sessionCode}</span>
      </div>
    ),
  },
  {
    id: "topic",
    header: "Topic",
    cell: (row) => row.topicTitle ?? <span className="text-ink-subtle">—</span>,
  },
  { id: "date", header: "Delivered", cell: (row) => row.scheduledDate },
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) => row.trainerName ?? <span className="text-ink-subtle">—</span>,
  },
  {
    id: "recording",
    header: "Recording",
    cell: (row) =>
      row.hasRecording === true ? (
        <StatusPill intent="success">Linked</StatusPill>
      ) : (
        <StatusPill intent="warning">Missing</StatusPill>
      ),
  },
];

export default async function BatchRecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("batches");
  const { id } = await params;
  const batch = await getBatch(id);

  const [sessions, students] = await Promise.all([
    listSessions({ batchId: id, pageSize: "200", sort: "scheduledDate", order: "asc" }),
    listStudents({ batchId: id, pageSize: "1" }),
  ]);

  /*
   * Only delivered sessions are listed.
   *
   * A recording is the artefact of a session that happened, so a scheduled
   * session without one is not a gap — counting it as missing would make the
   * number grow every time the schedule did.
   */
  const delivered = sessions.rows.filter((row) => row.status === "COMPLETED");
  const linked = delivered.filter((row) => row.hasRecording === true).length;
  const missing = delivered.length - linked;

  return (
    <PageBody>
      <BatchHeader
        batch={batch}
        counts={{ sessions: sessions.total, students: students.total, recordings: linked }}
      />

      {missing > 0 ? (
        <Alert intent="warning" title={`${missing} delivered session(s) have no recording`}>
          A student who missed one has nothing to catch up on. Recordings are linked from the
          session itself, once it is marked complete.
        </Alert>
      ) : null}

      <PageSection
        title="Recordings"
        description="One per delivered session. A session is only listed here once it has been marked complete — a scheduled session has nothing to record yet."
      >
        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={COLUMNS}
            rows={delivered}
            getRowId={(row) => row.sessionId}
            caption="Delivered sessions and whether each has a recording"
            minWidth="1000px"
            empty={
              <EmptyState
                title="Nothing delivered yet"
                description={
                  sessions.total === 0
                    ? "This batch has no sessions scheduled."
                    : `None of this batch's ${formatCount(sessions.total)} sessions have been marked complete.`
                }
              />
            }
          />
        </Card>
      </PageSection>
    </PageBody>
  );
}
