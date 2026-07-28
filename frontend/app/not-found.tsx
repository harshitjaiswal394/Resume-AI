import Link from "next/link";
import { ArrowLeft, Compass, Home, Search, Sparkles } from "lucide-react";

const quickLinks = [
  {
    href: "/",
    title: "Home",
    description: "Upload a resume and start the AI analysis flow.",
    icon: Home,
  },
  {
    href: "/onboarding",
    title: "Onboarding",
    description: "Continue as a guest and personalize your resume strategy.",
    icon: Sparkles,
  },
  {
    href: "/dashboard",
    title: "Dashboard",
    description: "Review saved resumes, matches, and optimization suggestions.",
    icon: Search,
  },
];

export default function NotFound() {
  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(55,138,221,0.14),_transparent_38%),linear-gradient(180deg,#f8fbff_0%,#ffffff_42%,#f5f7fb_100%)]">
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_20%,rgba(29,158,117,0.12),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(55,138,221,0.16),transparent_32%)]" />

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 py-16 sm:px-10 lg:px-12">
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
          <section className="max-w-2xl animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700 shadow-[0_10px_30px_rgba(24,95,165,0.08)] backdrop-blur">
              <Compass className="size-4" />
              Page Not Found
            </div>

            <h1 className="mt-6 max-w-xl text-[clamp(3rem,7vw,5.5rem)] font-black leading-[0.95] tracking-[-0.04em] text-slate-950">
              This route took a wrong turn.
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">
              The page you requested does not exist, may have moved, or the URL may be mistyped. Let&apos;s get you back to a useful place.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex min-w-[180px] items-center justify-center rounded-lg bg-brand-600 px-8 py-3 text-lg font-medium text-white shadow-[0_18px_40px_rgba(24,95,165,0.22)] transition-all hover:bg-brand-800 active:scale-[0.98]"
              >
                <Home className="mr-2 size-4" />
                Go Home
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex min-w-[180px] items-center justify-center rounded-lg border border-slate-300 bg-white/80 px-8 py-3 text-lg font-medium text-slate-900 backdrop-blur transition-all hover:bg-slate-50 active:scale-[0.98]"
              >
                <Sparkles className="mr-2 size-4" />
                Open Dashboard
              </Link>
            </div>

            <div className="mt-10 inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 text-sm text-slate-500 shadow-[0_10px_30px_rgba(15,17,23,0.06)] backdrop-blur">
              <ArrowLeft className="size-4 text-brand-600" />
              Tip: check the URL spelling or use one of the shortcuts on the right.
            </div>
          </section>

          <aside className="animate-slide-up rounded-[32px] border border-white/70 bg-white/78 p-6 shadow-[0_24px_80px_rgba(15,17,23,0.10)] backdrop-blur sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">
                  Popular Destinations
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                  Where would you like to go?
                </h2>
              </div>
              <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <Compass className="size-7" />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {quickLinks.map(({ href, title, description, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group block rounded-2xl border border-slate-200 bg-white/90 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_16px_40px_rgba(24,95,165,0.12)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-slate-950">
                          {title}
                        </h3>
                        <span className="text-sm font-medium text-brand-600 transition-transform group-hover:translate-x-0.5">
                          Open
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
