CREATE TYPE "public"."audience" AS ENUM('MAHASISWA', 'CALON_MAHASISWA', 'ALUMNI', 'ORANG_TUA', 'UMUM');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('USER', 'AI', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."chat_session_status" AS ENUM('ACTIVE', 'CLOSED', 'HANDOFF');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."embedding_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('MANUAL', 'URL', 'PDF', 'DOCX', 'TXT');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('DRAFT', 'ACTIVE', 'INACTIVE', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."unanswered_status" AS ENUM('NEW', 'REVIEWED', 'ANSWERED', 'ADDED_TO_KNOWLEDGE', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_email" varchar(255),
	"action" varchar(50) NOT NULL,
	"entity" varchar(50) NOT NULL,
	"entity_id" uuid,
	"old_data" jsonb,
	"new_data" jsonb,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"sender" varchar(50),
	"channel" varchar(30) DEFAULT 'WHATSAPP' NOT NULL,
	"topic" varchar(150),
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"status" "chat_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "human_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" uuid,
	"sender" varchar(50) NOT NULL,
	"question" text NOT NULL,
	"reason" text,
	"status" "handoff_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_admin_id" uuid,
	"note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_alternative_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"slug" varchar(150) NOT NULL,
	"description" text,
	"color" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "knowledge_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "knowledge_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1024),
	"embedding_status" "embedding_status" DEFAULT 'PENDING' NOT NULL,
	"embedding_error" text,
	"embedding_text_version" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"source_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_type" "knowledge_source_type" NOT NULL,
	"file_size" integer NOT NULL,
	"file_path" text NOT NULL,
	"status" "document_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category_id" uuid,
	"audience" "audience" DEFAULT 'MAHASISWA' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"source_id" uuid,
	"source_url" text,
	"status" "knowledge_status" DEFAULT 'DRAFT' NOT NULL,
	"internal_note" text,
	"embedding" vector(1024),
	"embedding_status" "embedding_status" DEFAULT 'PENDING' NOT NULL,
	"embedding_error" text,
	"embedding_model" varchar(200),
	"embedding_text_version" varchar(20),
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" "knowledge_source_type" DEFAULT 'MANUAL' NOT NULL,
	"url" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrieval_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"session_id" varchar(191),
	"sender" varchar(50),
	"embed_time_ms" integer,
	"search_time_ms" integer,
	"top_score" numeric(6, 4),
	"confidence" varchar(20),
	"best_knowledge_id" uuid,
	"best_source_type" varchar(20),
	"top_scores" jsonb,
	"threshold_high" numeric(6, 4),
	"threshold_medium" numeric(6, 4),
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "unanswered_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"normalized_question" text NOT NULL,
	"sender" varchar(50),
	"session_id" varchar(191),
	"best_similarity_score" numeric(6, 4),
	"times_asked" integer DEFAULT 1 NOT NULL,
	"status" "unanswered_status" DEFAULT 'NEW' NOT NULL,
	"knowledge_id" uuid,
	"notes" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_alternative_questions" ADD CONSTRAINT "knowledge_alternative_questions_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_chunks" ADD CONSTRAINT "knowledge_document_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unanswered_questions" ADD CONSTRAINT "unanswered_questions_knowledge_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unanswered_questions" ADD CONSTRAINT "unanswered_questions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_last_message_at_idx" ON "chat_sessions" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "human_handoffs_status_idx" ON "human_handoffs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "human_handoffs_created_at_idx" ON "human_handoffs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_alternative_questions_knowledge_id_idx" ON "knowledge_alternative_questions" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "knowledge_categories_is_active_idx" ON "knowledge_categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "knowledge_document_chunks_document_id_idx" ON "knowledge_document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_document_chunks_embedding_hnsw" ON "knowledge_document_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE embedding_status = 'COMPLETED';--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_document_chunks_document_index_unique" ON "knowledge_document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_documents_status_idx" ON "knowledge_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_items_status_idx" ON "knowledge_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_items_category_id_idx" ON "knowledge_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_updated_at_idx" ON "knowledge_items" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_items_keywords_gin" ON "knowledge_items" USING gin ("keywords");--> statement-breakpoint
CREATE INDEX "knowledge_items_embedding_hnsw" ON "knowledge_items" USING hnsw ("embedding" vector_cosine_ops) WHERE status = 'ACTIVE' AND deleted_at IS NULL AND embedding_status = 'COMPLETED';--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_items_question_unique_active" ON "knowledge_items" USING btree (lower(question)) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "knowledge_sources_is_active_idx" ON "knowledge_sources" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "retrieval_logs_created_at_idx" ON "retrieval_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "retrieval_logs_best_knowledge_id_idx" ON "retrieval_logs" USING btree ("best_knowledge_id");--> statement-breakpoint
CREATE INDEX "unanswered_questions_status_idx" ON "unanswered_questions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "unanswered_questions_created_at_idx" ON "unanswered_questions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unanswered_questions_new_unique" ON "unanswered_questions" USING btree (lower(normalized_question)) WHERE status = 'NEW';--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");