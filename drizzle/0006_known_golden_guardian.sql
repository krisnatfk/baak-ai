ALTER TABLE "chat_sessions" ADD COLUMN "consecutive_unanswered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "handoff_shown_at" timestamp with time zone;