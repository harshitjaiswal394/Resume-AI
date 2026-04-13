import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, vector, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ── ENUMS ────────────────────────────────────
export const planEnum = pgEnum('plan', ['free', 'pro', 'enterprise']);
export const statusEnum = pgEnum('status', ['active', 'cancelled', 'past_due', 'trialing']);
export const fileTypeEnum = pgEnum('file_type', ['pdf', 'docx']);
export const resumeStatusEnum = pgEnum('resume_status', ['uploading', 'parsing', 'analyzing', 'complete', 'failed']);

// ── TABLE: users ─────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // mirrors auth.users.id
  email: text('email').notNull().unique(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  plan: planEnum('plan').default('free').notNull(),
  creditsRemaining: integer('credits_remaining').default(3).notNull(),
  creditsResetAt: timestamp('credits_reset_at', { withTimezone: true }),
  onboardingDone: boolean('onboarding_done').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── TABLE: resumes ────────────────────────────
export const resumes = pgTable('resumes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  fileType: fileTypeEnum('file_type').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  fileHash: text('file_hash'), // SHA-256 for duplicate detection
  status: resumeStatusEnum('status').default('uploading').notNull(),
  rawText: text('raw_text'), // extracted plain text
  parsedData: jsonb('parsed_data'), // structured JSON
  resumeScore: integer('resume_score'), // 0–100 overall
  atsScore: integer('ats_score'), // 0–100 ATS compatibility
  scoreBreakdown: jsonb('score_breakdown'), // { contact, experience, skills, education, keywords }
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  userIdx: index('resumes_user_idx').on(t.userId),
  hashIdx: index('resumes_hash_idx').on(t.fileHash),
  statusIdx: index('resumes_status_idx').on(t.status),
}));

// ── TABLE: resume_embeddings ──────────────────
export const resumeEmbeddings = pgTable('resume_embeddings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  resumeId: uuid('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small
  skillKeywords: text('skill_keywords').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  resumeIdx: index('emb_resume_idx').on(t.resumeId),
}));

// ── TABLE: job_matches ────────────────────────
export const jobMatches = pgTable('job_matches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  resumeId: uuid('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobTitle: text('job_title').notNull(),
  company: text('company'),
  location: text('location'),
  jobDescription: text('job_description'),
  matchScore: integer('match_score').notNull(), // 0–100 final score
  embeddingScore: integer('embedding_score'), // layer 1 score
  reasoningScore: integer('reasoning_score'), // layer 2 score
  rerankScore: integer('rerank_score'), // layer 3 score
  matchingSkills: text('matching_skills').array(),
  missingSkills: text('missing_skills').array(),
  salaryMin: integer('salary_min'), // INR annual
  salaryMax: integer('salary_max'),
  aiReasoning: text('ai_reasoning'),
  rejectionReasons: text('rejection_reasons').array(),
  improvementSteps: text('improvement_steps').array(),
  applyLinks: jsonb('apply_links'), // { linkedin, naukri, indeed, instahyre }
  isSaved: boolean('is_saved').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  resumeIdx: index('matches_resume_idx').on(t.resumeId),
  userIdx: index('matches_user_idx').on(t.userId),
  scoreIdx: index('matches_score_idx').on(t.matchScore),
}));

// ── TABLE: cover_letters ──────────────────────
export const coverLetters = pgTable('cover_letters', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resumeId: uuid('resume_id').references(() => resumes.id, { onDelete: 'set null' }),
  jobMatchId: uuid('job_match_id').references(() => jobMatches.id, { onDelete: 'set null' }),
  jobTitle: text('job_title'),
  company: text('company'),
  content: text('content').notNull(),
  tone: text('tone').default('professional'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── TABLE: subscriptions ──────────────────────
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  razorpaySubId: text('razorpay_sub_id').unique(),
  razorpayCustomerId: text('razorpay_customer_id'),
  plan: planEnum('plan').notNull(),
  status: statusEnum('status').notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  userIdx: index('subs_user_idx').on(t.userId),
}));

// ── TABLE: job_search_logs ────────────────────
export const jobSearchLogs = pgTable('job_search_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  resumeId: uuid('resume_id').references(() => resumes.id, { onDelete: 'set null' }),
  searchQuery: text('search_query'),
  resultCount: integer('result_count'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── TABLE: audit_logs ─────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // e.g. 'resume.upload', 'match.generate', 'cover_letter.create'
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  userIdx: index('audit_user_idx').on(t.userId),
  actionIdx: index('audit_action_idx').on(t.action),
  timeIdx: index('audit_time_idx').on(t.createdAt),
}));

// ── RELATIONS ─────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  resumes: many(resumes),
  jobMatches: many(jobMatches),
  coverLetters: many(coverLetters),
  subscriptions: many(subscriptions),
  auditLogs: many(auditLogs),
}));

export const resumesRelations = relations(resumes, ({ one, many }) => ({
  user: one(users, { fields: [resumes.userId], references: [users.id] }),
  embeddings: many(resumeEmbeddings),
  matches: many(jobMatches),
}));
