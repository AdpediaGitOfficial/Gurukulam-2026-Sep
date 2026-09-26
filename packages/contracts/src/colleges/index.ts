import { z } from "zod";
import { pageQuerySchema, queryBoolean } from "../common/page.js";
import { moneyMinor } from "../common/money.js";

/**
 * A college is an ACTOR, not a directory row: it has users, contracts,
 * requirements and its own students. It is also the college-scope axis — a
 * college portal user sees exactly one of these.
 */
export const collegePocSchema = z.object({
  pocId: z.string(),
  collegeId: z.string(),
  name: z.string(),
  designation: z.string().nullable(),
  department: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
});

/** B2B — a dedicated batch under a contract. HUB — a sponsored centre.
    PLACEMENT — we place into them rather than teach for them. */
export const partnershipTypeSchema = z.enum(["B2B", "HUB", "PLACEMENT"]);
export type PartnershipType = z.infer<typeof partnershipTypeSchema>;

export const PARTNERSHIP_LABELS: Record<PartnershipType, string> = {
  B2B: "B2B Institutional",
  HUB: "Sponsored Hub",
  PLACEMENT: "Placement Partner",
};

export const collegeSchema = z.object({
  collegeId: z.string(),
  collegeCode: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  countryId: z.string(),
  cityId: z.string(),
  cityName: z.string().nullable().optional(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
  website: z.string().nullable(),
  affiliation: z.string().nullable(),
  partnershipType: partnershipTypeSchema,
  disciplines: z.array(z.string()),
  /** Read back so the edit form can round-trip it — a write-only field is one
      an operator would silently erase every time they corrected an address. */
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  pocCount: z.number().int().optional(),
  studentCount: z.number().int().optional(),
  batchCount: z.number().int().optional(),
  openRequirementCount: z.number().int().optional(),
  /**
   * The institution's own portal standing, derived from its users: GRANTED if
   * anybody there can sign in, otherwise the furthest any of them got. Null
   * means nobody was ever given an account — different from NONE, which means
   * an account exists and has not been granted.
   */
  portalAccessStatus: z.enum(["NONE", "INVITED", "GRANTED", "REVOKED"]).nullable().optional(),
});

export type College = z.infer<typeof collegeSchema>;
export type CollegePoc = z.infer<typeof collegePocSchema>;

/**
 * What `GET /colleges/:id` returns: the college with its points of contact.
 *
 * Exactly one contact is primary — a college is an actor we deal with through
 * people, not a directory row, so the contacts travel with the record.
 */
export const collegeDetailSchema = collegeSchema.extend({
  pocs: z.array(collegePocSchema),
});

export type CollegeDetail = z.infer<typeof collegeDetailSchema>;

/**
 * One contact, seen from ACROSS the colleges rather than from inside one.
 *
 * The per-college view already answers "who do we deal with here". This one
 * answers the operations question — who is on file anywhere, and can they get
 * in — so it carries the institution and whether the person holds a login.
 */
export const collegeContactSchema = collegePocSchema.extend({
  collegeName: z.string().nullable(),
  collegeCode: z.string().nullable(),
  cityName: z.string().nullable(),
  /**
   * The state of this contact's portal account, or null when they have none.
   *
   * Null and `NONE` are different answers: null is "nobody ever made them an
   * account", `NONE` is "an account exists and has not been granted". A single
   * boolean cannot say both, and a boolean beside the status would contradict
   * it the moment access was revoked.
   */
  portalAccessStatus: z.enum(["NONE", "INVITED", "GRANTED", "REVOKED"]).nullable(),
});

export type CollegeContact = z.infer<typeof collegeContactSchema>;

export const contactQuerySchema = pageQuerySchema.extend({
  collegeId: z.string().optional(),
  cityId: z.string().optional(),
  isPrimary: queryBoolean.optional(),
});

export type ContactQuery = z.infer<typeof contactQuerySchema>;

/**
 * The directory's headline figures, for the tiles above the list.
 *
 * Scoped as the list is — a regional sub-admin's "14 colleges" is theirs.
 * Money is minor units on the wire like everywhere else; a contract total is
 * a crore-scale number and a float would lose paise on the way.
 */
export const collegeSummarySchema = z.object({
  colleges: z.number().int(),
  /** Not yet activated — on record, not yet trading. */
  pendingActivation: z.number().int(),
  students: z.number().int(),
  /** Live batches those students sit on. */
  liveBatches: z.number().int(),
  openRequirements: z.number().int(),
  /** Of those, still awaiting our confirmation. */
  awaitingConfirmation: z.number().int(),
  contractValueMinor: moneyMinor,
  contractOutstandingMinor: moneyMinor,
});

export type CollegeSummary = z.infer<typeof collegeSummarySchema>;

export const collegeQuerySchema = pageQuerySchema.extend({
  partnershipType: partnershipTypeSchema.optional(),
  cityId: z.string().optional(),
  discipline: z.string().optional(),
  isActive: queryBoolean.optional(),
});

export type CollegeQuery = z.infer<typeof collegeQuerySchema>;

const pocInput = z.object({
  name: z.string().trim().min(1, "Enter the contact's name").max(160),
  designation: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(24).optional(),
  isPrimary: z.boolean().default(false),
});

export const createCollegeSchema = z.object({
  partnershipType: partnershipTypeSchema.default("B2B"),
  name: z.string().trim().min(1, "Enter the college name").max(200),
  shortName: z.string().trim().max(80).optional(),
  countryId: z.string().min(1, "Select a country"),
  cityId: z.string().min(1, "Select a city"),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  postalCode: z.string().trim().max(20).optional(),
  website: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  affiliation: z.string().trim().max(200).optional(),
  disciplines: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  notes: z.string().trim().max(4000).optional(),
  pocs: z.array(pocInput).max(50).default([]),
});

export type CreateCollegeInput = z.infer<typeof createCollegeSchema>;

export const updateCollegeSchema = createCollegeSchema
  .omit({ pocs: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });

export type UpdateCollegeInput = z.infer<typeof updateCollegeSchema>;

/**
 * One contact in a replacement list.
 *
 * `pocId` identifies a contact the caller is EDITING rather than adding. It
 * matters because `college_users.poc_id` is a foreign key: a portal account is
 * linked to the person it belongs to, so a contact whose phone was corrected
 * has to keep the id it already had. Matching on email would not do — changing
 * an address is one of the commonest edits, and it would read as a delete
 * followed by an insert.
 *
 * Omit it for a new contact. An id that does not belong to this college's live
 * contacts is refused rather than treated as new.
 */
const replacePocInput = pocInput.extend({ pocId: z.string().optional() });

export const replacePocsSchema = z.object({ pocs: z.array(replacePocInput).max(50) });
export type ReplacePocsInput = z.infer<typeof replacePocsSchema>;
