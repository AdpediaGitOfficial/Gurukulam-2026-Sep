-- Prisma's spurious DROP DEFAULT against the GENERATED ALWAYS columns removed
-- (packages/db/README.md, "Working with the hand-written constraints").
--
-- trainers.city_id existed as a bare column with no foreign key, so a
-- trainer's city could not be joined and city scope could not read through it.

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE SET NULL ON UPDATE CASCADE;
