ALTER TABLE "accounts" ADD COLUMN "onboarding_step" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "onboarding_completed_at" timestamp with time zone;