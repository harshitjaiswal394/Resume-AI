"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock, Mail, Send, Sparkles } from "lucide-react";

const CATEGORIES = ["All", "Resume", "Interviews", "Salary", "Career Growth", "Job Market"] as const;

type Post = {
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  author: string;
  emoji: string;
  gradient: string;
};

const FEATURED = {
  title: "The 2026 Indian Tech Hiring Report: Salaries, Skills & What's Actually Working",
  excerpt:
    "We analyzed thousands of resumes and live job postings to break down where the Indian tech job market is heading — the skills that pay, the roles that are growing, and the exact mistakes costing candidates interviews.",
  category: "Job Market",
  readTime: "8 min read",
  date: "Aug 4, 2026",
  author: "ResuMatch AI Team",
  gradient: "from-brand-600 via-brand-700 to-brand-900",
};

const POSTS: Post[] = [
  {
    title: "11 Resume Mistakes That Get You Rejected Before the Interview",
    excerpt: "Small errors — from file naming to missing keywords — quietly eliminate you from the stack. Here's the full list we see every day.",
    category: "Resume",
    readTime: "6 min read",
    date: "Jul 28, 2026",
    author: "Ananya Rao",
    emoji: "📄",
    gradient: "from-brand-500 to-brand-700",
  },
  {
    title: "How to Answer 'Tell Me About Yourself' Like a Senior Engineer",
    excerpt: "A 90-second framework that converts an awkward opener into the strongest impression you'll make all interview.",
    category: "Interviews",
    readTime: "5 min read",
    date: "Jul 24, 2026",
    author: "Rahul Sharma",
    emoji: "🎙️",
    gradient: "from-purple-500 to-purple-700",
  },
  {
    title: "Product-Based vs Service-Based: How to Choose Your First Company",
    excerpt: "TCS vs a Series-A startup is a different decision than you think. A practical framework for freshers weighing their options.",
    category: "Career Growth",
    readTime: "7 min read",
    date: "Jul 20, 2026",
    author: "Priya Nair",
    emoji: "🧭",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    title: "Negotiating Your First Jump: How to Get 30-50% More",
    excerpt: "The 3 numbers you need before any negotiation and the exact scripts that work in the Indian market.",
    category: "Salary",
    readTime: "6 min read",
    date: "Jul 16, 2026",
    author: "Karan Mehta",
    emoji: "💸",
    gradient: "from-emerald-500 to-green-700",
  },
  {
    title: "AI Skills That Are Actually Appearing in Job Descriptions Right Now",
    excerpt: "We ranked the top AI keywords appearing in live Indian job postings this quarter — and how to add them honestly.",
    category: "Job Market",
    readTime: "5 min read",
    date: "Jul 12, 2026",
    author: "ResuMatch AI Team",
    emoji: "🤖",
    gradient: "from-sky-500 to-brand-700",
  },
  {
    title: "Why Your Resume Has a 30% ATS Score (And How to Fix It in an Hour)",
    excerpt: "Most resumes fail automated parsing not because of weak experience, but because of how content is formatted. Here's the fix.",
    category: "Resume",
    readTime: "7 min read",
    date: "Jul 8, 2026",
    author: "Ananya Rao",
    emoji: "⚙️",
    gradient: "from-slate-500 to-brand-800",
  },
  {
    title: "Remote vs Hybrid: What Indian Companies Are Actually Offering in 2026",
    excerpt: "The pendulum is swinging. Here's what the data on 4,000+ postings says about work models, and how to position yourself.",
    category: "Job Market",
    readTime: "6 min read",
    date: "Jul 2, 2026",
    author: "Priya Nair",
    emoji: "🏠",
    gradient: "from-accent-500 to-accent-700",
  },
  {
    title: "From Support Role to SDE in 18 Months: A Real Roadmap",
    excerpt: "No degree in CS? This documented path — with course lists, project ideas, and interview strategy — has worked for thousands.",
    category: "Career Growth",
    readTime: "9 min read",
    date: "Jun 26, 2026",
    author: "Rahul Sharma",
    emoji: "🚀",
    gradient: "from-rose-500 to-pink-700",
  },
  {
    title: "Cover Letters That Actually Get Read in the Indian Market",
    excerpt: "Recruiters skim. Learn the 4-sentence cover letter formula that gets your application opened instead of archived.",
    category: "Resume",
    readTime: "5 min read",
    date: "Jun 20, 2026",
    author: "Karan Mehta",
    emoji: "✉️",
    gradient: "from-indigo-500 to-brand-700",
  },
];

