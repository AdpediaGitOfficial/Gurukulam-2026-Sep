-- CreateEnum
CREATE TYPE "EnrolmentChannel" AS ENUM ('RETAIL', 'COLLEGE');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PortalAccessStatus" AS ENUM ('NONE', 'INVITED', 'GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('ONLINE', 'OFFLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "TrainerAssignmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('LEAVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID_FULL', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "CommercialBasis" AS ENUM ('PER_STUDENT', 'FLAT_COHORT');

-- CreateEnum
CREATE TYPE "HeadcountBasis" AS ENUM ('REQUIREMENT', 'ENROLLED', 'MANUAL');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'GRADED', 'LATE');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('DRAFT', 'ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CertificateSubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "SubmissionRowStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('INTERNAL', 'NAUKRI', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'SHORT_ANSWER', 'DESCRIPTIVE');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "NotificationClass" AS ENUM ('ACTION_REQUIRED', 'ALERT', 'FYI');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('OPEN', 'READ', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('ADMIN_USER', 'COLLEGE_USER', 'TRAINER', 'STUDENT', 'API_CLIENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "countries" (
    "country_id" VARCHAR(36) NOT NULL,
    "country_code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "iso2" VARCHAR(2) NOT NULL,
    "iso3" VARCHAR(3) NOT NULL,
    "dial_code" VARCHAR(8) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "countries_pkey" PRIMARY KEY ("country_id")
);

-- CreateTable
CREATE TABLE "cities" (
    "city_id" VARCHAR(36) NOT NULL,
    "city_code" VARCHAR(16) NOT NULL,
    "country_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "state" VARCHAR(120),
    "timezone" VARCHAR(64),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "cities_pkey" PRIMARY KEY ("city_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "role_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(400),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "admin_user_id" VARCHAR(36) NOT NULL,
    "role_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(24),
    "password_hash" VARCHAR(255) NOT NULL,
    "must_reset_password" BOOLEAN NOT NULL DEFAULT true,
    "photo_url" VARCHAR(500),
    "city_scope" TEXT[],
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("admin_user_id")
);

-- CreateTable
CREATE TABLE "college_users" (
    "college_user_id" VARCHAR(36) NOT NULL,
    "college_id" VARCHAR(36) NOT NULL,
    "poc_id" VARCHAR(36),
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(24),
    "password_hash" VARCHAR(255),
    "must_reset_password" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "access_status" "PortalAccessStatus" NOT NULL DEFAULT 'NONE',
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "invited_at" TIMESTAMP(3),
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "college_users_pkey" PRIMARY KEY ("college_user_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "refresh_token_id" VARCHAR(36) NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" VARCHAR(36) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "replaced_by_id" VARCHAR(36),
    "device_label" VARCHAR(160),
    "user_agent" VARCHAR(400),
    "ip_address" VARCHAR(64),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("refresh_token_id")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "api_client_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "city_scope" TEXT[],
    "college_scope" VARCHAR(36),
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("api_client_id")
);

-- CreateTable
CREATE TABLE "colleges" (
    "college_id" VARCHAR(36) NOT NULL,
    "college_code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "short_name" VARCHAR(80),
    "country_id" VARCHAR(36) NOT NULL,
    "city_id" VARCHAR(36) NOT NULL,
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "postal_code" VARCHAR(20),
    "website" VARCHAR(255),
    "affiliation" VARCHAR(200),
    "disciplines" TEXT[],
    "logo_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "colleges_pkey" PRIMARY KEY ("college_id")
);

-- CreateTable
CREATE TABLE "college_pocs" (
    "poc_id" VARCHAR(36) NOT NULL,
    "college_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "designation" VARCHAR(120),
    "department" VARCHAR(120),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(24),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "college_pocs_pkey" PRIMARY KEY ("poc_id")
);

-- CreateTable
CREATE TABLE "college_requirements" (
    "requirement_id" VARCHAR(36) NOT NULL,
    "requirement_code" VARCHAR(32) NOT NULL,
    "college_id" VARCHAR(36) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "expected_headcount" INTEGER NOT NULL,
    "preferred_mode" "DeliveryMode" NOT NULL DEFAULT 'OFFLINE',
    "preferred_window_start" DATE,
    "preferred_window_end" DATE,
    "discipline" VARCHAR(120),
    "source" VARCHAR(80),
    "notes" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'NEW',
    "rejection_reason" VARCHAR(500),
    "confirmed_by" VARCHAR(36),
    "confirmed_at" TIMESTAMP(3),
    "batch_id" VARCHAR(36),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "college_requirements_pkey" PRIMARY KEY ("requirement_id")
);

-- CreateTable
CREATE TABLE "college_contracts" (
    "contract_id" VARCHAR(36) NOT NULL,
    "contract_code" VARCHAR(32) NOT NULL,
    "college_id" VARCHAR(36) NOT NULL,
    "requirement_id" VARCHAR(36),
    "batch_id" VARCHAR(36),
    "course_id" VARCHAR(36) NOT NULL,
    "commercial_basis" "CommercialBasis" NOT NULL,
    "per_student_rate_minor" BIGINT,
    "flat_cohort_price_minor" BIGINT,
    "billable_headcount" INTEGER NOT NULL DEFAULT 0,
    "headcount_basis" "HeadcountBasis" NOT NULL DEFAULT 'REQUIREMENT',
    "computed_total_minor" BIGINT,
    "override_total_minor" BIGINT,
    "override_reason" VARCHAR(500),
    "total_value_minor" BIGINT,
    "advance_collected_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "total_paid_minor" BIGINT NOT NULL DEFAULT 0,
    "balance_pending_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "signed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "college_contracts_pkey" PRIMARY KEY ("contract_id")
);

-- CreateTable
CREATE TABLE "courses" (
    "course_id" VARCHAR(36) NOT NULL,
    "course_code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "short_name" VARCHAR(80),
    "description" TEXT,
    "category" VARCHAR(120),
    "duration_hours" INTEGER,
    "duration_weeks" INTEGER,
    "standard_market_value_minor" BIGINT NOT NULL,
    "syllabus_url" VARCHAR(500),
    "thumbnail_url" VARCHAR(500),
    "attendance_floor_pct" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "course_topics" (
    "topic_id" VARCHAR(36) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL,
    "duration_hours" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "course_topics_pkey" PRIMARY KEY ("topic_id")
);

-- CreateTable
CREATE TABLE "trainer_courses" (
    "trainer_course_id" VARCHAR(36) NOT NULL,
    "trainer_id" VARCHAR(36) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "approved_by" VARCHAR(36),
    "approved_at" TIMESTAMP(3),
    "notes" VARCHAR(400),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "trainer_courses_pkey" PRIMARY KEY ("trainer_course_id")
);

-- CreateTable
CREATE TABLE "question_bank" (
    "question_id" VARCHAR(36) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "topic_id" VARCHAR(36),
    "question_type" "QuestionType" NOT NULL,
    "difficulty" "DifficultyLevel" NOT NULL DEFAULT 'MEDIUM',
    "question_text" TEXT NOT NULL,
    "options" JSONB,
    "correct_answers" JSONB,
    "explanation" TEXT,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "trainers" (
    "trainer_id" VARCHAR(36) NOT NULL,
    "trainer_code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(24),
    "password_hash" VARCHAR(255),
    "must_reset_password" BOOLEAN NOT NULL DEFAULT true,
    "credentials_issued_at" TIMESTAMP(3),
    "qualification" VARCHAR(255),
    "experience_years" INTEGER,
    "skill_tags" TEXT[],
    "pay_model" VARCHAR(40),
    "pay_rate_minor" BIGINT,
    "max_weekly_hours" INTEGER,
    "city_id" VARCHAR(36),
    "photo_url" VARCHAR(500),
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("trainer_id")
);

-- CreateTable
CREATE TABLE "trainer_availability" (
    "availability_id" VARCHAR(36) NOT NULL,
    "trainer_id" VARCHAR(36) NOT NULL,
    "type" "AvailabilityType" NOT NULL DEFAULT 'LEAVE',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_full_day" BOOLEAN NOT NULL DEFAULT true,
    "reason" VARCHAR(400),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "trainer_availability_pkey" PRIMARY KEY ("availability_id")
);

-- CreateTable
CREATE TABLE "batches" (
    "batch_id" VARCHAR(36) NOT NULL,
    "batch_code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "college_id" VARCHAR(36),
    "city_id" VARCHAR(36),
    "primary_trainer_id" VARCHAR(36),
    "mode" "DeliveryMode" NOT NULL DEFAULT 'OFFLINE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "max_capacity" INTEGER,
    "venue" VARCHAR(255),
    "meeting_link" VARCHAR(500),
    "status" "BatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "batches_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "batch_sessions" (
    "session_id" VARCHAR(36) NOT NULL,
    "session_code" VARCHAR(32) NOT NULL,
    "batch_id" VARCHAR(36) NOT NULL,
    "topic_id" VARCHAR(36),
    "trainer_id" VARCHAR(36),
    "title" VARCHAR(200) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "mode" "DeliveryMode" NOT NULL DEFAULT 'OFFLINE',
    "venue" VARCHAR(255),
    "meeting_link" VARCHAR(500),
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completed_at" TIMESTAMP(3),
    "completed_by" VARCHAR(36),
    "rescheduled_from" TIMESTAMP(3),
    "reschedule_reason" VARCHAR(500),
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "batch_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "batch_trainer_assignments" (
    "batch_trainer_assignment_id" VARCHAR(36) NOT NULL,
    "batch_id" VARCHAR(36) NOT NULL,
    "trainer_id" VARCHAR(36) NOT NULL,
    "status" "TrainerAssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposed_by" VARCHAR(36),
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "decline_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "batch_trainer_assignments_pkey" PRIMARY KEY ("batch_trainer_assignment_id")
);

-- CreateTable
CREATE TABLE "student_attendance" (
    "attendance_id" VARCHAR(36) NOT NULL,
    "session_id" VARCHAR(36) NOT NULL,
    "student_id" VARCHAR(36) NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'ABSENT',
    "minutes_present" INTEGER,
    "remarks" VARCHAR(400),
    "marked_by" VARCHAR(36),
    "marked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("attendance_id")
);

-- CreateTable
CREATE TABLE "session_recordings" (
    "recording_id" VARCHAR(36) NOT NULL,
    "session_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(200),
    "provider" VARCHAR(40) NOT NULL DEFAULT 'YOUTUBE',
    "url" VARCHAR(500) NOT NULL,
    "duration_seconds" INTEGER,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "session_recordings_pkey" PRIMARY KEY ("recording_id")
);

-- CreateTable
CREATE TABLE "students" (
    "student_id" VARCHAR(36) NOT NULL,
    "student_code" VARCHAR(32) NOT NULL,
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(24),
    "alt_phone" VARCHAR(24),
    "date_of_birth" DATE,
    "gender" VARCHAR(24),
    "college_id" VARCHAR(36),
    "enrolment_channel" "EnrolmentChannel" NOT NULL DEFAULT 'RETAIL',
    "created_by_college_id" VARCHAR(36),
    "created_by_type" "ActorType" NOT NULL DEFAULT 'ADMIN_USER',
    "country_id" VARCHAR(36),
    "city_id" VARCHAR(36),
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "postal_code" VARCHAR(20),
    "discipline" VARCHAR(120),
    "passout_year" INTEGER,
    "qualification" VARCHAR(200),
    "photo_url" VARCHAR(500),
    "password_hash" VARCHAR(255),
    "must_reset_password" BOOLEAN NOT NULL DEFAULT true,
    "credentials_issued_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspended_at" TIMESTAMP(3),
    "suspended_reason" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "students_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "student_batch_mapping" (
    "student_batch_mapping_id" VARCHAR(36) NOT NULL,
    "student_id" VARCHAR(36) NOT NULL,
    "batch_id" VARCHAR(36) NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_by" VARCHAR(36),
    "completed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "exit_reason" VARCHAR(400),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "student_batch_mapping_pkey" PRIMARY KEY ("student_batch_mapping_id")
);

-- CreateTable
CREATE TABLE "student_fee_ledger" (
    "ledger_id" VARCHAR(36) NOT NULL,
    "student_id" VARCHAR(36) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "batch_id" VARCHAR(36),
    "course_value_minor" BIGINT NOT NULL,
    "enrolment_value_minor" BIGINT NOT NULL,
    "discount_amount_minor" BIGINT,
    "advance_paid_minor" BIGINT NOT NULL DEFAULT 0,
    "total_paid_minor" BIGINT NOT NULL DEFAULT 0,
    "balance_pending_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "LedgerStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "student_fee_ledger_pkey" PRIMARY KEY ("ledger_id")
);

-- CreateTable
CREATE TABLE "fee_installments" (
    "installment_id" VARCHAR(36) NOT NULL,
    "ledger_id" VARCHAR(36),
    "contract_id" VARCHAR(36),
    "installment_number" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "paid_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "reminder_sent_flag" BOOLEAN NOT NULL DEFAULT false,
    "reminder_sent_at" TIMESTAMP(3),
    "overdue_notice_sent_at" TIMESTAMP(3),
    "notes" VARCHAR(400),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "fee_installments_pkey" PRIMARY KEY ("installment_id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "transaction_id" VARCHAR(36) NOT NULL,
    "transaction_code" VARCHAR(32) NOT NULL,
    "installment_id" VARCHAR(36) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "external_transaction_id" VARCHAR(120),
    "paid_at" TIMESTAMP(3) NOT NULL,
    "bank_or_handle" VARCHAR(160),
    "receipt_number" VARCHAR(64),
    "receipt_url" VARCHAR(500),
    "is_reversal" BOOLEAN NOT NULL DEFAULT false,
    "reverses_transaction_id" VARCHAR(36),
    "reversal_reason" VARCHAR(500),
    "notes" VARCHAR(400),
    "recorded_by" VARCHAR(36),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "assignment_id" VARCHAR(36) NOT NULL,
    "assignment_code" VARCHAR(32) NOT NULL,
    "batch_id" VARCHAR(36) NOT NULL,
    "session_id" VARCHAR(36),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "attachment_url" VARCHAR(500),
    "max_marks" INTEGER,
    "due_at" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "assignment_submission_id" VARCHAR(36) NOT NULL,
    "assignment_id" VARCHAR(36) NOT NULL,
    "student_id" VARCHAR(36) NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_at" TIMESTAMP(3),
    "file_url" VARCHAR(500),
    "content_text" TEXT,
    "marks_awarded" INTEGER,
    "feedback" TEXT,
    "graded_by" VARCHAR(36),
    "graded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("assignment_submission_id")
);

-- CreateTable
CREATE TABLE "certificate_submissions" (
    "certificate_submission_id" VARCHAR(36) NOT NULL,
    "college_id" VARCHAR(36) NOT NULL,
    "batch_id" VARCHAR(36) NOT NULL,
    "submitted_by_college_user_id" VARCHAR(36),
    "status" "CertificateSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" VARCHAR(36),
    "reviewed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "certificate_submissions_pkey" PRIMARY KEY ("certificate_submission_id")
);

-- CreateTable
CREATE TABLE "certificate_submission_rows" (
    "certificate_submission_row_id" VARCHAR(36) NOT NULL,
    "certificate_submission_id" VARCHAR(36) NOT NULL,
    "uploaded_name" VARCHAR(200) NOT NULL,
    "uploaded_email" VARCHAR(255),
    "uploaded_ref" VARCHAR(80),
    "student_id" VARCHAR(36),
    "status" "SubmissionRowStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" VARCHAR(500),
    "decided_by" VARCHAR(36),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "certificate_submission_rows_pkey" PRIMARY KEY ("certificate_submission_row_id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "certificate_id" VARCHAR(36) NOT NULL,
    "certificate_number" VARCHAR(40) NOT NULL,
    "verification_code" VARCHAR(64) NOT NULL,
    "student_id" VARCHAR(36) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "batch_id" VARCHAR(36) NOT NULL,
    "certificate_submission_row_id" VARCHAR(36),
    "status" "CertificateStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_date" DATE,
    "issued_by" VARCHAR(36),
    "pdf_url" VARCHAR(500),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" VARCHAR(36),
    "revoked_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("certificate_id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "job_posting_id" VARCHAR(36) NOT NULL,
    "job_code" VARCHAR(32) NOT NULL,
    "role_title" VARCHAR(200) NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "company_logo_url" VARCHAR(500),
    "location" VARCHAR(200),
    "work_mode" "WorkMode" NOT NULL DEFAULT 'ONSITE',
    "experience_min_years" INTEGER,
    "experience_max_years" INTEGER,
    "compensation_min_minor" BIGINT,
    "compensation_max_minor" BIGINT,
    "compensation_period" VARCHAR(20),
    "skills" TEXT[],
    "description" TEXT,
    "apply_url" VARCHAR(500),
    "apply_email" VARCHAR(255),
    "closing_date" DATE,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "posted_by" VARCHAR(36),
    "source" "JobSource" NOT NULL DEFAULT 'INTERNAL',
    "external_ref" VARCHAR(160),
    "external_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("job_posting_id")
);

-- CreateTable
CREATE TABLE "job_audience_rules" (
    "job_audience_rule_id" VARCHAR(36) NOT NULL,
    "job_posting_id" VARCHAR(36) NOT NULL,
    "course_id" VARCHAR(36) NOT NULL,
    "batch_id" VARCHAR(36),
    "college_id" VARCHAR(36),
    "city_id" VARCHAR(36),
    "passout_year" INTEGER,
    "segment" "EnrolmentChannel",
    "completed_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(36),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(36),

    CONSTRAINT "job_audience_rules_pkey" PRIMARY KEY ("job_audience_rule_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" VARCHAR(36) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "class" "NotificationClass" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "cta_label" VARCHAR(80),
    "cta_href" VARCHAR(500),
    "recipient_type" "ActorType",
    "recipient_id" VARCHAR(36),
    "city_id" VARCHAR(36),
    "college_id" VARCHAR(36),
    "subject_type" VARCHAR(60),
    "subject_id" VARCHAR(36),
    "group_key" VARCHAR(160),
    "status" "NotificationStatus" NOT NULL DEFAULT 'OPEN',
    "read_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_country_code_key" ON "countries"("country_code");

-- CreateIndex
CREATE INDEX "countries_deleted_at_idx" ON "countries"("deleted_at");

-- CreateIndex
CREATE INDEX "countries_is_active_deleted_at_idx" ON "countries"("is_active", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "cities_city_code_key" ON "cities"("city_code");

-- CreateIndex
CREATE INDEX "cities_country_id_deleted_at_idx" ON "cities"("country_id", "deleted_at");

-- CreateIndex
CREATE INDEX "cities_deleted_at_idx" ON "cities"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "roles_deleted_at_idx" ON "roles"("deleted_at");

-- CreateIndex
CREATE INDEX "admin_users_role_id_deleted_at_idx" ON "admin_users"("role_id", "deleted_at");

-- CreateIndex
CREATE INDEX "admin_users_deleted_at_idx" ON "admin_users"("deleted_at");

-- CreateIndex
CREATE INDEX "college_users_college_id_deleted_at_idx" ON "college_users"("college_id", "deleted_at");

-- CreateIndex
CREATE INDEX "college_users_deleted_at_idx" ON "college_users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_actor_type_actor_id_idx" ON "refresh_tokens"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_key_hash_key" ON "api_clients"("key_hash");

-- CreateIndex
CREATE INDEX "api_clients_deleted_at_idx" ON "api_clients"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "colleges_college_code_key" ON "colleges"("college_code");

-- CreateIndex
CREATE INDEX "colleges_city_id_deleted_at_idx" ON "colleges"("city_id", "deleted_at");

-- CreateIndex
CREATE INDEX "colleges_deleted_at_idx" ON "colleges"("deleted_at");

-- CreateIndex
CREATE INDEX "college_pocs_college_id_deleted_at_idx" ON "college_pocs"("college_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "college_requirements_requirement_code_key" ON "college_requirements"("requirement_code");

-- CreateIndex
CREATE UNIQUE INDEX "college_requirements_batch_id_key" ON "college_requirements"("batch_id");

-- CreateIndex
CREATE INDEX "college_requirements_college_id_status_deleted_at_idx" ON "college_requirements"("college_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "college_requirements_status_deleted_at_idx" ON "college_requirements"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "college_contracts_contract_code_key" ON "college_contracts"("contract_code");

-- CreateIndex
CREATE INDEX "college_contracts_college_id_status_deleted_at_idx" ON "college_contracts"("college_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "college_contracts_status_deleted_at_idx" ON "college_contracts"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "courses_course_code_key" ON "courses"("course_code");

-- CreateIndex
CREATE INDEX "courses_deleted_at_idx" ON "courses"("deleted_at");

-- CreateIndex
CREATE INDEX "courses_is_active_deleted_at_idx" ON "courses"("is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "course_topics_course_id_sequence_deleted_at_idx" ON "course_topics"("course_id", "sequence", "deleted_at");

-- CreateIndex
CREATE INDEX "trainer_courses_course_id_deleted_at_idx" ON "trainer_courses"("course_id", "deleted_at");

-- CreateIndex
CREATE INDEX "trainer_courses_trainer_id_deleted_at_idx" ON "trainer_courses"("trainer_id", "deleted_at");

-- CreateIndex
CREATE INDEX "question_bank_course_id_deleted_at_idx" ON "question_bank"("course_id", "deleted_at");

-- CreateIndex
CREATE INDEX "question_bank_topic_id_deleted_at_idx" ON "question_bank"("topic_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_trainer_code_key" ON "trainers"("trainer_code");

-- CreateIndex
CREATE INDEX "trainers_deleted_at_idx" ON "trainers"("deleted_at");

-- CreateIndex
CREATE INDEX "trainers_city_id_deleted_at_idx" ON "trainers"("city_id", "deleted_at");

-- CreateIndex
CREATE INDEX "trainer_availability_trainer_id_starts_at_ends_at_idx" ON "trainer_availability"("trainer_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "trainer_availability_deleted_at_idx" ON "trainer_availability"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "batches_batch_code_key" ON "batches"("batch_code");

-- CreateIndex
CREATE INDEX "batches_course_id_deleted_at_idx" ON "batches"("course_id", "deleted_at");

-- CreateIndex
CREATE INDEX "batches_college_id_deleted_at_idx" ON "batches"("college_id", "deleted_at");

-- CreateIndex
CREATE INDEX "batches_status_deleted_at_idx" ON "batches"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "batches_city_id_deleted_at_idx" ON "batches"("city_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "batch_sessions_session_code_key" ON "batch_sessions"("session_code");

-- CreateIndex
CREATE INDEX "batch_sessions_batch_id_sequence_deleted_at_idx" ON "batch_sessions"("batch_id", "sequence", "deleted_at");

-- CreateIndex
CREATE INDEX "batch_sessions_scheduled_date_deleted_at_idx" ON "batch_sessions"("scheduled_date", "deleted_at");

-- CreateIndex
CREATE INDEX "batch_sessions_trainer_id_scheduled_date_idx" ON "batch_sessions"("trainer_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "batch_sessions_status_deleted_at_idx" ON "batch_sessions"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "batch_trainer_assignments_batch_id_status_deleted_at_idx" ON "batch_trainer_assignments"("batch_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "batch_trainer_assignments_trainer_id_status_deleted_at_idx" ON "batch_trainer_assignments"("trainer_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "student_attendance_session_id_deleted_at_idx" ON "student_attendance"("session_id", "deleted_at");

-- CreateIndex
CREATE INDEX "student_attendance_student_id_deleted_at_idx" ON "student_attendance"("student_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_recordings_session_id_key" ON "session_recordings"("session_id");

-- CreateIndex
CREATE INDEX "session_recordings_deleted_at_idx" ON "session_recordings"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_code_key" ON "students"("student_code");

-- CreateIndex
CREATE INDEX "students_college_id_deleted_at_idx" ON "students"("college_id", "deleted_at");

-- CreateIndex
CREATE INDEX "students_enrolment_channel_deleted_at_idx" ON "students"("enrolment_channel", "deleted_at");

-- CreateIndex
CREATE INDEX "students_city_id_deleted_at_idx" ON "students"("city_id", "deleted_at");

-- CreateIndex
CREATE INDEX "students_deleted_at_idx" ON "students"("deleted_at");

-- CreateIndex
CREATE INDEX "student_batch_mapping_student_id_deleted_at_idx" ON "student_batch_mapping"("student_id", "deleted_at");

-- CreateIndex
CREATE INDEX "student_batch_mapping_batch_id_deleted_at_idx" ON "student_batch_mapping"("batch_id", "deleted_at");

-- CreateIndex
CREATE INDEX "student_fee_ledger_student_id_deleted_at_idx" ON "student_fee_ledger"("student_id", "deleted_at");

-- CreateIndex
CREATE INDEX "student_fee_ledger_status_deleted_at_idx" ON "student_fee_ledger"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "fee_installments_ledger_id_deleted_at_idx" ON "fee_installments"("ledger_id", "deleted_at");

-- CreateIndex
CREATE INDEX "fee_installments_contract_id_deleted_at_idx" ON "fee_installments"("contract_id", "deleted_at");

-- CreateIndex
CREATE INDEX "fee_installments_due_date_status_idx" ON "fee_installments"("due_date", "status");

-- CreateIndex
CREATE INDEX "fee_installments_status_deleted_at_idx" ON "fee_installments"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_transaction_code_key" ON "payment_transactions"("transaction_code");

-- CreateIndex
CREATE INDEX "payment_transactions_installment_id_deleted_at_idx" ON "payment_transactions"("installment_id", "deleted_at");

-- CreateIndex
CREATE INDEX "payment_transactions_paid_at_idx" ON "payment_transactions"("paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_assignment_code_key" ON "assignments"("assignment_code");

-- CreateIndex
CREATE INDEX "assignments_batch_id_deleted_at_idx" ON "assignments"("batch_id", "deleted_at");

-- CreateIndex
CREATE INDEX "assignments_session_id_deleted_at_idx" ON "assignments"("session_id", "deleted_at");

-- CreateIndex
CREATE INDEX "assignments_status_deleted_at_idx" ON "assignments"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "assignment_submissions_assignment_id_deleted_at_idx" ON "assignment_submissions"("assignment_id", "deleted_at");

-- CreateIndex
CREATE INDEX "assignment_submissions_student_id_deleted_at_idx" ON "assignment_submissions"("student_id", "deleted_at");

-- CreateIndex
CREATE INDEX "certificate_submissions_college_id_status_deleted_at_idx" ON "certificate_submissions"("college_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "certificate_submissions_status_deleted_at_idx" ON "certificate_submissions"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "certificate_submission_rows_certificate_submission_id_statu_idx" ON "certificate_submission_rows"("certificate_submission_id", "status");

-- CreateIndex
CREATE INDEX "certificate_submission_rows_student_id_idx" ON "certificate_submission_rows"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificate_number_key" ON "certificates"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verification_code_key" ON "certificates"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificate_submission_row_id_key" ON "certificates"("certificate_submission_row_id");

-- CreateIndex
CREATE INDEX "certificates_student_id_deleted_at_idx" ON "certificates"("student_id", "deleted_at");

-- CreateIndex
CREATE INDEX "certificates_batch_id_deleted_at_idx" ON "certificates"("batch_id", "deleted_at");

-- CreateIndex
CREATE INDEX "certificates_status_deleted_at_idx" ON "certificates"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_job_code_key" ON "job_postings"("job_code");

-- CreateIndex
CREATE INDEX "job_postings_status_deleted_at_idx" ON "job_postings"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "job_postings_published_at_idx" ON "job_postings"("published_at");

-- CreateIndex
CREATE INDEX "job_audience_rules_job_posting_id_deleted_at_idx" ON "job_audience_rules"("job_posting_id", "deleted_at");

-- CreateIndex
CREATE INDEX "job_audience_rules_course_id_deleted_at_idx" ON "job_audience_rules"("course_id", "deleted_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_type_recipient_id_status_idx" ON "notifications"("recipient_type", "recipient_id", "status");

-- CreateIndex
CREATE INDEX "notifications_status_class_created_at_idx" ON "notifications"("status", "class", "created_at");

-- CreateIndex
CREATE INDEX "notifications_group_key_idx" ON "notifications"("group_key");

-- CreateIndex
CREATE INDEX "notifications_subject_type_subject_id_idx" ON "notifications"("subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("country_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_users" ADD CONSTRAINT "college_users_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("college_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_users" ADD CONSTRAINT "college_users_poc_id_fkey" FOREIGN KEY ("poc_id") REFERENCES "college_pocs"("poc_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colleges" ADD CONSTRAINT "colleges_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("country_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colleges" ADD CONSTRAINT "colleges_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_pocs" ADD CONSTRAINT "college_pocs_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("college_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_requirements" ADD CONSTRAINT "college_requirements_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("college_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_requirements" ADD CONSTRAINT "college_requirements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_requirements" ADD CONSTRAINT "college_requirements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_contracts" ADD CONSTRAINT "college_contracts_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("college_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_contracts" ADD CONSTRAINT "college_contracts_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "college_requirements"("requirement_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_contracts" ADD CONSTRAINT "college_contracts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_contracts" ADD CONSTRAINT "college_contracts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_topics" ADD CONSTRAINT "course_topics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_courses" ADD CONSTRAINT "trainer_courses_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("trainer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_courses" ADD CONSTRAINT "trainer_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "course_topics"("topic_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("trainer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("college_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_primary_trainer_id_fkey" FOREIGN KEY ("primary_trainer_id") REFERENCES "trainers"("trainer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_sessions" ADD CONSTRAINT "batch_sessions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_sessions" ADD CONSTRAINT "batch_sessions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "course_topics"("topic_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_sessions" ADD CONSTRAINT "batch_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("trainer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_trainer_assignments" ADD CONSTRAINT "batch_trainer_assignments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_trainer_assignments" ADD CONSTRAINT "batch_trainer_assignments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("trainer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "batch_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_recordings" ADD CONSTRAINT "session_recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "batch_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("college_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("country_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batch_mapping" ADD CONSTRAINT "student_batch_mapping_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batch_mapping" ADD CONSTRAINT "student_batch_mapping_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_ledger" ADD CONSTRAINT "student_fee_ledger_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_ledger" ADD CONSTRAINT "student_fee_ledger_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_ledger" ADD CONSTRAINT "student_fee_ledger_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "student_fee_ledger"("ledger_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "college_contracts"("contract_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "fee_installments"("installment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "batch_sessions"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_submissions" ADD CONSTRAINT "certificate_submissions_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "colleges"("college_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_submissions" ADD CONSTRAINT "certificate_submissions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_submissions" ADD CONSTRAINT "certificate_submissions_submitted_by_college_user_id_fkey" FOREIGN KEY ("submitted_by_college_user_id") REFERENCES "college_users"("college_user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_submission_rows" ADD CONSTRAINT "certificate_submission_rows_certificate_submission_id_fkey" FOREIGN KEY ("certificate_submission_id") REFERENCES "certificate_submissions"("certificate_submission_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_submission_rows" ADD CONSTRAINT "certificate_submission_rows_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_certificate_submission_row_id_fkey" FOREIGN KEY ("certificate_submission_row_id") REFERENCES "certificate_submission_rows"("certificate_submission_row_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_audience_rules" ADD CONSTRAINT "job_audience_rules_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("job_posting_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_audience_rules" ADD CONSTRAINT "job_audience_rules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_audience_rules" ADD CONSTRAINT "job_audience_rules_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;
