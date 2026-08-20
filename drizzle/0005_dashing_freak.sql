CREATE TYPE "public"."bot_answer_style" AS ENUM('SINGKAT', 'NORMAL', 'LENGKAP');--> statement-breakpoint
CREATE TYPE "public"."bot_event_type" AS ENUM('GREETING', 'MENU_SELECTION', 'QUESTION', 'RAG_FOUND', 'RAG_NOT_FOUND', 'SIMILAR_SUGGESTION', 'FAQ_MATCH');--> statement-breakpoint
CREATE TYPE "public"."bot_menu_mode" AS ENUM('MANUAL', 'POPULAR', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."bot_message_rule_type" AS ENUM('GREETING', 'NOISE');--> statement-breakpoint
CREATE TYPE "public"."bot_status" AS ENUM('ACTIVE', 'MAINTENANCE', 'LIMITED');--> statement-breakpoint
CREATE TABLE "bot_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "bot_event_type" NOT NULL,
	"normalized_question" text,
	"route" varchar(20),
	"matched_faq_id" uuid,
	"confidence" varchar(20),
	"score" numeric(6, 4),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_message_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "bot_message_rule_type" NOT NULL,
	"phrase" varchar(255) NOT NULL,
	"normalized_phrase" varchar(255) NOT NULL,
	"reply" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_settings" (
	"id" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"bot_name" varchar(150) DEFAULT 'Asisten PMB' NOT NULL,
	"institution_name" varchar(255) DEFAULT 'Universitas Teknokrat Indonesia' NOT NULL,
	"user_call_name" varchar(50) DEFAULT 'Kak' NOT NULL,
	"welcome_enabled" boolean DEFAULT true NOT NULL,
	"welcome_intro" text NOT NULL,
	"welcome_closing" text NOT NULL,
	"include_menu" boolean DEFAULT true NOT NULL,
	"emoji_enabled" boolean DEFAULT true NOT NULL,
	"menu_mode" "bot_menu_mode" DEFAULT 'MANUAL' NOT NULL,
	"popular_period_days" integer DEFAULT 30 NOT NULL,
	"menu_limit" integer DEFAULT 10 NOT NULL,
	"menu_final_label" varchar(255),
	"similarity_enabled" boolean DEFAULT true NOT NULL,
	"similarity_high" numeric(6, 4) DEFAULT '0.7000' NOT NULL,
	"similarity_medium" numeric(6, 4) DEFAULT '0.5500' NOT NULL,
	"similarity_suggestion_enabled" boolean DEFAULT true NOT NULL,
	"similarity_max_suggestions" integer DEFAULT 5 NOT NULL,
	"not_found_message" text NOT NULL,
	"show_suggestions_on_not_found" boolean DEFAULT true NOT NULL,
	"show_menu_on_not_found" boolean DEFAULT true NOT NULL,
	"status" "bot_status" DEFAULT 'ACTIVE' NOT NULL,
	"maintenance_message" text NOT NULL,
	"human_handoff_enabled" boolean DEFAULT true NOT NULL,
	"human_handoff_message" text DEFAULT '' NOT NULL,
	"human_handoff_url" text,
	"human_handoff_phone" varchar(50),
	"human_handoff_after_unanswered" integer DEFAULT 1 NOT NULL,
	"answer_style" "bot_answer_style" DEFAULT 'NORMAL' NOT NULL,
	"answer_tone" varchar(50) DEFAULT 'RAMAH_PMB' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_analytics_events" ADD CONSTRAINT "bot_analytics_events_matched_faq_id_knowledge_items_id_fk" FOREIGN KEY ("matched_faq_id") REFERENCES "public"."knowledge_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_analytics_events_created_at_idx" ON "bot_analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bot_analytics_events_type_idx" ON "bot_analytics_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "bot_analytics_events_matched_faq_idx" ON "bot_analytics_events" USING btree ("matched_faq_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_message_rules_type_phrase_unique" ON "bot_message_rules" USING btree ("type","normalized_phrase");--> statement-breakpoint
CREATE INDEX "bot_message_rules_active_idx" ON "bot_message_rules" USING btree ("is_active");
--> statement-breakpoint
INSERT INTO "bot_settings" (
	"id", "welcome_intro", "welcome_closing", "not_found_message", "maintenance_message"
) VALUES (
	'default',
	E'Halo Kak 👋\nSelamat datang di layanan informasi Penerimaan Mahasiswa Baru\nUniversitas Teknokrat Indonesia 🎓\n\nSaya siap membantu Kakak mencari informasi seputar pendaftaran kuliah.',
	'Balas dengan nomor pilihan atau langsung tuliskan pertanyaan Kakak ya 😊',
	E'Maaf Kak, informasi tersebut belum tersedia di database informasi Penerimaan Mahasiswa Baru kami.\n\nKakak bisa mencoba menuliskan pertanyaan dengan kata lain atau memilih informasi yang tersedia pada menu PMB.',
	'Mohon maaf Kak, layanan PMB sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "bot_message_rules" ("type", "phrase", "normalized_phrase", "reply", "sort_order") VALUES
	('GREETING', 'halo', 'halo', 'Halo Kak 👋', 1),
	('GREETING', 'hallo', 'hallo', 'Halo Kak 👋', 2),
	('GREETING', 'hai', 'hai', 'Halo Kak 👋', 3),
	('GREETING', 'hello', 'hello', 'Halo Kak 👋', 4),
	('GREETING', 'assalamualaikum', 'assalamualaikum', 'Waalaikumsalam Kak 👋', 5),
	('GREETING', 'assalamu''alaikum', 'assalamu''alaikum', 'Waalaikumsalam Kak 👋', 6),
	('GREETING', 'min', 'min', NULL, 7),
	('GREETING', 'admin', 'admin', NULL, 8),
	('GREETING', 'permisi', 'permisi', NULL, 9),
	('GREETING', 'selamat pagi', 'selamat pagi', NULL, 10),
	('GREETING', 'selamat siang', 'selamat siang', NULL, 11),
	('GREETING', 'selamat sore', 'selamat sore', NULL, 12),
	('GREETING', 'selamat malam', 'selamat malam', NULL, 13),
	('NOISE', 'p', 'p', NULL, 20),
	('NOISE', '.', '.', NULL, 21),
	('NOISE', '..', '..', NULL, 22),
	('NOISE', '...', '...', NULL, 23),
	('NOISE', '....', '....', NULL, 24),
	('NOISE', '?', '?', NULL, 25),
	('NOISE', '!', '!', NULL, 26)
ON CONFLICT ("type", "normalized_phrase") DO NOTHING;
