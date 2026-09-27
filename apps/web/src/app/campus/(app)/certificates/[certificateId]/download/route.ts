import { NextResponse } from "next/server";

import { apiFetch, ApiRequestError } from "@/server/api";

/**
 * The college's download, asked of the access rule every time.
 *
 * ── Why this is a route handler and not a link to `pdfUrl` ──────────────
 *
 * The certificate list carries `pdfUrl`, and linking straight to it would work.
 * It would also be a SECOND implementation of invariant 7's access asymmetry:
 * the list is scoped by college, `certificateAccess` decides by college, and the
 * two agree today. Two things that agree today are how the admin download comes
 * to refuse a college student while the portal quietly hands them a link.
 *
 * So every click goes through `GET /certificates/:id/download`, where
 * `certificateAccess` is asked — as a function, once, for all four actors — and
 * the answer is the college's to receive because the FILE is the institution's
 * even though the record is the student's.
 *
 * ── Why a redirect rather than a proxy ─────────────────────────────────
 *
 * The API returns a URL, which will be a signed S3 link when the storage
 * integration lands. Streaming it through here would mean holding a PDF in
 * memory for no benefit. Until then `url` is null, and this says so in a
 * sentence rather than sending the browser to `/null`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certificateId: string }> },
): Promise<NextResponse> {
  const { certificateId } = await params;

  try {
    const file = await apiFetch<{ url: string | null; certificateNumber: string }>(
      `/certificates/${encodeURIComponent(certificateId)}/download`,
    );
    if (file.url === null) {
      // No file yet is not a failure of theirs, so it is not an error page: the
      // certificate exists, the number is real, and the office can send the
      // printed copy.
      return NextResponse.redirect(
        new URL(
          `/campus/certificates?pending=${encodeURIComponent(file.certificateNumber)}`,
          _request.url,
        ),
      );
    }
    return NextResponse.redirect(file.url);
  } catch (error) {
    // The API's own sentence, carried through: a revoked certificate and one
    // belonging to another college are different facts and it states each.
    const message =
      error instanceof ApiRequestError ? error.message : "That certificate could not be fetched.";
    return NextResponse.redirect(
      new URL(`/campus/certificates?refused=${encodeURIComponent(message)}`, _request.url),
    );
  }
}
