-- Phase 1: Chat Substrate Schema & Tech Debt (RLS)

CREATE TYPE "public"."message_role" AS ENUM('user', 'agent', 'system', 'tool');--> statement-breakpoint

CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_user_idx" ON "messages" USING btree ("user_id");--> statement-breakpoint

-- ENABLE RLS (Addressing Tech Debt)
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- CONVERSATIONS POLICIES
CREATE POLICY "Users can manage own conversations" ON "conversations"
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint

-- MESSAGES POLICIES
CREATE POLICY "Users can manage own messages" ON "messages"
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint

-- USERS POLICIES (Tech debt patch)
DROP POLICY IF EXISTS "Users can view own profile" ON "users";--> statement-breakpoint
CREATE POLICY "Users can view own profile" ON "users"
FOR SELECT USING (auth.uid() = id);--> statement-breakpoint

DROP POLICY IF EXISTS "Users can update own profile" ON "users";--> statement-breakpoint
CREATE POLICY "Users can update own profile" ON "users"
FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);--> statement-breakpoint

-- RESUMES POLICIES (Tech debt patch)
DROP POLICY IF EXISTS "Users can manage own resumes" ON "resumes";--> statement-breakpoint
CREATE POLICY "Users can manage own resumes" ON "resumes"
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

