CREATE TYPE "public"."season_status" AS ENUM('DRAFT_PREP', 'ACTIVE', 'PLAYOFFS', 'SPEND_DOWN', 'OFFSEASON', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "season_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"roster_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"final_rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_memberships_season_roster_unique" UNIQUE("season_id","roster_id"),
	CONSTRAINT "season_memberships_season_user_unique" UNIQUE("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"sleeper_league_id" text,
	"status" "season_status" DEFAULT 'DRAFT_PREP' NOT NULL,
	"is_historical" boolean DEFAULT false NOT NULL,
	"title" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"sleeper_user_id" text,
	"pin_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_sleeper_user_id_unique" UNIQUE("sleeper_user_id")
);
--> statement-breakpoint
ALTER TABLE "season_memberships" ADD CONSTRAINT "season_memberships_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_memberships" ADD CONSTRAINT "season_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;