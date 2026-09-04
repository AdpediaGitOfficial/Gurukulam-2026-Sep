import { z } from "zod";
import {
  apiErrorSchema,
  changePasswordSchema,
  collegeSchema,
  courseSchema,
  createCollegeSchema,
  createCourseSchema,
  createJobSchema,
  createQuestionSchema,
  createTrainerSchema,
  batchSchema,
  batchSessionSchema,
  assignmentSchema,
  createBatchSchema,
  createSessionSchema,
  jobPostingSchema,
  studentSchema,
  ledgerSummarySchema,
  certificateSchema,
  dashboardSchema,
  roleSchema,
  reportQuerySchema,
  reportCatalogueEntrySchema,
  outstandingRowSchema,
  collectionRowSchema,
  unallocatedRowSchema,
  batchProgressRowSchema,
  reportSchema,
  bellSchema,
  notificationSchema,
  notificationTypeSchema,
  createRoleSchema,
  adminUserSchema,
  createAdminUserSchema,
  issuedAdminCredentialSchema,
  accountSchema,
  eligibilitySchema,
  issueCertificateSchema,
  submissionSchema,
  createSubmissionSchema,
  decideRowSchema,
  verificationSchema,
  contractSchema,
  createContractSchema,
  recordPaymentSchema,
  paymentSchema,
  setScheduleSchema,
  reminderRecipientSchema,
  cronResultSchema,
  createStudentSchema,
  allocateStudentSchema,
  allocationResultSchema,
  unallocatedSummarySchema,
  loginSchema,
  pageOf,
  principalSchema,
  questionSchema,
  refreshSchema,
  sessionSchema,
  trainerSchema,
} from "@gurukulam/contracts";

/**
 * The OpenAPI document, generated FROM the Zod contracts rather than written
 * beside them.
 *
 * This matters more here than in a single-consumer design: mobile and
 * third-party teams build against this document, and a hand-maintained spec
 * drifts from the validation silently — the API keeps rejecting a payload the
 * document says is valid.
 */
const components: Record<string, unknown> = {};

function register(name: string, schema: z.ZodType): { $ref: string } {
  components[name] = z.toJSONSchema(schema, { io: "output", target: "draft-2020-12" });
  return { $ref: `#/components/schemas/${name}` };
}

/** Shared query parameters for every list endpoint. */
const PAGE_PARAMS = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 25 } },
  { name: "q", in: "query", description: "Free-text search", schema: { type: "string" } },
  { name: "sort", in: "query", schema: { type: "string" } },
  { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
  {
    name: "includeDeleted", in: "query",
    description:
      "Include soft-deleted rows. Operational reads leave this off; financial and historical " +
      "reports opt in, because the events they record still happened.",
    schema: { type: "boolean", default: false },
  },
] as const;

const ID_PARAM = { name: "id", in: "path", required: true, schema: { type: "string" } } as const;
const ROLE_PARAM = { name: "roleId", in: "path", required: true, schema: { type: "string" } } as const;
const ADMIN_PARAM = { name: "adminUserId", in: "path", required: true, schema: { type: "string" } } as const;
const CERTIFICATE_PARAM = { name: "certificateId", in: "path", required: true, schema: { type: "string" } } as const;
const SUBMISSION_PARAM = { name: "submissionId", in: "path", required: true, schema: { type: "string" } } as const;
const ROW_PARAM = { name: "rowId", in: "path", required: true, schema: { type: "string" } } as const;
const LEDGER_PARAM = { name: "ledgerId", in: "path", required: true, schema: { type: "string" } } as const;
const CONTRACT_PARAM = { name: "contractId", in: "path", required: true, schema: { type: "string" } } as const;
const TXN_PARAM = { name: "transactionId", in: "path", required: true, schema: { type: "string" } } as const;
const INSTALLMENT_PARAM = { name: "installmentId", in: "path", required: true, schema: { type: "string" } } as const;
const SESSION_PARAM = { name: "sessionId", in: "path", required: true, schema: { type: "string" } } as const;
const ASSIGNMENT_PARAM = { name: "assignmentId", in: "path", required: true, schema: { type: "string" } } as const;

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
});

