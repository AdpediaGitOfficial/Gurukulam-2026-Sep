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
            "Five failures inside fifteen minutes locks the account for thirty. The response is " +
            "identical whether the address is unknown or the password is wrong.",
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
