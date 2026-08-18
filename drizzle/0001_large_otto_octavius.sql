CREATE TYPE "public"."knowledge_attachment_type" AS ENUM('PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."knowledge_item_source_type" AS ENUM('WEBSITE', 'DOCUMENT', 'INTERNAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."knowledge_media_type" AS ENUM('IMAGE', 'VIDEO', 'OTHER');--> statement-breakpoint
CREATE TABLE "knowledge_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" "knowledge_attachment_type" DEFAULT 'PDF' NOT NULL,
	"file_path" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_item_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" "knowledge_item_source_type" DEFAULT 'WEBSITE' NOT NULL,
	"url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"type" "knowledge_media_type" DEFAULT 'IMAGE' NOT NULL,
	"caption" text,
	"url" text,
	"file_path" text,
	"file_name" varchar(255),
	"file_size" integer,
	"mime_type" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_related_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"related_knowledge_id" uuid,
	"question" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD COLUMN "show_in_bot_menu" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_attachments" ADD CONSTRAINT "knowledge_attachments_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item_sources" ADD CONSTRAINT "knowledge_item_sources_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_media" ADD CONSTRAINT "knowledge_media_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_related_questions" ADD CONSTRAINT "knowledge_related_questions_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_related_questions" ADD CONSTRAINT "knowledge_related_questions_related_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("related_knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_attachments_knowledge_id_idx" ON "knowledge_attachments" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "knowledge_item_sources_knowledge_id_idx" ON "knowledge_item_sources" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "knowledge_media_knowledge_id_idx" ON "knowledge_media" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "knowledge_related_questions_knowledge_id_idx" ON "knowledge_related_questions" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "knowledge_related_questions_related_knowledge_id_idx" ON "knowledge_related_questions" USING btree ("related_knowledge_id");