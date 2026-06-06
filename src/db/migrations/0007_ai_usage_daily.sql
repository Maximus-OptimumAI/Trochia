CREATE TABLE "ai_usage_daily" (
	"account_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"micro_usd_spent" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_daily_account_id_usage_date_pk" PRIMARY KEY("account_id","usage_date")
);
--> statement-breakpoint
ALTER TABLE "ai_usage_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_usage_daily" AS PERMISSIVE FOR ALL TO "authenticated" USING ("ai_usage_daily"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid) WITH CHECK ("ai_usage_daily"."account_id" = (auth.jwt() ->> 'tenant_id')::uuid);