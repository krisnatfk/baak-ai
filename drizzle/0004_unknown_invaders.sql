ALTER TABLE "knowledge_items" ADD COLUMN "show_in_main_menu" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "main_menu_order" integer;