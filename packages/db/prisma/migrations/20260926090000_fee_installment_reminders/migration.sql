-- The reminder ladder, one row per rung.
--
-- `fee_installments.reminder_sent_flag` is a boolean, so it can only record
-- that SOMETHING was sent. A ladder needs to know which rungs have been
-- climbed — and finance needs to answer "did we remind them, and when", which
-- a flag cannot.
--
-- The unique key is the whole point: it is what makes the nightly run
-- idempotent. Running it twice in a day cannot double-send, because the second
-- insert for the same rung loses. A stage counter on the installment would not
-- give that — two runs could each read the same stage and each advance it.
--
-- `offset_days` is signed and counts from the due date: 5 is five days before,
-- 0 is the day itself, -7 is a week overdue.
CREATE TABLE "fee_installment_reminders" (
  "fee_installment_reminder_id" VARCHAR(36) NOT NULL,
  "installment_id" VARCHAR(36) NOT NULL,
  "offset_days" INTEGER NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recipient_type" "ActorType" NOT NULL,
  "recipient_id" VARCHAR(36) NOT NULL,
  "channel" VARCHAR(20) NOT NULL DEFAULT 'IN_PORTAL',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fee_installment_reminders_pkey" PRIMARY KEY ("fee_installment_reminder_id")
);

CREATE UNIQUE INDEX "fee_installment_reminders_rung_key"
  ON "fee_installment_reminders" ("installment_id", "offset_days");

CREATE INDEX "fee_installment_reminders_recipient_type_recipient_id_idx"
  ON "fee_installment_reminders" ("recipient_type", "recipient_id");

ALTER TABLE "fee_installment_reminders"
  ADD CONSTRAINT "fee_installment_reminders_installment_id_fkey"
  FOREIGN KEY ("installment_id") REFERENCES "fee_installments"("installment_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
