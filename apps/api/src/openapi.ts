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
  jobPostingSchema,
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
    ],
    components: {
      schemas: components,
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
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
