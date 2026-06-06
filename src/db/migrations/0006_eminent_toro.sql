ALTER TYPE "public"."interaction_kind_t" ADD VALUE 'paste_confirm' BEFORE 'file_import';--> statement-breakpoint
ALTER TABLE "interaction" ADD COLUMN "metadata" jsonb;