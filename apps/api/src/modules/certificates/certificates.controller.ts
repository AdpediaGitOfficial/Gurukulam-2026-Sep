import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  certificateQuerySchema, createSubmissionSchema, decideRowSchema, issueCertificateSchema,
  revokeCertificateSchema, submissionQuerySchema,
  type CertificateQuery, type CreateSubmissionInput, type DecideRowInput,
  type IssueCertificateInput, type Principal, type RevokeCertificateInput, type SubmissionQuery,
} from "@gurukulam/contracts";
import { CertificatesService } from "./certificates.service";
import { SubmissionsService } from "./submissions.service";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { CurrentPrincipal, Public, RequirePermission } from "../../common/decorators/principal.decorator";

const eligibilityQuery = z.object({
  studentId: z.string().min(1),
  batchId: z.string().min(1),
});
const collegeSubmission = createSubmissionSchema.extend({ collegeId: z.string().optional() });

@Controller("certificates")
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly submissions: SubmissionsService,
  ) {}

  /**
   * The public verifier. Unauthenticated by design — anyone holding a
   * certificate must be able to check it, and a revocation is visible the
   * moment it happens because this reads the row.
   */
  @Public()
  @Get("verify/:code")
  verify(@Param("code") code: string) {
    return this.certificates.verify(code);
  }

  /** Static segments before ":id". */
  @Get("eligibility")
  @RequirePermission("certificates", "read")
  eligibility(@CurrentPrincipal() p: Principal, @Query(zodBody(eligibilityQuery)) q: { studentId: string; batchId: string }) {
    return this.certificates.checkEligibility(p, q.studentId, q.batchId);
  }

  @Get("submissions")
  @RequirePermission("certificates", "read")
  listSubmissions(@CurrentPrincipal() p: Principal, @Query(zodBody(submissionQuerySchema)) q: SubmissionQuery) {
    return this.submissions.list(p, q);
  }

  /** A college uploads its list of names. An admin may do it on their behalf. */
  @Post("submissions")
  @RequirePermission("certificates", "edit")
  createSubmission(@CurrentPrincipal() p: Principal, @Body(zodBody(collegeSubmission)) body: CreateSubmissionInput & { collegeId?: string }) {
    return this.submissions.create(p, body, body.collegeId);
  }

  /** The review table — every row carries its eligibility. */
  @Get("submissions/:submissionId")
  @RequirePermission("certificates", "read")
  getSubmission(@CurrentPrincipal() p: Principal, @Param("submissionId") id: string) {
    return this.submissions.get(p, id);
  }

  /** One decision, on one uploaded name. */
  @Post("submissions/rows/:rowId/decide")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("certificates", "edit")
  decideRow(@CurrentPrincipal() p: Principal, @Param("rowId") id: string, @Body(zodBody(decideRowSchema)) body: DecideRowInput) {
    return this.submissions.decideRow(p, id, body);
  }

  /** Approved rows become certificates here, and only here (invariant 18). */
  @Post("submissions/:submissionId/release")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("certificates", "edit")
  release(@CurrentPrincipal() p: Principal, @Param("submissionId") id: string) {
    return this.submissions.release(p, id);
  }

  @Get()
  @RequirePermission("certificates", "read")
  list(@CurrentPrincipal() p: Principal, @Query(zodBody(certificateQuerySchema)) q: CertificateQuery) {
    return this.certificates.list(p, q);
  }

  @Post()
  @RequirePermission("certificates", "edit")
  issue(@CurrentPrincipal() p: Principal, @Body(zodBody(issueCertificateSchema)) body: IssueCertificateInput) {
    return this.certificates.issue(p, body);
  }

  @Get(":certificateId")
  @RequirePermission("certificates", "read")
  get(@CurrentPrincipal() p: Principal, @Param("certificateId") id: string) {
    return this.certificates.get(p, id);
  }

  /** Where invariant 7's access asymmetry is enforced. */
  @Get(":certificateId/download")
  @RequirePermission("certificates", "read")
  download(@CurrentPrincipal() p: Principal, @Param("certificateId") id: string) {
    return this.certificates.download(p, id);
  }

  @Post(":certificateId/revoke")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("certificates", "edit")
  revoke(@CurrentPrincipal() p: Principal, @Param("certificateId") id: string, @Body(zodBody(revokeCertificateSchema)) body: RevokeCertificateInput) {
    return this.certificates.revoke(p, id, body);
  }
}