export function buildOpenApiDocument(basePath: string): Record<string, unknown> {
  const ApiError = register("ApiError", apiErrorSchema);
  const Login = register("LoginInput", loginSchema);
  const Refresh = register("RefreshInput", refreshSchema);
  const Session = register("Session", sessionSchema);
  const Principal = register("Principal", principalSchema);
  const ChangePassword = register("ChangePasswordInput", changePasswordSchema);

  const Course = register("Course", courseSchema);
  const CoursePage = register("CoursePage", pageOf(courseSchema));
  const CreateCourse = register("CreateCourseInput", createCourseSchema);
  const Trainer = register("Trainer", trainerSchema);
  const TrainerPage = register("TrainerPage", pageOf(trainerSchema));
  const CreateTrainer = register("CreateTrainerInput", createTrainerSchema);
  const College = register("College", collegeSchema);
  const CollegePage = register("CollegePage", pageOf(collegeSchema));
  const CreateCollege = register("CreateCollegeInput", createCollegeSchema);
  const Question = register("Question", questionSchema);
  const QuestionPage = register("QuestionPage", pageOf(questionSchema));
  const CreateQuestion = register("CreateQuestionInput", createQuestionSchema);
  const Job = register("JobPosting", jobPostingSchema);
  const JobPage = register("JobPostingPage", pageOf(jobPostingSchema));
  const CreateJob = register("CreateJobInput", createJobSchema);
  const Batch = register("Batch", batchSchema);
  const BatchPage = register("BatchPage", pageOf(batchSchema));
  const CreateBatch = register("CreateBatchInput", createBatchSchema);
  const BatchSession = register("BatchSession", batchSessionSchema);
  const SessionPage = register("BatchSessionPage", pageOf(batchSessionSchema));
  const CreateSession = register("CreateSessionInput", createSessionSchema);
  const Assignment = register("Assignment", assignmentSchema);
  const Student = register("Student", studentSchema);
  const StudentPage = register("StudentPage", pageOf(studentSchema));
  const CreateStudent = register("CreateStudentInput", createStudentSchema);
  const Allocate = register("AllocateStudentInput", allocateStudentSchema);
  const AllocationResult = register("AllocationResult", allocationResultSchema);
  const UnallocatedSummary = register("UnallocatedSummary", unallocatedSummarySchema);
  const LedgerSummary = register("LedgerSummary", ledgerSummarySchema);
  const LedgerPage = register("LedgerPage", pageOf(ledgerSummarySchema));
  const Contract = register("Contract", contractSchema);
  const ContractPage = register("ContractPage", pageOf(contractSchema));
  const CreateContract = register("CreateContractInput", createContractSchema);
  const RecordPayment = register("RecordPaymentInput", recordPaymentSchema);
  const Payment = register("Payment", paymentSchema);
  const SetSchedule = register("SetScheduleInput", setScheduleSchema);
  const ReminderRecipient = register("ReminderRecipient", reminderRecipientSchema);
  const CronResult = register("CronResult", cronResultSchema);
  const Certificate = register("Certificate", certificateSchema);
  const CertificatePage = register("CertificatePage", pageOf(certificateSchema));
  const Eligibility = register("Eligibility", eligibilitySchema);
  const IssueCertificate = register("IssueCertificateInput", issueCertificateSchema);
  const Submission = register("CertificateSubmission", submissionSchema);
  const SubmissionPage = register("CertificateSubmissionPage", pageOf(submissionSchema));
  const CreateSubmission = register("CreateSubmissionInput", createSubmissionSchema);
  const DecideRow = register("DecideRowInput", decideRowSchema);
  const Verification = register("Verification", verificationSchema);
  const DashboardDoc = register("Dashboard", dashboardSchema);
  const RoleDoc = register("Role", roleSchema);
  const RolePage = register("RolePage", pageOf(roleSchema));
  const CreateRole = register("CreateRoleInput", createRoleSchema);
  const AdminUser = register("AdminUser", adminUserSchema);
  const AdminUserPage = register("AdminUserPage", pageOf(adminUserSchema));
  const CreateAdminUser = register("CreateAdminUserInput", createAdminUserSchema);
  const IssuedAdminCredential = register("IssuedAdminCredential", issuedAdminCredentialSchema);
  const AccountDoc = register("Account", accountSchema);
  const ReportCatalogue = register("ReportCatalogueEntry", reportCatalogueEntrySchema);
  const OutstandingReport = register("OutstandingReport", reportSchema(outstandingRowSchema));
  const CollectionsReport = register("CollectionsReport", reportSchema(collectionRowSchema));
  const UnallocatedReport = register("UnallocatedReport", reportSchema(unallocatedRowSchema));
  const BatchProgressReport = register("BatchProgressReport", reportSchema(batchProgressRowSchema));
  const Bell = register("Bell", bellSchema);
  const NotificationDoc = register("Notification", notificationSchema);
  const NotificationType = register("NotificationType", notificationTypeSchema);
  register("ReportQuery", reportQuerySchema);

  const json = (schema: { $ref: string }) => ({ "application/json": { schema } });

  return {
    openapi: "3.1.0",
    info: {
      title: "Gurukulam TMS API",
      version: "1.0.0",
      description:
        "Training management for retail and B2B college segments. Every consumer — the admin " +
        "console, mobile clients and third-party integrations — uses these endpoints; there is " +
        "no privileged internal path.\n\n" +
        "**Money** is always an integer count of minor units (paise) sent as a decimal string. " +
        "Parse it as a big integer, never as a float.",
    },
    servers: [{ url: basePath }],
    tags: [
      { name: "Auth" },
      { name: "Health" },
      { name: "Courses", description: "The catalogue. Not scoped — the same courses everywhere." },
      { name: "Trainers", description: "City-scoped. Approval for a course is a relationship, not a tag." },
      { name: "Colleges", description: "Scoped on both axes: city for sub-admins, college for portal users." },
      { name: "Question bank", description: "Filed under courses; assessment belongs to a course." },
      { name: "Hiring", description: "Audience is resolved at read time, never materialised." },
      {
        name: "Batches",
        description:
          "Delivery. A batch is retail (collegeId null) or dedicated to one college — the two " +
          "rosters never mix. The trainer handshake lives here: an admin proposes, the trainer " +
          "confirms, and only a confirmed assignment is committed delivery.",
      },
      {
        name: "Reports",
        description:
          "REPORT = MEASURES × DIMENSIONS × FILTERS. One request shape and one envelope for all " +
          "of them, so the catalogued entries slot in rather than each inventing their own. Scope " +
          "is applied to every measure — a report is the easiest place to leak another region's " +
          "data, because it feels like just numbers.",
      },
      {
        name: "Notifications",
        description:
          "The bell is an admin WORK QUEUE, not a news feed. If it cannot reach zero it will be " +
          "ignored within a fortnight, so an action-required row is never dismissed by hand — it " +
          "exists exactly as long as its condition does, and the nightly sweep resolves it when " +
          "that clears. Grouped by situation: nine unallocated students are one row saying nine.",
      },
      {
        name: "Access",
        description:
          "Roles, administrators and the account screen — the module that can lock an " +
          "organisation out of its own system. Nobody grants permissions or region scope beyond " +
          "their own, nobody edits their own role or scope, and the last Super Admin cannot be " +
          "removed or demoted.",
      },
      {
        name: "Dashboard",
        description:
          "Aggregates over everything else, segmented retail vs college throughout because the " +
          "two have different economics and a blended number hides both. Every figure is scoped " +
          "to the caller, and the scope is echoed back so a total can never be read as global.",
      },
      {
        name: "Certificates",
        description:
          "Eligibility is IDENTICAL across segments; access is not. A retail student downloads " +
          "their own certificate; a college student does not — their institution downloads it for " +
          "them. Certificates reach a college only through an approved submission: an uploaded " +
          "name is not a certificate.",
      },
      {
        name: "Fee ledger",
        description:
          "Two billing levels, ONE installment engine. Retail bills the student through a fee " +
          "ledger; college bills the institution through a contract. An installment hangs off " +
          "exactly one of them. There is no delete — a receipt is a financial record, and the " +
          "correction is a reversing entry.",
      },
      {
        name: "Students",
        description:
          "Retail and college students in one register. collegeId is nullable and always will be — " +
          "a retail walk-in has no college and never will. Onboarding creates the record only; " +
          "course, batch, price, schedule and credentials are decided at allocation.",
      },
      {
        name: "Sessions",
        description:
          "The unit that actually happens on a given day, which is why assignments and recordings " +
          "hang off it. A session must be marked complete before assignments can be set against it.",
      },
    ],
    components: {
      schemas: components,
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/reports": {
        get: {
          tags: ["Reports"], summary: "The report library",
          description: "Every entry names its measures and dimensions, so a SPECIFIED one is a query to fill in rather than a screen to redesign.",
          responses: { "200": { description: "The catalogue", content: { "application/json": { schema: { type: "array", items: { $ref: ReportCatalogue.$ref } } } } } },
        },
      },
      "/reports/outstanding": {
        get: { tags: ["Reports"], summary: "Outstanding & ageing", description: "What is owed, by whom, and how long — across BOTH billing parents, aged into buckets.", parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "compare", in: "query", description: "Compare against the immediately preceding window of EQUAL length, so a change is like-for-like.", schema: { type: "boolean" } },
          { name: "format", in: "query", description: "`csv` renders the same rows the JSON returns, so the two cannot diverge.", schema: { type: "string", enum: ["json", "csv"] } },
          { name: "segment", in: "query", schema: { type: "string", enum: ["RETAIL", "COLLEGE"] } },
          { name: "cityId", in: "query", schema: { type: "string" } },
          { name: "collegeId", in: "query", schema: { type: "string" } },
          { name: "courseId", in: "query", schema: { type: "string" } },
        ], responses: { "200": { description: "The report", content: json(OutstandingReport) } } },
      },
      "/reports/collections": {
        get: { tags: ["Reports"], summary: "Daily collection register", description: "Every receipt in the window. Reversals are SUBTRACTED rather than listed as income — a register that counts a reversed receipt does not reconcile.", parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "compare", in: "query", description: "Compare against the immediately preceding window of EQUAL length, so a change is like-for-like.", schema: { type: "boolean" } },
          { name: "format", in: "query", description: "`csv` renders the same rows the JSON returns, so the two cannot diverge.", schema: { type: "string", enum: ["json", "csv"] } },
          { name: "segment", in: "query", schema: { type: "string", enum: ["RETAIL", "COLLEGE"] } },
          { name: "cityId", in: "query", schema: { type: "string" } },
          { name: "collegeId", in: "query", schema: { type: "string" } },
          { name: "courseId", in: "query", schema: { type: "string" } },
        ], responses: { "200": { description: "The report", content: json(CollectionsReport) } } },
      },
      "/reports/unallocated": {
        get: { tags: ["Reports"], summary: "Unallocated students ageing", description: "The gap between a record existing and revenue starting. Agrees with /students/unallocated by construction.", parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "compare", in: "query", description: "Compare against the immediately preceding window of EQUAL length, so a change is like-for-like.", schema: { type: "boolean" } },
          { name: "format", in: "query", description: "`csv` renders the same rows the JSON returns, so the two cannot diverge.", schema: { type: "string", enum: ["json", "csv"] } },
          { name: "segment", in: "query", schema: { type: "string", enum: ["RETAIL", "COLLEGE"] } },
          { name: "cityId", in: "query", schema: { type: "string" } },
          { name: "collegeId", in: "query", schema: { type: "string" } },
          { name: "courseId", in: "query", schema: { type: "string" } },
        ], responses: { "200": { description: "The report", content: json(UnallocatedReport) } } },
      },
      "/reports/batch-progress": {
        get: { tags: ["Reports"], summary: "Batch progress", description: "How far each batch has got, and what is outstanding on it. A batch with nothing scheduled is 0%, not NaN.", parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "compare", in: "query", description: "Compare against the immediately preceding window of EQUAL length, so a change is like-for-like.", schema: { type: "boolean" } },
          { name: "format", in: "query", description: "`csv` renders the same rows the JSON returns, so the two cannot diverge.", schema: { type: "string", enum: ["json", "csv"] } },
          { name: "segment", in: "query", schema: { type: "string", enum: ["RETAIL", "COLLEGE"] } },
          { name: "cityId", in: "query", schema: { type: "string" } },
          { name: "collegeId", in: "query", schema: { type: "string" } },
          { name: "courseId", in: "query", schema: { type: "string" } },
        ], responses: { "200": { description: "The report", content: json(BatchProgressReport) } } },
      },
      "/notifications/bell": {
        get: {
          tags: ["Notifications"], summary: "What the bell renders",
          description: "The badge counts ACTION_REQUIRED and ALERT only. FYI never badges — a badge that never clears trains people to ignore the badge.",
          responses: { "200": { description: "The bell", content: json(Bell) } },
        },
      },
      "/notifications": {
        get: { tags: ["Notifications"], summary: "The queue", parameters: PAGE_PARAMS, responses: { "200": { description: "A page of notifications", content: json(NotificationDoc) } } },
      },
      "/notifications/catalogue": {
        get: { tags: ["Notifications"], summary: "Every notification type and what CLEARS it", description: "The clearing condition is the load-bearing part: a row nothing can clear never leaves, and a queue that cannot reach zero is ignored.", responses: { "200": { description: "The catalogue", content: json(NotificationType) } } },
      },
      "/notifications/read": {
        post: {
          tags: ["Notifications"], summary: "Mark FYI and alerts read",
          description: "ACTION_REQUIRED is deliberately unaffected — those clear when their condition does, not when someone looks at them. A dismissable queue is one nobody trusts.",
          responses: { "200": { description: "How many were marked" } },
        },
      },
      "/settings/roles": {
        get: { tags: ["Access"], summary: "List roles with their permission matrix", parameters: PAGE_PARAMS, responses: { "200": { description: "A page of roles", content: json(RolePage) } } },
        post: {
          tags: ["Access"], summary: "Create a role",
          description: "Refused if it grants a permission you do not hold yourself — otherwise `settings:edit` quietly means `become a Super Admin`. An unrecognised module name is refused rather than dropped.",
          requestBody: { required: true, content: json(CreateRole) },
          responses: { "201": { description: "Created", content: json(RoleDoc) }, "400": errorResponse("Unknown module in the matrix"), "403": errorResponse("Grants more than you hold"), "409": errorResponse("Name already in use") },
        },
      },
      "/settings/roles/{roleId}": {
        get: { tags: ["Access"], summary: "One role", parameters: [ROLE_PARAM], responses: { "200": { description: "The role", content: json(RoleDoc) } } },
        patch: { tags: ["Access"], summary: "Update a role", description: "You cannot change the permissions of the role you hold — that widens your own access without touching your own record.", parameters: [ROLE_PARAM], responses: { "200": { description: "Updated", content: json(RoleDoc) }, "403": errorResponse("Your own role, or grants more than you hold") } },
        delete: { tags: ["Access"], summary: "Delete a role", description: "A SYSTEM role can be reshaped but never deleted; nobody would be able to restore it. A role someone holds is refused too.", parameters: [ROLE_PARAM], responses: { "204": { description: "Deleted" }, "409": errorResponse("System role, or still held") } },
      },
      "/settings/administrators": {
        get: { tags: ["Access"], summary: "List operators", parameters: PAGE_PARAMS, responses: { "200": { description: "A page of operators", content: json(AdminUserPage) } } },
        post: {
          tags: ["Access"], summary: "Create an operator",
          description: "Returns a temporary password ONCE; only its hash is stored. An empty cityScope grants GLOBAL access, which a scoped operator is refused — nobody hands out reach they do not have.",
          requestBody: { required: true, content: json(CreateAdminUser) },
          responses: { "201": { description: "Created", content: json(IssuedAdminCredential) }, "403": errorResponse("Scope or role beyond your own"), "409": errorResponse("Email already in use") },
        },
      },
      "/settings/administrators/{adminUserId}": {
        get: { tags: ["Access"], summary: "One operator", parameters: [ADMIN_PARAM], responses: { "200": { description: "The operator", content: json(AdminUser) } } },
        patch: {
          tags: ["Access"], summary: "Update an operator", parameters: [ADMIN_PARAM],
          description: "Invariant 19: you cannot change your OWN role, region scope or account status. Demoting or suspending the last active Super Admin is refused. Suspension revokes their sessions immediately.",
          responses: { "200": { description: "Updated", content: json(AdminUser) }, "403": errorResponse("Your own privileges, or beyond your grant"), "409": errorResponse("Last Super Admin") },
        },
        delete: { tags: ["Access"], summary: "Soft-delete an operator", parameters: [ADMIN_PARAM], description: "You cannot delete your own account, nor the last active Super Admin.", responses: { "204": { description: "Removed" }, "403": errorResponse("Your own account"), "409": errorResponse("Last Super Admin") } },
      },
      "/settings/administrators/{adminUserId}/reset-password": {
        post: { tags: ["Access"], summary: "Issue a fresh temporary password", parameters: [ADMIN_PARAM], description: "Revokes every existing session for that operator.", responses: { "200": { description: "Issued", content: json(IssuedAdminCredential) } } },
      },
      "/account": {
        get: {
          tags: ["Access"], summary: "Your own account",
          description: "Every authenticated actor has one, and it only ever shows their own record. `editable` names what may be changed, so a UI does not have to infer why the rest is locked.",
          responses: { "200": { description: "The account", content: json(AccountDoc) } },
        },
        put: {
          tags: ["Access"], summary: "Change your photo — and only your photo",
          description: "Invariant 19. The body is STRICT: sending roleId or cityScope is refused rather than silently ignored, which would leave an operator believing their own scope had changed.",
          responses: { "200": { description: "Updated", content: json(AccountDoc) }, "400": errorResponse("A field that is not yours to set") },
        },
      },
      "/dashboard": {
        get: {
          tags: ["Dashboard"], summary: "The executive dashboard",
          description:
            "Four headline counts, four ACTION queues in alert colours, collections, delivery, " +
            "course performance and trainer load.\n\n" +
            "**Not cached.** A cached figure has to be keyed by scope, and getting that key wrong " +
            "is invisible — the page renders plausible numbers belonging to another region. Until " +
            "there is a measured reason to cache, computing per request is the safe default.\n\n" +
            "The `scope` block echoes what the caller was allowed to see, so a figure cannot be " +
            "mistaken for a global one.",
          responses: {
            "200": { description: "The dashboard", content: json(DashboardDoc) },
            "403": errorResponse("No dashboard permission"),
          },
        },
      },
      "/certificates": {
        get: { tags: ["Certificates"], summary: "List certificates", parameters: [...PAGE_PARAMS, { name: "segment", in: "query", schema: { type: "string", enum: ["RETAIL", "COLLEGE"] } }, { name: "status", in: "query", schema: { type: "string" } }], responses: { "200": { description: "A page of certificates", content: json(CertificatePage) } } },
        post: {
          tags: ["Certificates"], summary: "Issue a certificate directly",
          description: "The retail path, and the admin override for any segment. Refused for an ineligible student unless overrideBlockers is set with a reason — completion is admin sign-off with an attendance floor, never automatic.",
          requestBody: { required: true, content: json(IssueCertificate) },
          responses: { "201": { description: "Issued", content: json(Certificate) }, "409": errorResponse("Already certified for that batch"), "422": errorResponse("Not eligible") },
        },
      },
      "/certificates/eligibility": {
        get: {
          tags: ["Certificates"], summary: "What an operator needs to see before signing off",
          description: "Roster membership, completed sessions, attendance against the course floor, and assignment completion. Attendance is deferred, so a batch may have no rows at all — that reports as NOT_EVALUATED rather than 0%, which would block every certificate in the system.",
          parameters: [{ name: "studentId", in: "query", required: true, schema: { type: "string" } }, { name: "batchId", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "The evaluation", content: json(Eligibility) } },
        },
      },
      "/certificates/verify/{code}": {
        get: {
          tags: ["Certificates"], summary: "The public verifier", security: [],
          description: "Unauthenticated by design — anyone holding a certificate must be able to check it. Reads the row, so a revocation is visible the moment it happens. An unknown code and a withdrawn one are deliberately indistinguishable.",
          parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "The verdict", content: json(Verification) } },
        },
      },
      "/certificates/{certificateId}": {
        get: { tags: ["Certificates"], summary: "One certificate", parameters: [CERTIFICATE_PARAM], responses: { "200": { description: "The certificate", content: json(Certificate) }, "404": errorResponse("Not found, or not yours to see") } },
      },
      "/certificates/{certificateId}/download": {
        get: {
          tags: ["Certificates"], summary: "Fetch the certificate", parameters: [CERTIFICATE_PARAM],
          description: "Where invariant 7 is enforced. An admin reaches any in scope; a college reaches its own students'; a RETAIL student reaches their own; a COLLEGE student reaches none — their institution holds it.",
          responses: { "200": { description: "The document" }, "403": errorResponse("Your college holds it"), "404": errorResponse("Not yours to see"), "409": errorResponse("Revoked, or not yet issued") },
        },
      },
      "/certificates/{certificateId}/revoke": {
        post: { tags: ["Certificates"], summary: "Revoke a certificate", parameters: [CERTIFICATE_PARAM], description: "Takes effect on the public verifier immediately — there is no cached copy to expire.", responses: { "200": { description: "Revoked", content: json(Certificate) }, "409": errorResponse("Already revoked") } },
      },
      "/certificates/submissions": {
        get: { tags: ["Certificates"], summary: "List certificate submissions", parameters: PAGE_PARAMS, responses: { "200": { description: "A page of submissions", content: json(SubmissionPage) } } },
        post: {
          tags: ["Certificates"], summary: "A college uploads its list of names",
          description: "Creates rows, and nothing else. An uploaded name is not a certificate. The text is kept verbatim even after matching, because it is what the college actually sent.",
          requestBody: { required: true, content: json(CreateSubmission) },
          responses: { "201": { description: "Submitted", content: json(Submission) }, "400": errorResponse("Not this college's dedicated training") },
        },
      },
      "/certificates/submissions/{submissionId}": {
        get: { tags: ["Certificates"], summary: "The review table", parameters: [SUBMISSION_PARAM], description: "Every row carries its eligibility, so nobody approves blind — that is the point of the screen.", responses: { "200": { description: "The submission with its rows", content: json(Submission) } } },
      },
      "/certificates/submissions/rows/{rowId}/decide": {
        post: {
          tags: ["Certificates"], summary: "Decide one uploaded name", parameters: [ROW_PARAM],
          description: "Admins only — a college approving its own list would make the review meaningless. Approving requires matching the name to a student OF THAT COLLEGE; rejecting requires a reason so the list can be corrected. Neither mints a certificate.",
          requestBody: { required: true, content: json(DecideRow) },
          responses: { "200": { description: "Decided" }, "400": errorResponse("Unmatched, wrong college, or no reason"), "403": errorResponse("A college cannot decide its own"), "422": errorResponse("Not eligible") },
        },
      },
      "/certificates/submissions/{submissionId}/release": {
        post: {
          tags: ["Certificates"], summary: "Release the submission", parameters: [SUBMISSION_PARAM],
          description: "Every APPROVED row becomes a certificate, in one transaction. This is the ONLY way a college certificate comes into existence, and each one names the row that produced it.",
          responses: { "200": { description: "Released" }, "409": errorResponse("Names still undecided, none approved, or already released") },
        },
      },
      "/fee-ledger": {
        get: {
          tags: ["Fee ledger"], summary: "The student fee register",
          description: "A SUMMARY per student — installment counts run from one to a hundred, so the schedule lives in the student's own ledger rather than here.",
          parameters: [...PAGE_PARAMS, { name: "status", in: "query", schema: { type: "string" } }, { name: "overdueOnly", in: "query", schema: { type: "boolean" } }],
          responses: { "200": { description: "A page of ledgers", content: json(LedgerPage) } },
        },
      },
      "/fee-ledger/{ledgerId}": {
        get: { tags: ["Fee ledger"], summary: "One ledger with its full schedule and receipts", parameters: [LEDGER_PARAM], responses: { "200": { description: "The ledger", content: json(LedgerSummary) } } },
      },
      "/fee-ledger/{ledgerId}/schedule": {
        put: { tags: ["Fee ledger"], summary: "Replace a student's schedule", description: "The rows must total the agreed price exactly. Refused once money has been collected against the plan.", parameters: [LEDGER_PARAM], requestBody: { required: true, content: json(SetSchedule) }, responses: { "200": { description: "The new schedule" }, "409": errorResponse("Money already collected") } },
      },
      "/fee-ledger/payments": {
        post: {
          tags: ["Fee ledger"], summary: "Record a payment",
          description:
            "ONE transaction: the receipt, the installment, the parent's recomputed totals and its " +
            "re-derived status. Overpayment is REFUSED at write time, not accepted and corrected. " +
            "A transaction ID is required for every mode except cash. Serves both parents.",
          requestBody: { required: true, content: json(RecordPayment) },
          responses: { "201": { description: "Recorded", content: json(Payment) }, "400": errorResponse("More than is due, or a missing transaction ID"), "409": errorResponse("Already settled, or the contract is cancelled") },
        },
      },
      "/fee-ledger/payments/{transactionId}/reverse": {
        post: { tags: ["Fee ledger"], summary: "Reverse a receipt", description: "The original stays — that is the point of a reversing entry. A reversal cannot itself be reversed, and a receipt cannot be reversed twice.", parameters: [TXN_PARAM], responses: { "201": { description: "Reversed", content: json(Payment) }, "409": errorResponse("Already reversed, or is itself a reversal") } },
      },
      "/fee-ledger/installments/{installmentId}/recipient": {
        get: {
          tags: ["Fee ledger"], summary: "Who a reminder for this installment reaches", parameters: [INSTALLMENT_PARAM],
          description: "Resolved from the installment's PARENT, never a stored column — which is what stops a college's students receiving an invoice reminder that is not theirs.",
          responses: { "200": { description: "The recipient", content: json(ReminderRecipient) } },
        },
      },
      "/fee-ledger/contracts": {
        get: { tags: ["Fee ledger"], summary: "Institutional contracts", parameters: PAGE_PARAMS, responses: { "200": { description: "A page of contracts", content: json(ContractPage) } } },
        post: {
          tags: ["Fee ledger"], summary: "Create a contract",
          description: "Stores BOTH commercial bases and records which headcount figure it bills on, because headcount drifts between requirement and delivery. computedTotal and totalValue are database-generated; an override wins over the computed total and cannot be saved without its reason.",
          requestBody: { required: true, content: json(CreateContract) },
          responses: { "201": { description: "Created", content: json(Contract) }, "400": errorResponse("Missing the input its basis needs, or an unexplained override") },
        },
      },
      "/fee-ledger/contracts/{contractId}": {
        get: { tags: ["Fee ledger"], summary: "One contract with its schedule and live headcount", parameters: [CONTRACT_PARAM], responses: { "200": { description: "The contract", content: json(Contract) } } },
        patch: { tags: ["Fee ledger"], summary: "Update a contract", description: "Commercial terms cannot be restated once money has been collected — that would silently change what the college already agreed to pay.", parameters: [CONTRACT_PARAM], responses: { "200": { description: "Updated", content: json(Contract) }, "409": errorResponse("Money already collected") } },
        delete: { tags: ["Fee ledger"], summary: "Soft-delete a contract", parameters: [CONTRACT_PARAM], responses: { "204": { description: "Removed" }, "409": errorResponse("Money already collected — cancel instead") } },
      },
      "/fee-ledger/contracts/{contractId}/schedule": {
        put: { tags: ["Fee ledger"], summary: "Replace a contract's schedule", description: "The same engine the student ledger uses. Rows must total the contract's billed value exactly.", parameters: [CONTRACT_PARAM], requestBody: { required: true, content: json(SetSchedule) }, responses: { "200": { description: "The new schedule" } } },
      },
      "/cron/fee-reminders": {
        post: {
          tags: ["Fee ledger"], summary: "The nightly reminder run", security: [],
          description:
            "Behind a shared secret in `x-cron-secret`, driven by an EXTERNAL scheduler — an " +
            "in-process timer does not survive serverless and fires once per replica when it does " +
            "run. Three steps: reminders for installments due in three days, the overdue " +
            "transition for those past due, then every parent's status re-derived. Each recipient " +
            "resolves from its installment's parent.",
          responses: { "200": { description: "What it did", content: json(CronResult) }, "401": errorResponse("Missing or wrong secret"), "403": errorResponse("No secret configured on this deployment") },
        },
      },
      "/students": {
        get: {
          tags: ["Students"], summary: "List students",
          description: "`allocated=false` is the unallocated queue — computed from live roster rows, never a stored flag, so it cannot go stale when a mapping is removed.",
          parameters: [...PAGE_PARAMS, { name: "segment", in: "query", schema: { type: "string", enum: ["RETAIL", "COLLEGE"] } }, { name: "allocated", in: "query", schema: { type: "boolean" } }, { name: "batchId", in: "query", schema: { type: "string" } }, { name: "collegeId", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "A page of students", content: json(StudentPage) } },
        },
        post: {
          tags: ["Students"], summary: "Onboard a student",
          description: "Creates the RECORD only. A college portal user can only onboard into their own college, and the record records which user did it — that is what makes institutional intake auditable.",
          requestBody: { required: true, content: json(CreateStudent) },
          responses: { "201": { description: "Created", content: json(Student) }, "409": errorResponse("Email already in use") },
        },
      },
      "/students/unallocated": {
        get: {
          tags: ["Students"], summary: "The unallocated queue and its sibling hygiene queues",
          description: "Ageing buckets over students with no live roster row, plus retail students on a roster with no ledger, ledgers with no schedule, and credentials issued but never used. Every count is a live query.",
          responses: { "200": { description: "The summary", content: json(UnallocatedSummary) } },
        },
      },
      "/students/{id}": {
        get: { tags: ["Students"], summary: "One student with batches and ledgers", parameters: [ID_PARAM], responses: { "200": { description: "The student", content: json(Student) }, "404": errorResponse("Not found, or outside your scope") } },
        patch: { tags: ["Students"], summary: "Update a student", description: "collegeId is not editable — moving a student between segments would strand their ledger or their institution's contract seat.", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(Student) } } },
        delete: { tags: ["Students"], summary: "Soft-delete a student", parameters: [ID_PARAM], description: "Refused once payments are recorded — money received is a fact about when it was received. Suspend instead.", responses: { "204": { description: "Removed" }, "409": errorResponse("Payments are recorded") } },
      },
      "/students/{id}/allocate": {
        post: {
          tags: ["Students"], summary: "Allocate a student to a batch", parameters: [ID_PARAM],
          description:
            "ONE transaction: roster mapping, session access, ledger, installments and credentials — all of it or none.\n\n" +
            "A student may only join a batch whose college matches their own: both null, or both equal. " +
            "Retail creates a ledger and a hand-authored schedule that must total the agreed price exactly. " +
            "College creates NO ledger — the institution is billed under its contract — and pricing on a " +
            "college allocation is refused rather than ignored. Credentials are issued for both segments.",
          requestBody: { required: true, content: json(Allocate) },
          responses: {
            "200": { description: "Allocated", content: json(AllocationResult) },
            "400": errorResponse("The schedule does not total the agreed price, or a field is invalid"),
            "409": errorResponse("Already on the roster, or the batch is full"),
            "422": errorResponse("Rosters would mix, or a college student was priced"),
          },
        },
      },
      "/students/{id}/deallocate": {
        post: { tags: ["Students"], summary: "Remove a student from a roster", parameters: [ID_PARAM], description: "The mapping is soft-deleted with its reason — that the student was once on this roster is what makes an issued certificate explicable a year later.", responses: { "204": { description: "Removed from the roster" } } },
      },
      "/students/{id}/suspend": {
        post: { tags: ["Students"], summary: "Suspend a student's access", parameters: [ID_PARAM], description: "Does not touch enrolment, billing or history.", responses: { "200": { description: "Suspended", content: json(Student) } } },
      },
      "/students/{id}/reinstate": {
        post: { tags: ["Students"], summary: "Reinstate a suspended student", parameters: [ID_PARAM], responses: { "200": { description: "Reinstated", content: json(Student) } } },
      },
      "/batches": {
        get: {
          tags: ["Batches"], summary: "List batches",
          description: "`segment=RETAIL` means collegeId IS NULL; `segment=COLLEGE` means it is set. The distinction is derived, never stored, so a filter cannot drift from reality.",
          parameters: [...PAGE_PARAMS, { name: "segment", in: "query", schema: { type: "string", enum: ["RETAIL", "COLLEGE"] } }, { name: "courseId", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "A page of batches", content: json(BatchPage) } },
        },
        post: {
          tags: ["Batches"], summary: "Create a batch",
          description: "Omit collegeId for a retail batch. Passing requirementId confirms that requirement and links it to the batch it produced.",
          requestBody: { required: true, content: json(CreateBatch) },
          responses: { "201": { description: "Created", content: json(Batch) }, "400": errorResponse("Validation failed") },
        },
      },
      "/batches/{id}": {
        get: { tags: ["Batches"], summary: "One batch with its trainer handshake history", parameters: [ID_PARAM], responses: { "200": { description: "The batch", content: json(Batch) }, "404": errorResponse("Not found, or outside your scope") } },
        patch: { tags: ["Batches"], summary: "Update a batch", description: "courseId and collegeId are not editable — changing either would move a batch between segments or curricula under an existing roster.", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(Batch) } } },
        delete: { tags: ["Batches"], summary: "Soft-delete a batch and its sessions", parameters: [ID_PARAM], responses: { "204": { description: "Removed" }, "409": errorResponse("Students are still enrolled") } },
      },
      "/batches/{id}/trainer/propose": {
        post: {
          tags: ["Batches"], summary: "Propose a trainer", parameters: [ID_PARAM],
          description: "Refused unless the trainer is approved for this batch's course, and refused on a schedule clash — free/busy is computed from committed sessions plus declared leave, never stored.",
          responses: { "200": { description: "Proposed" }, "409": errorResponse("A proposal is already open"), "422": errorResponse("Not approved for the course, or double-booked") },
        },
        delete: { tags: ["Batches"], summary: "Withdraw an open proposal", parameters: [ID_PARAM], responses: { "204": { description: "Withdrawn" } } },
      },
      "/batches/{id}/trainer/respond": {
        post: {
          tags: ["Batches"], summary: "Confirm or decline the open proposal", parameters: [ID_PARAM],
          description: "Confirming sets the batch's primary trainer and back-fills unassigned sessions. Declining returns the batch to unassigned and keeps the reason; nothing is auto-reassigned.",
          responses: { "200": { description: "Recorded" }, "400": errorResponse("A decline needs a reason") },
        },
      },
      "/batches/sessions": {
        get: { tags: ["Sessions"], summary: "List sessions", description: "Scope reaches a session through its batch.", parameters: [...PAGE_PARAMS, { name: "batchId", in: "query", schema: { type: "string" } }, { name: "from", in: "query", schema: { type: "string", format: "date" } }, { name: "to", in: "query", schema: { type: "string", format: "date" } }], responses: { "200": { description: "A page of sessions", content: json(SessionPage) } } },
        post: { tags: ["Sessions"], summary: "Schedule a session", description: "The topic must belong to the batch's own course. Sequence is allocated, and the batch's confirmed trainer is inherited.", requestBody: { required: true, content: json(CreateSession) }, responses: { "201": { description: "Created", content: json(BatchSession) } } },
      },
      "/batches/sessions/{sessionId}": {
        get: { tags: ["Sessions"], summary: "One session with its assignments and recording", parameters: [SESSION_PARAM], responses: { "200": { description: "The session", content: json(BatchSession) } } },
        patch: { tags: ["Sessions"], summary: "Edit a scheduled session", parameters: [SESSION_PARAM], responses: { "200": { description: "Updated", content: json(BatchSession) }, "409": errorResponse("Completed — reopen or reschedule instead") } },
        delete: { tags: ["Sessions"], summary: "Soft-delete a session", parameters: [SESSION_PARAM], responses: { "204": { description: "Removed" }, "409": errorResponse("Completed sessions are delivery history") } },
      },
      "/batches/sessions/{sessionId}/complete": {
        post: {
          tags: ["Sessions"], summary: "Mark a session complete", parameters: [SESSION_PARAM],
          description: "The deliberate act that releases assignments and prompts for the recording. Not a date passing — a date-based rule would open assignments on a session cancelled at the last minute.",
          responses: { "200": { description: "Completed", content: json(BatchSession) }, "409": errorResponse("Already complete, or cancelled") },
        },
      },
      "/batches/sessions/{sessionId}/reopen": {
        post: { tags: ["Sessions"], summary: "Reopen a completed session", parameters: [SESSION_PARAM], description: "Refused while published assignments hang off it.", responses: { "200": { description: "Reopened", content: json(BatchSession) }, "409": errorResponse("Published assignments attached") } },
      },
      "/batches/sessions/{sessionId}/reschedule": {
        post: {
          tags: ["Sessions"], summary: "Move a session", parameters: [SESSION_PARAM],
          description: "Updates in place so attendance and the recording stay attached — a cancel-and-recreate would orphan both. The reason is required because the roster is told.",
          responses: { "200": { description: "Moved", content: json(BatchSession) }, "400": errorResponse("A reason is required") },
        },
      },
      "/batches/sessions/{sessionId}/cancel": {
        post: { tags: ["Sessions"], summary: "Cancel a session", parameters: [SESSION_PARAM], responses: { "200": { description: "Cancelled", content: json(BatchSession) } } },
      },
      "/batches/sessions/{sessionId}/assignments": {
        post: {
          tags: ["Sessions"], summary: "Set an assignment against a session", parameters: [SESSION_PARAM],
          description: "Refused until the session is marked complete. The assignment belongs to the batch; its session link is what this endpoint adds.",
          responses: { "201": { description: "Created", content: json(Assignment) }, "422": errorResponse("The session is not complete") },
        },
      },
      "/batches/assignments/{assignmentId}": {
        patch: { tags: ["Sessions"], summary: "Update an assignment", parameters: [ASSIGNMENT_PARAM], responses: { "200": { description: "Updated", content: json(Assignment) } } },
        delete: { tags: ["Sessions"], summary: "Soft-delete an assignment", parameters: [ASSIGNMENT_PARAM], responses: { "204": { description: "Removed" }, "409": errorResponse("Students have submitted") } },
      },
      "/batches/sessions/{sessionId}/recording": {
        post: { tags: ["Sessions"], summary: "Link or replace the recording", parameters: [SESSION_PARAM], description: "One per session, replaced rather than duplicated. Refused until the session is complete.", responses: { "200": { description: "Linked" }, "422": errorResponse("The session is not complete") } },
      },
      "/batches/sessions/{sessionId}/recording/unpublish": {
        post: { tags: ["Sessions"], summary: "Unpublish the recording", parameters: [SESSION_PARAM], responses: { "200": { description: "Unpublished" } } },
      },
      "/courses": {
        get: {
          tags: ["Courses"], summary: "List courses",
          parameters: PAGE_PARAMS,
          responses: { "200": { description: "A page of courses", content: json(CoursePage) }, "403": errorResponse("No read permission") },
        },
        post: {
          tags: ["Courses"], summary: "Create a course with its topics",
          description: "courseCode is generated on save and never accepted from the caller.",
          requestBody: { required: true, content: json(CreateCourse) },
          responses: { "201": { description: "Created", content: json(Course) }, "400": errorResponse("Validation failed") },
        },
      },
      "/courses/{id}": {
        get: { tags: ["Courses"], summary: "One course with its topics", parameters: [ID_PARAM], responses: { "200": { description: "The course", content: json(Course) }, "404": errorResponse("Not found") } },
        patch: { tags: ["Courses"], summary: "Update a course", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(Course) } } },
        delete: {
          tags: ["Courses"], summary: "Soft-delete a course", parameters: [ID_PARAM],
          description: "Refused while scheduled or running batches still use it.",
          responses: { "204": { description: "Removed" }, "409": errorResponse("Still in use") },
        },
      },
      "/courses/{id}/topics": {
        put: { tags: ["Courses"], summary: "Replace the topic list", description: "Topics are sequenced by array order. Replaced rows are soft-deleted, because delivered sessions point at them.", parameters: [ID_PARAM], responses: { "200": { description: "The new topic list" } } },
      },
      "/courses/question-bank": {
        get: { tags: ["Question bank"], summary: "List questions", parameters: PAGE_PARAMS, responses: { "200": { description: "A page of questions", content: json(QuestionPage) } } },
        post: {
          tags: ["Question bank"], summary: "Add a question",
          description: "Multiple-choice questions must carry options, and every answer key must name a real option — otherwise the question marks every attempt wrong and looks fine in the list.",
          requestBody: { required: true, content: json(CreateQuestion) },
          responses: { "201": { description: "Created", content: json(Question) }, "400": errorResponse("Validation failed") },
        },
      },
      "/courses/question-bank/{id}": {
        get: { tags: ["Question bank"], summary: "One question", parameters: [ID_PARAM], responses: { "200": { description: "The question", content: json(Question) } } },
        patch: { tags: ["Question bank"], summary: "Update a question", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(Question) } } },
        delete: { tags: ["Question bank"], summary: "Soft-delete a question", parameters: [ID_PARAM], responses: { "204": { description: "Removed" } } },
      },
      "/trainers": {
        get: {
          tags: ["Trainers"], summary: "List trainers",
          description: "Filtered to the caller's city scope. `approvedForCourseId` is what the batch trainer picker calls — it returns only trainers approved for that course (invariant 15).",
          parameters: [...PAGE_PARAMS, { name: "approvedForCourseId", in: "query", schema: { type: "string" } }, { name: "cityId", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "A page of trainers", content: json(TrainerPage) } },
        },
        post: { tags: ["Trainers"], summary: "Add a trainer", requestBody: { required: true, content: json(CreateTrainer) }, responses: { "201": { description: "Created", content: json(Trainer) }, "409": errorResponse("Email already in use") } },
      },
      "/trainers/{id}": {
        get: { tags: ["Trainers"], summary: "One trainer with approved courses", parameters: [ID_PARAM], responses: { "200": { description: "The trainer", content: json(Trainer) }, "404": errorResponse("Not found, or outside your scope") } },
        patch: { tags: ["Trainers"], summary: "Update a trainer", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(Trainer) } } },
        delete: { tags: ["Trainers"], summary: "Soft-delete a trainer", parameters: [ID_PARAM], description: "Refused while confirmed on scheduled or running batches.", responses: { "204": { description: "Removed" }, "409": errorResponse("Committed to live delivery") } },
      },
      "/trainers/{id}/courses": {
        put: {
          tags: ["Trainers"], summary: "Set which courses this trainer may run",
          description: "Replaces the approval set (invariant 15). Revoking does not unassign the trainer from batches already running — pulling someone off live delivery as a side effect of a settings change would be worse than the inconsistency.",
          parameters: [ID_PARAM],
          responses: { "200": { description: "The new approval set" } },
        },
      },
      "/colleges": {
        get: {
          tags: ["Colleges"], summary: "List colleges",
          description: "Scoped on both axes: a regional sub-admin sees their cities, a college portal user sees exactly their own college.",
          parameters: PAGE_PARAMS,
          responses: { "200": { description: "A page of colleges", content: json(CollegePage) } },
        },
        post: { tags: ["Colleges"], summary: "Create a college with its contacts", requestBody: { required: true, content: json(CreateCollege) }, responses: { "201": { description: "Created", content: json(College) } } },
      },
      "/colleges/{id}": {
        get: { tags: ["Colleges"], summary: "One college with contacts and pipeline counts", parameters: [ID_PARAM], responses: { "200": { description: "The college", content: json(College) }, "404": errorResponse("Not found, or outside your scope") } },
        patch: { tags: ["Colleges"], summary: "Update a college", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(College) } } },
        delete: { tags: ["Colleges"], summary: "Soft-delete a college", parameters: [ID_PARAM], responses: { "204": { description: "Removed" }, "409": errorResponse("Still has students or active batches") } },
      },
      "/colleges/{id}/contacts": {
        put: { tags: ["Colleges"], summary: "Replace the contact list", parameters: [ID_PARAM], responses: { "200": { description: "The new contact list" } } },
      },
      "/hiring": {
        get: { tags: ["Hiring"], summary: "List job postings", parameters: PAGE_PARAMS, responses: { "200": { description: "A page of postings", content: json(JobPage) } } },
        post: { tags: ["Hiring"], summary: "Create a job posting", requestBody: { required: true, content: json(CreateJob) }, responses: { "201": { description: "Created", content: json(Job) } } },
      },
      "/hiring/reach-preview": {
        post: {
          tags: ["Hiring"], summary: "How many students a set of rules would reach",
          description: "Runs the same predicate the published feed uses, so the number shown before publishing is the number actually reached. Audience is never materialised (invariant 10).",
          responses: { "200": { description: "The reach count" } },
        },
      },
      "/hiring/{id}": {
        get: { tags: ["Hiring"], summary: "One posting with its live reach", parameters: [ID_PARAM], responses: { "200": { description: "The posting", content: json(Job) } } },
        patch: { tags: ["Hiring"], summary: "Update a posting", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(Job) } } },
        delete: { tags: ["Hiring"], summary: "Soft-delete a posting", parameters: [ID_PARAM], responses: { "204": { description: "Removed" } } },
      },
      "/hiring/{id}/publish": {
        post: {
          tags: ["Hiring"], summary: "Publish a draft", parameters: [ID_PARAM],
          description: "Only PUBLISHED postings are visible to students. Refused without audience rules — a posting reaching nobody looks identical to a broken feed.",
          responses: { "200": { description: "Published", content: json(Job) }, "400": errorResponse("No audience rules"), "409": errorResponse("Not a draft") },
        },
      },
      "/hiring/{id}/status": {
        patch: { tags: ["Hiring"], summary: "Close or archive a posting", parameters: [ID_PARAM], responses: { "200": { description: "Updated", content: json(Job) } } },
      },
      "/health": {
        get: {
          tags: ["Health"], summary: "Liveness", security: [],
          responses: { "200": { description: "The process is up" } },
        },
      },
      "/health/ready": {
        get: {
          tags: ["Health"], summary: "Readiness — checks the database", security: [],
          responses: { "200": { description: "Ready to serve traffic" }, "500": errorResponse("Not ready") },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"], summary: "Exchange credentials for a token pair", security: [],
          description:
            "Five failures inside fifteen minutes locks the ACCOUNT for thirty. Separately, 30 " +
            "attempts a minute from one CALLER is throttled — lockout stops many guesses at one " +
            "account, this stops many accounts being tried from one source, and an attacker " +
            "spreading across a thousand addresses trips only the second.\n\n" +
            "A college user signs in as `snc@gurukulam.com` and a student as " +
            "`stu-2026-0891@gurukulam.com`; their real contact address works too.\n\n" +
            "The response is identical whether the address is unknown or the password is wrong.",
          requestBody: { required: true, content: json(Login) },
          responses: {
            "200": { description: "Signed in", content: json(Session) },
            "400": errorResponse("Validation failed"),
            "401": errorResponse("Invalid credentials"),
            "403": errorResponse("Account not active"),
            "429": errorResponse("Locked after repeated failures"),
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"], summary: "Rotate a refresh token", security: [],
          description:
            "The presented token is revoked and a replacement issued. Presenting an " +
            "already-rotated token means a copy leaked, so every session for that actor is revoked.",
          requestBody: { required: true, content: json(Refresh) },
          responses: {
            "200": { description: "Rotated", content: json(Session) },
            "401": errorResponse("Expired, unknown or reused"),
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"], summary: "End one session", security: [],
          requestBody: { required: true, content: json(Refresh) },
          responses: { "204": { description: "Ended" } },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"], summary: "The current principal, with live permissions and scope",
          description:
            "Rebuilt from the database on every request, so a revoked permission or narrowed " +
            "city scope takes effect immediately rather than at token expiry.",
          responses: {
            "200": { description: "The caller", content: json(Principal) },
            "401": errorResponse("Not signed in"),
          },
        },
      },
      "/auth/change-password": {
        post: {
          tags: ["Auth"], summary: "Change your own password",
          description: "Revokes every other session for the account.",
          requestBody: { required: true, content: json(ChangePassword) },
          responses: {
            "204": { description: "Changed" },
            "400": errorResponse("Validation failed"),
          },
        },
      },
    },
  };
}

/** Swagger UI, loaded from a CDN so the API ships no static assets. */
export const docsPage = (specUrl: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gurukulam TMS API</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css">
</head>
<body>
<div id="ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.min.js"></script>
<script>
  window.ui = SwaggerUIBundle({ url: ${JSON.stringify(specUrl)}, dom_id: "#ui", deepLinking: true });
</script>
</body>
</html>`;
