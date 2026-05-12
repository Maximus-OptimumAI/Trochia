CREATE TYPE "public"."billing_period_t" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."region_t" AS ENUM('us', 'in');--> statement-breakpoint
CREATE TYPE "public"."subscription_status_t" AS ENUM('none', 'trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."tier_t" AS ENUM('pre_raise', 'active_raise', 'close_mode', 'alumni');--> statement-breakpoint
CREATE TYPE "public"."job_status_t" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."legal_document_t" AS ENUM('dpa', 'tos', 'privacy');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_price_id" text,
	"status" "subscription_status_t" DEFAULT 'none' NOT NULL,
	"tier" "tier_t",
	"period" "billing_period_t",
	"current_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text,
	"region" "region_t" DEFAULT 'us' NOT NULL,
	"stripe_customer_id" text,
	"subscription_status" "subscription_status_t" DEFAULT 'none' NOT NULL,
	"tier" "tier_t",
	"current_period_end" timestamp with time zone,
	"dpa_accepted_at" timestamp with time zone,
	"dpa_version" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"type" text NOT NULL,
	"status" "job_status_t" DEFAULT 'queued' NOT NULL,
	"payload" jsonb,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"document" "legal_document_t" NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "subscriptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("subscriptions"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("subscriptions"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "accounts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("accounts"."id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("accounts"."id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("sessions"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("sessions"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "users_self_access" ON "users" AS PERMISSIVE FOR ALL TO "authenticated" USING ("users"."id" = (select auth.uid())) WITH CHECK ("users"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "jobs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("jobs"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("jobs"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "legal_acceptances" AS PERMISSIVE FOR ALL TO "authenticated" USING ("legal_acceptances"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("legal_acceptances"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);--> statement-breakpoint
-- ── Supabase glue (hand-added; not drizzle-diffed) ──────────────────────────────
-- 1) pgvector — the embeddings/corpus tables land Phase 2, but the extension is
--    enabled now (FND-02). Lives in the `extensions` schema per Supabase convention.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;--> statement-breakpoint
-- 2) Realtime on `jobs` so the app can subscribe to job-status changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;--> statement-breakpoint
-- 3) Custom Access Token Auth Hook — injects `tenant_id` (= the owning accounts.id)
--    into every issued JWT. One business per account in Phase 1 (D-03), so the
--    auth.users.id → accounts.id mapping is 1:1. The RLS `tenant_isolation` policies
--    read `auth.jwt() ->> 'tenant_id'`. After applying this migration, enable the
--    hook in the Supabase dashboard: Authentication → Hooks → Customize Access Token
--    → public.custom_access_token_hook (or set `auth.hook.custom_access_token.*`).
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  tenant uuid;
BEGIN
  SELECT a.id INTO tenant
  FROM public.accounts a
  WHERE a.owner_user_id = (event->>'user_id')::uuid
    AND a.deleted_at IS NULL
  LIMIT 1;

  claims := event->'claims';
  IF tenant IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant::text));
  ELSE
    claims := jsonb_set(claims, '{tenant_id}', 'null'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;--> statement-breakpoint
GRANT SELECT ON TABLE public.accounts TO supabase_auth_admin;--> statement-breakpoint
CREATE POLICY "auth_admin_can_read_accounts" ON public.accounts AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);
