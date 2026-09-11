import "server-only";
import { certificateSchema, type Certificate, type Page } from "@gurukulam/contracts";
import { fetchPage, PAGE_KEYS, type SearchParams } from "@/server/list";

export const CERTIFICATE_FILTERS = [
  ...PAGE_KEYS, "studentId", "batchId", "courseId", "collegeId", "status", "segment",
] as const;

/**
 * Issued on completion in both segments; who may download differs.
 * A retail student downloads their own; for a college student the institution
 * does (invariant 7). The admin sees both.
 */
export async function listCertificates(params: SearchParams): Promise<Page<Certificate>> {
  return fetchPage("/certificates", certificateSchema, params, CERTIFICATE_FILTERS);
}