export function BlogExplorer() {
  const [active, setActive] = useState<string>("All");
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const filtered = active === "All" ? POSTS : POSTS.filter((p) => p.category === active);

  return (
    <>
      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="group relative overflow-hidden rounded-[32px] border border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-lift)]"
          >
            <div className="grid lg:grid-cols-2">
              <div
                className={`relative flex min-h-[220px] items-center justify-center overflow-hidden bg-gradient-to-br ${FEATURED.gradient} p-8`}
              >
                <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
                <Sparkles className="relative h-16 w-16 text-white/90 transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110" />
                <span className="absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-300" />
                  Featured
                </span>
              </div>
              <div className="flex flex-col justify-center p-8 sm:p-10">
                <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[var(--text-subtle)]">
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 font-bold uppercase tracking-wider text-brand-700">
                    {FEATURED.category}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {FEATURED.readTime}
                  </span>
                </div>
                <h2 className="mt-4 text-[22px] font-bold leading-snug tracking-tight text-[var(--text-primary)] sm:text-2xl">
                  {FEATURED.title}
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">{FEATURED.excerpt}</p>
                <div className="mt-6 flex items-center justify-between gap-4">
                  <div className="text-[12px] text-[var(--text-subtle)]">
                    <p className="font-bold text-[var(--text-primary)]">{FEATURED.author}</p>
                    <p>{FEATURED.date}</p>
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:-translate-y-0.5 hover:bg-brand-800">
                    Read Article
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] pb-16 sm:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-h2 font-bold tracking-tight">Latest articles</h2>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setActive(c)}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-all ${
                    active === c
                      ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                      : "border border-[var(--border-soft)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-brand-300 hover:text-brand-600"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <motion.div layout className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
            <AnimatePresence mode="popLayout">
              {filtered.map((post) => (
                <motion.article
                  key={post.title}
                  layout
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.35 }}
                  className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]"
                >
                  <div
                    className={`relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br ${post.gradient}`}
                  >
                    <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl transition-transform duration-500 group-hover:scale-125" />
                    <span className="text-5xl transition-transform duration-500 group-hover:scale-110">{post.emoji}</span>
                    <span className="absolute left-4 top-4 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                      {post.category}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-[15px] font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-brand-600">
                      {post.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                      {post.excerpt}
                    </p>
                    <div className="mt-5 flex items-center justify-between text-[12px] text-[var(--text-subtle)]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {post.date}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {post.readTime}
                      </span>
                    </div>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14"
          >
            <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-accent-500/30 blur-3xl" />
            <Mail className="relative mx-auto h-10 w-10" />
            <h2 className="relative mt-5 text-h2 font-bold">Get career tips in your inbox</h2>
            <p className="relative mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-white/80">
              One actionable email every Sunday. Resume strategies, salary data, and interview tactics — no spam.
            </p>
            <div className="relative mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
              {subscribed ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 px-6 py-3.5 font-semibold backdrop-blur-sm">
                  <Send className="h-4 w-4" />
                  You&apos;re on the list! Check your inbox.
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-13 w-full flex-1 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-[14px] text-white placeholder:text-white/50 outline-none backdrop-blur-sm transition-all focus:border-white/50 focus:bg-white/15"
                  />
                  <button
                    onClick={() => email.includes("@") && setSubscribed(true)}
                    disabled={!email.includes("@")}
                    className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-[14px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Subscribe
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
