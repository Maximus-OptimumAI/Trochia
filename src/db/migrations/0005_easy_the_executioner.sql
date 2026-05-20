CREATE TYPE "public"."embedding_source_type_t" AS ENUM('memory', 'corpus', 'interaction');--> statement-breakpoint
CREATE TYPE "public"."interaction_kind_t" AS ENUM('qa_sidebar', 'paste_extract', 'file_import', 'staleness_nudge');--> statement-breakpoint
CREATE TYPE "public"."pipeline_investor_type_t" AS ENUM('vc', 'angel', 'accelerator', 'family_office', 'crowd', 'other');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage_t" AS ENUM('identified', 'researching', 'intro_pending', 'pitched', 'in_diligence', 'soft_circle', 'committed', 'wired', 'declined', 'ghosted');--> statement-breakpoint
CREATE TYPE "public"."timeline_source_module_t" AS ENUM('memory', 'pipeline', 'deck', 'brief', 'safe', 'cap_table', 'legal');--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"source_type" "embedding_source_type_t" NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_text" text NOT NULL,
	"chunk_idx" integer NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model_version" text NOT NULL,
	"token_count" integer,
	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"company_name" text,
	"one_liner" text,
	"sector" text,
	"stage" text,
	"geography" text,
	"incorporation_status" text,
	"founding_date" timestamp with time zone,
	"team" jsonb,
	"traction" jsonb,
	"narrative" jsonb,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_memory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "interaction_kind_t" NOT NULL,
	"query" text,
	"answer" text,
	"citations" jsonb,
	"model" text,
	"langfuse_trace_id" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interaction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pipeline_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"investor_name" text NOT NULL,
	"investor_type" "pipeline_investor_type_t",
	"stage" "pipeline_stage_t" DEFAULT 'identified' NOT NULL,
	"check_size" text,
	"sector" text,
	"geo" text,
	"notes" text,
	"first_contact_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "timeline_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"source_module" timeline_source_module_t NOT NULL,
	"source_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"investor_id" uuid,
	"founder_visible" boolean DEFAULT true NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timeline_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memory" ADD CONSTRAINT "business_memory_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_entry" ADD CONSTRAINT "pipeline_entry_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "embeddings_dedup_idx" ON "embeddings" USING btree ("account_id","source_type","source_id","chunk_idx","embedding_model_version");--> statement-breakpoint
CREATE INDEX "embeddings_hnsw_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "business_memory_account_id_uniq" ON "business_memory" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "interaction_account_created_at_idx" ON "interaction" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "pipeline_entry_account_stage_idx" ON "pipeline_entry" USING btree ("account_id","stage");--> statement-breakpoint
CREATE INDEX "timeline_event_account_event_at_idx" ON "timeline_event" USING btree ("account_id","event_at");--> statement-breakpoint
CREATE INDEX "timeline_event_account_source_module_idx" ON "timeline_event" USING btree ("account_id","source_module");--> statement-breakpoint
CREATE INDEX "timeline_event_account_investor_idx" ON "timeline_event" USING btree ("account_id","investor_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "embeddings" AS PERMISSIVE FOR ALL TO "authenticated" USING ("embeddings"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("embeddings"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "business_memory" AS PERMISSIVE FOR ALL TO "authenticated" USING ("business_memory"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("business_memory"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "interaction" AS PERMISSIVE FOR ALL TO "authenticated" USING ("interaction"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("interaction"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "pipeline_entry" AS PERMISSIVE FOR ALL TO "authenticated" USING ("pipeline_entry"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("pipeline_entry"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "timeline_event" AS PERMISSIVE FOR ALL TO "authenticated" USING ("timeline_event"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("timeline_event"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);