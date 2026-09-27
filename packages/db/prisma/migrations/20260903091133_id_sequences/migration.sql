-- Prisma also proposed DROP DEFAULT against the three GENERATED ALWAYS
-- columns. Those statements were removed: PostgreSQL refuses them outright,
-- and they are Prisma normalising a generation clause it cannot see. See
-- packages/db/README.md, "Working with the hand-written constraints".

-- CreateTable
CREATE TABLE "id_sequences" (
    "key" VARCHAR(120) NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "id_sequences_pkey" PRIMARY KEY ("key")
);
