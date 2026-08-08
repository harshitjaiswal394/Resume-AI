"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Cookie, Check, ShieldCheck } from "lucide-react";

export type CookiePrefs = {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  savedAt: string;
};

const STORAGE_KEY = "rm_cookie_consent_v1";

type CategoryKey = "essential" | "analytics" | "marketing" | "preferences";

const CATEGORIES: { key: CategoryKey; title: string; desc: string; required?: boolean }[] = [
  {
    key: "essential",
    title: "Essential",
    desc: "Required for the Service to work — signing you in, keeping sessions secure, and saving resume drafts. Always on.",
    required: true,
  },
  {
    key: "analytics",
    title: "Analytics",
    desc: "Helps us understand how the Service is used so we can improve features. ResuMatch AI does not currently run third-party analytics trackers.",
  },
  {
    key: "marketing",
    title: "Marketing",
    desc: "Used to show relevant promotions. We do not currently set any third-party marketing or advertising cookies.",
  },
  {
    key: "preferences",
    title: "Preferences",
    desc: "Remembers your choices, such as editor mode or tailored-view settings, so you don't have to set them every visit.",
  },
];

const defaultPrefs = (): CookiePrefs => ({
  essential: true,
  analytics: false,
  marketing: false,
  preferences: false,
  savedAt: new Date().toISOString(),
});

function loadPrefs(): CookiePrefs | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookiePrefs>;
    return {
      essential: true,
      analytics: parsed.analytics ?? false,
      marketing: parsed.marketing ?? false,
      preferences: parsed.preferences ?? false,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function savePrefs(prefs: CookiePrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — ignore */
  }
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-brand-600" : "bg-[var(--border-base)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<CookiePrefs>(defaultPrefs);

  useEffect(() => {
    const existing = loadPrefs();
    if (!existing) {
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
    setPrefs(existing);
  }, []);

  useEffect(() => {
    const open = () => {
      setVisible(false);
      setSettingsOpen(true);
    };
    window.addEventListener("open-cookie-settings", open);
    return () => window.removeEventListener("open-cookie-settings", open);
  }, []);

  const acceptAll = () => {
    const next: CookiePrefs = { essential: true, analytics: true, marketing: true, preferences: true, savedAt: new Date().toISOString() };
    setPrefs(next);
    savePrefs(next);
    setVisible(false);
    setSettingsOpen(false);
  };

  const rejectNonEssential = () => {
    const next = defaultPrefs();
    setPrefs(next);
    savePrefs(next);
    setVisible(false);
    setSettingsOpen(false);
  };

  const saveCurrent = () => {
    const next = { ...prefs, savedAt: new Date().toISOString() };
    setPrefs(next);
    savePrefs(next);
    setVisible(false);
    setSettingsOpen(false);
  };

  const setCategory = (key: CategoryKey, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-x-4 bottom-4 z-[120] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[420px]"
          >
            <div className="rounded-3xl border border-[var(--border-soft)] bg-white p-6 shadow-[var(--shadow-lift)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-md">
                  <Cookie className="h-5 w-5" />
                </div>
                <h3 className="text-[16px] font-bold text-[var(--text-primary)]">We value your privacy</h3>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
                We use essential cookies to keep you signed in and secure, and optional cookies to improve your experience. You can
                choose which to allow.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={acceptAll}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-[14px] font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:-translate-y-0.5 hover:bg-brand-800"
                >
                  <Check className="h-4 w-4" />
                  Accept All Cookies
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={rejectNonEssential}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-base)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:border-brand-300 hover:text-brand-600"
                  >
                    Reject Non-Essential
                  </button>
                  <button
                    onClick={() => {
                      setVisible(false);
                      setSettingsOpen(true);
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-base)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:border-brand-300 hover:text-brand-600"
                  >
                    Customize
                  </button>
                </div>
              </div>
              <p className="mt-4 text-center text-[11px] text-[var(--text-subtle)]">
                See our{" "}
                <a href="/cookies" className="font-semibold text-brand-600 hover:underline">
                  Cookie Policy
                </a>{" "}
                for details.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-[130] flex items-end justify-center p-4 sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsOpen(false)}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 32, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[var(--border-soft)] bg-white shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-[var(--border-soft)] p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)]">Cookie Preferences</h3>
                  <p className="text-[12px] text-[var(--text-subtle)]">Manage how ResuMatch AI uses cookies</p>
                </div>
              </div>

              <div className="max-h-[45vh] space-y-5 overflow-y-auto p-6">
                {CATEGORIES.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-bold text-[var(--text-primary)]">
                        {c.title}
                        {c.required && <span className="ml-2 text-[11px] font-semibold text-accent-700">(Always on)</span>}
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">{c.desc}</p>
                    </div>
                    <Toggle
                      checked={prefs[c.key]}
                      onChange={(v) => setCategory(c.key, v)}
                      disabled={c.required}
                      label={`Toggle ${c.title} cookies`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 sm:flex-row">
                <button
                  onClick={acceptAll}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-brand-600 text-[13px] font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:bg-brand-800"
                >
                  Accept All
                </button>
                <button
                  onClick={saveCurrent}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border-base)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:border-brand-300 hover:text-brand-600"
                >
                  Save Preferences
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
