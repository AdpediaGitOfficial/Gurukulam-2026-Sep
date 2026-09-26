import { describe, expect, it } from "vitest";
import { parseStudentImport, studentImportSchema } from "@gurukulam/contracts";

/**
 * The file format for bulk student import.
 *
 * Two of these cases are here because the code got them wrong first. A file
 * that carries only `first_name, email, phone` read every column it did NOT
 * carry as an instruction to clear that field, and a three-column sheet of
 * phone corrections erased forty people's discipline, last name and
 * qualification on its way past. The header is what tells silence from a
 * deliberate blank, so the header is part of the contract.
 */

const parse = (text: string) => {
  const result = parseStudentImport(text);
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
  return result;
};

describe("the header", () => {
  it("reports only the columns the file actually carried", () => {
    const { columns } = parse("first_name,email,phone\nAarti,aarti@example.test,98450");
    expect(columns).toEqual(["first_name", "email", "phone"]);
  });

  it("does not claim a column the file left out", () => {
    const { columns } = parse("first_name,email\nAarti,aarti@example.test");
    expect(columns).not.toContain("discipline");
    expect(columns).not.toContain("last_name");
  });

  it("keeps a blank column, because blank means clear it", () => {
    const { columns, rows } = parse("first_name,email,discipline\nAarti,aarti@example.test,");
    expect(columns).toContain("discipline");
    expect(rows[0]?.discipline).toBeUndefined();
  });

  it("ignores an operator's own extra column rather than treating it as a field", () => {
    const { columns } = parse("first_name,email,remarks\nAarti,aarti@example.test,called twice");
    expect(columns).toEqual(["first_name", "email"]);
  });

  it("matches columns by name, so a reordered spreadsheet still loads", () => {
    const { rows } = parse("email,phone,first_name\naarti@example.test,98450,Aarti");
    expect(rows[0]?.firstName).toBe("Aarti");
    expect(rows[0]?.phone).toBe("98450");
  });

  it("accepts the names a real spreadsheet uses", () => {
    const { rows, columns } = parse("Name,Mail,Mobile,Branch,DOB\nAarti,aarti@example.test,98450,CSE,1999-03-12");
    expect(columns).toEqual(["first_name", "email", "phone", "discipline", "date_of_birth"]);
    expect(rows[0]?.discipline).toBe("CSE");
  });

  it("refuses a file missing a required column", () => {
    const result = parseStudentImport("first_name,phone\nAarti,98450");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("email");
  });
});

describe("identity", () => {
  it("numbers rows the way the operator's spreadsheet does", () => {
    const { rows } = parse("first_name,email\nA,a@example.test\nB,b@example.test");
    // Row 1 is the header, so the first record is row 2.
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("refuses two rows naming one person, and says which row", () => {
    // Otherwise the second lands as a silent update to the first, with
    // whichever row happened to sort last winning.
    const result = parseStudentImport("first_name,email\nA,same@example.test\nB,SAME@example.test");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("row 2");
  });

  it("refuses two rows naming one student code", () => {
    const result = parseStudentImport(
      "student_code,first_name,email\nSTU-1,A,a@example.test\nSTU-1,B,b@example.test",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("STU-1");
  });

  it("lowercases the email, because the live unique index is on LOWER(email)", () => {
    const { rows } = parse("first_name,email\nAarti,Aarti.Rao@Example.Test");
    expect(rows[0]?.email).toBe("aarti.rao@example.test");
  });
});

describe("refusing a file rather than half of it", () => {
  it("refuses the whole file for one unreadable row", () => {
    // Loading the good half is how a college ends up with eleven of its forty
    // students and nobody able to see which twenty-nine are missing.
    const result = parseStudentImport(
      "first_name,email\nA,a@example.test\nB,not-an-address\nC,c@example.test",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Row 3");
  });

  it("refuses a date that does not exist", () => {
    const result = parseStudentImport("first_name,email,date_of_birth\nA,a@example.test,1998-02-30");
    expect(result.ok).toBe(false);
  });

  it("refuses a passout year that is not a number", () => {
    const result = parseStudentImport("first_name,email,passout_year\nA,a@example.test,two thousand");
    expect(result.ok).toBe(false);
  });

  it("refuses a file with a header and nothing under it", () => {
    const result = parseStudentImport("first_name,email\n");
    expect(result.ok).toBe(false);
  });

  it("skips blank lines without losing the row numbers under them", () => {
    const { rows } = parse("first_name,email\nA,a@example.test\n\nC,c@example.test");
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });
});

describe("the payload the API validates", () => {
  it("will not accept rows without the header that explains them", () => {
    const { rows } = parse("first_name,email\nA,a@example.test");
    expect(studentImportSchema.safeParse({ rows }).success).toBe(false);
  });

  it("accepts rows with their header", () => {
    const { rows, columns } = parse("first_name,email\nA,a@example.test");
    const result = studentImportSchema.safeParse({ rows, columns });
    expect(result.success).toBe(true);
    // Writing nothing is the default: a caller has to ASK to commit.
    if (result.success) expect(result.data.dryRun).toBe(false);
  });

  it("caps one import, so a 20,000-row paste is a refusal and not a timeout", () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      rowNumber: i + 2, firstName: "A", email: `a${i}@example.test`,
    }));
    expect(studentImportSchema.safeParse({ rows, columns: ["first_name", "email"] }).success).toBe(false);
  });
});
