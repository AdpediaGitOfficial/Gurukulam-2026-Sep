/**
 * Makes an empty production database usable.
 *
 * `prisma migrate deploy` creates 37 tables and not one row: no roles, no
 * operators, nobody who can sign in. The only other path in is `db:seed`, which
 * is dev fixtures — colleges, students, batches, payments — and has no business
 * anywhere real. Without this, deploying the API means standing in front of a
 * locked door you built yourself.
 *
 * It creates exactly what a real deployment needs and nothing else: the two
 * system roles, and one Super Admin who must change their password before
 * doing anything.
 *
 * Password hashing is imported from the API rather than reimplemented. A second
 * hashing implementation is the kind of duplication that drifts silently and
 * then locks everyone out — the seed already carries a legacy variant the API
 * has to keep tolerating.
 *
 *     BOOTSTRAP_ADMIN_EMAIL=ops@example.com \
 *     BOOTSTRAP_ADMIN_NAME="Ops Lead" \
 *     BOOTSTRAP_ADMIN_PASSWORD='…' \
 *     pnpm --filter @gurukulam/api bootstrap
 */
import { PrismaClient } from "@gurukulam/db";
import { MODULES } from "@gurukulam/contracts";
import { hashPassword } from "../src/modules/auth/password";

const prisma = new PrismaClient({ log: [] });

const FULL_ACCESS = { read: true, edit: true, delete: true } as const;
const READ_EDIT = { read: true, edit: true, delete: false } as const;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    console.error(`\n${name} is required.\n`);
    process.exit(1);
  }
  return value.trim();
}

async function main(): Promise<void> {
  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const name = required("BOOTSTRAP_ADMIN_NAME");
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");

  if (password.length < 12) {
    console.error("\nBOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.\n");
    process.exit(1);
  }

  /**
   * Refuses to run on a database that already has operators.
   *
   * Bootstrapping twice would mint a second unrestricted account nobody asked
   * for — the worst possible thing for a script whose whole job is the first
   * key to the building.
   */
  const existing = await prisma.adminUser.count({ where: { deletedAt: null } });
  if (existing > 0) {
    console.error(
      `\nThis database already has ${existing} operator(s). Bootstrap is for an empty one only.\n` +
        "Add further administrators from Settings › Administrators.\n",
    );
    process.exit(1);
  }

  // One transaction: a database left with roles but no operator is no more
  // usable than an empty one, and harder to diagnose.
  const admin = await prisma.$transaction(async (tx) => {
    const superAdminRole = await tx.role.create({
      data: {
        name: "Super Admin",
        description:
          "Unrestricted access. The only role that may edit another operator's role or scope.",
        isSystem: true,
        permissions: Object.fromEntries(MODULES.map((m) => [m, FULL_ACCESS])),
      },
    });

    await tx.role.create({
      data: {
        name: "Regional Sub-Admin",
        description:
          "Scoped to one or more cities. Sees only their region, on every screen including the dashboard.",
        isSystem: true,
        permissions: Object.fromEntries(MODULES.map((m) => [m, READ_EDIT])),
      },
    });

    return tx.adminUser.create({
      data: {
        roleId: superAdminRole.roleId,
        name,
        email,
        passwordHash: hashPassword(password),
        // The bootstrap password has been through a shell, a deploy log and
        // possibly a chat window. It gets changed at first sign-in.
        mustReset: true,
        cityScope: [], // empty = global
      },
    });
  });

  console.log(`
Bootstrapped.

  Roles       Super Admin, Regional Sub-Admin
  Super Admin ${admin.name} <${admin.email}>
  Password    must be changed at first sign-in

Nothing else was created. Countries, cities, colleges, courses and everyone
else are entered through the console.
`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
