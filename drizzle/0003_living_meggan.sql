ALTER TABLE "knowledge_attachments" ALTER COLUMN "file_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_attachments" ADD COLUMN "url" text;