CREATE TYPE "public"."sync_run_kind" AS ENUM('HISTORICAL_IMPORT');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "sync_run_kind" NOT NULL,
	"status" "sync_run_status" DEFAULT 'RUNNING' NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"records_changed" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "co_owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD COLUMN "sleeper_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD CONSTRAINT "season_memberships_co_owner_user_id_users_id_fk" FOREIGN KEY ("co_owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_sleeper_league_id_unique" UNIQUE("sleeper_league_id");