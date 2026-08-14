import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Code2, Webhook, KeyRound, Puzzle, Terminal, Database } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Custom Integration | CareerAmp",
  description: "Embed CareerAmp resume analysis into your product, ATS, or platform. REST APIs, webhooks, and white-label options.",
};

const FEATURES = [
  { icon: Code2, color: "from-brand-500 to-brand-800", title: "REST API", desc: "Analyze, parse, tailor, and match resumes with clean, documented REST endpoints. JSON in, JSON out." },
  { icon: Webhook, color: "from-indigo-500 to-indigo-700", title: "Webhooks", desc: "Receive asynchronous results for long-running batches so your system never has to poll." },
  { icon: KeyRound, color: "from-amber-500 to-orange-600", title: "Scoped API keys", desc: "Fine-grained keys with per-endpoint permissions, rate limits, and full usage auditing." },
  { icon: Puzzle, color: "from-purple-500 to-violet-700", title: "White-label", desc: "Run the full experience under your brand with our white-label job-hunt workspace." },
  { icon: Terminal, color: "from-rose-500 to-pink-700", title: "SDKs & examples", desc: "TypeScript, Python, and cURL examples plus a sandbox environment to test before you go live." },
  { icon: Database, color: "from-cyan-500 to-teal-700", title: "ATS connectors", desc: "Pre-built connectors for common ATS and CRM systems, or custom data sinks via webhooks." },
];

export default function CustomIntegrationPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="For institutions"
        title="Embed resume intelligence"
        highlight="into your product"
        subtitle="Whether you run an ATS, a job board, a coaching platform, or an internal hiring tool — plug CareerAmp's analysis engine into your stack."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.1}>
                <div className="group h-full rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-lg font-bold tracking-tight text-[var(--text-primary)]">{f.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="rounded-[28px] border border-[var(--border-soft)] bg-[#0B1220] p-6 font-mono text-[13px] leading-relaxed text-slate-200 shadow-[var(--shadow-card)] sm:p-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-400">POST /api/resume/analyze</p>
              <div className="mt-4 space-y-1.5">
                <p><span className="text-slate-500"># Analyze a resume and get its ATS score</span></p>
                <p><span className="text-amber-300">curl</span> -X POST <span className="text-teal-300">"https://api.careeramp.ai/api/resume/analyze"</span> \</p>
                <p className="pl-8">-H <span className="text-teal-300">"Authorization: Bearer $YOUR_KEY"</span> \</p>
                <p className="pl-8">-F <span className="text-teal-300">"file=@resume.pdf"</span></p>
              </div>
              <div className="mt-5 space-y-1.5 border-t border-white/10 pt-5 text-slate-400">
                <p><span className="text-slate-300">// Response</span></p>
                <p>{"{"} <span className="text-emerald-300">"score"</span>: 89, <span className="text-emerald-300">"breakdown"</span>: {"{ ... }"}, <span className="text-emerald-300">"matches"</span>: [...] {"}"}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14">
              <h2 className="relative text-h2 font-bold">Let's build your integration</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                Tell us about your platform and we'll map the right endpoints and plan — most teams integrate in under a day.
              </p>
              <div className="relative mt-8 flex justify-center">
                <a
                  href="mailto:support@careeramp.ai?subject=Integration%20Enquiry"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  Get the API docs <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
