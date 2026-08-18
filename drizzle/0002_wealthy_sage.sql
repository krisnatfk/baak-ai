CREATE TYPE "public"."faq_import_row_status" AS ENUM('VALID', 'WARNING', 'ERROR', 'DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."faq_import_status" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');--> statement-breakpoint
CREATE TABLE "faq_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_code" varchar(40) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_type" varchar(10) NOT NULL,
	"status" "faq_import_status" DEFAULT 'PROCESSING' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faq_import_batches_batch_code_unique" UNIQUE("batch_code")
);
--> statement-breakpoint
CREATE TABLE "faq_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"data" jsonb NOT NULL,
	"validation_status" "faq_import_row_status" DEFAULT 'VALID' NOT NULL,
	"message" text,
	"duplicate_of" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "source_page" integer;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "source_chunk_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "generation_confidence" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "faq_import_batches" ADD CONSTRAINT "faq_import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faq_import_rows" ADD CONSTRAINT "faq_import_rows_batch_id_faq_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."faq_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faq_import_batches_created_at_idx" ON "faq_import_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "faq_import_batches_status_idx" ON "faq_import_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faq_import_rows_batch_id_idx" ON "faq_import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faq_import_rows_batch_row_unique" ON "faq_import_rows" USING btree ("batch_id","row_index");--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_import_batch_id_faq_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."faq_import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_document_id_knowledge_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_chunk_id_knowledge_document_chunks_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."knowledge_document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_items_import_batch_id_idx" ON "knowledge_items" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_source_document_id_idx" ON "knowledge_items" USING btree ("source_document_id");