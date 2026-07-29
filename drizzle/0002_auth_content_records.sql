CREATE TYPE "public"."auth_attempt_outcome" AS ENUM('SUCCEEDED', 'BAD_PIN', 'LOCKED_OUT', 'UNKNOWN_MANAGER');--> statement-breakpoint
CREATE TYPE "public"."content_kind" AS ENUM('tony_line', 'manager_line', 'npc_event', 'lore_ref', 'shop_dressing');--> statement-breakpoint
CREATE TYPE "public"."content_sensitivity" AS ENUM('ordinary', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."session_revoke_reason" AS ENUM('SIGNED_OUT', 'SIGNED_OUT_EVERYWHERE', 'PIN_CHANGED', 'COMMISSIONER_RESET');--> statement-breakpoint
CREATE TYPE "public"."tony_expression" AS ENUM('neutral', 'pleased', 'unimpressed');--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"subject_user_id" uuid,
	"details" jsonb,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"ip_hash" text NOT NULL,
	"outcome" "auth_attempt_outcome" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" "content_kind" NOT NULL,
	"surface" text NOT NULL,
	"required_tags" text[] DEFAULT '{}' NOT NULL,
	"excluded_tags" text[] DEFAULT '{}' NOT NULL,
	"template_text" text NOT NULL,
	"expression" "tony_expression",
	"weight" integer DEFAULT 100 NOT NULL,
	"cooldown_days" integer DEFAULT 0 NOT NULL,
	"max_uses_per_season" integer,
	"sensitivity" "content_sensitivity" DEFAULT 'ordinary' NOT NULL,
	"approval_group" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_entries_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "content_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" uuid,
	"surface" text NOT NULL,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_label" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "session_revoke_reason",
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "losses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "ties" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "points_for" numeric(8, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "points_against" numeric(8, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "made_playoffs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_attempts" ADD CONSTRAINT "auth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_usage_log" ADD CONSTRAINT "content_usage_log_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_usage_log" ADD CONSTRAINT "content_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_actor_idx" ON "admin_audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_attempts_user_idx" ON "auth_attempts" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_attempts_ip_idx" ON "auth_attempts" USING btree ("ip_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "content_entries_surface_idx" ON "content_entries" USING btree ("surface","active");--> statement-breakpoint
CREATE INDEX "content_usage_user_entry_idx" ON "content_usage_log" USING btree ("user_id","entry_id","used_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");