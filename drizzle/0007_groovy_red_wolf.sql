ALTER TABLE "bot_settings" ADD COLUMN "smart_greeting_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "fuzzy_greeting_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "semantic_greeting_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "strip_greeting_from_question" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "greeting_similarity_threshold" numeric(6, 4) DEFAULT '0.8000' NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "greeting_modifiers" text DEFAULT 'kak,kaka,min,admin,mimin,mas,mba,mbak,pak,bu,bro,gan' NOT NULL;