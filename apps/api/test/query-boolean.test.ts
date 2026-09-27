import { describe, expect, it } from "vitest";
import { pageQuerySchema, studentQuerySchema } from "@gurukulam/contracts";

/**
 * Query strings carry booleans as text, and `z.coerce.boolean()` gets this
 * exactly backwards: it runs JavaScript's `Boolean()`, under which every
 * non-empty string is true.
 *
 * The consequence was not cosmetic. `?includeDeleted=false` parsed as TRUE, so
 * an operational read returned soft-deleted rows — and a UI that always sends
 * the parameter explicitly is precisely the case that hit it.
 */
describe("booleans from a query string", () => {
  it('reads "false" as false, which Boolean() does not', () => {
    expect(Boolean("false")).toBe(true); // the trap
    expect(pageQuerySchema.parse({ includeDeleted: "false" }).includeDeleted).toBe(false);
  });

  it("reads the affirmative spellings a client might send", () => {
    for (const yes of ["true", "1", "yes", "on", "TRUE", " True "]) {
      expect(pageQuerySchema.parse({ includeDeleted: yes }).includeDeleted).toBe(true);
    }
  });

  it("reads the negative ones", () => {
    for (const no of ["false", "0", "no", "off", "", "FALSE"]) {
      expect(pageQuerySchema.parse({ includeDeleted: no }).includeDeleted).toBe(false);
    }
  });

  it("defaults to excluding removed rows when absent", () => {
    expect(pageQuerySchema.parse({}).includeDeleted).toBe(false);
  });

  it("distinguishes absent from false on an optional filter", () => {
    // The unallocated queue depends on this: absent means "either", false
    // means "only unallocated", and conflating them returns the wrong list.
    expect(studentQuerySchema.parse({}).allocated).toBeUndefined();
    expect(studentQuerySchema.parse({ allocated: "false" }).allocated).toBe(false);
    expect(studentQuerySchema.parse({ allocated: "true" }).allocated).toBe(true);
  });

  it("accepts real booleans and numbers too", () => {
    expect(pageQuerySchema.parse({ includeDeleted: true }).includeDeleted).toBe(true);
    expect(pageQuerySchema.parse({ includeDeleted: 0 }).includeDeleted).toBe(false);
  });
});
