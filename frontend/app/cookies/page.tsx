import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy | ResuMatch AI",
  description: "Learn how ResuMatch AI uses cookies and similar technologies, what categories we use, and how you can control your preferences.",
};

export default function CookiePolicyPage() {
  return (
    <LegalPage
      badge="Cookie Policy"
      title="Cookie Policy"
      intro="This Cookie Policy explains what cookies and similar technologies ResuMatch AI uses, why we use them, and how you can control them. It works alongside our Privacy Policy and Terms of Service."
      updated="August 8, 2026"
      sections={[
        { id: "what-are-cookies", title: "What Are Cookies" },
        { id: "how-we-use", title: "How We Use Cookies" },
        { id: "categories", title: "Categories of Cookies" },
        { id: "cookies-we-set", title: "Cookies We Set" },
        { id: "third-party", title: "Third-Party Technologies" },
        { id: "your-choices", title: "Your Cookie Choices" },
        { id: "consent", title: "Consent & Withdrawal" },
        { id: "do-not-track", title: "Do Not Track" },
        { id: "changes", title: "Changes to This Policy" },
        { id: "contact", title: "Contact Us" },
      ]}
    >
      <LegalSection id="what-are-cookies" number="01" title="What Are Cookies">
        <LegalP>
          Cookies are small text files that a website stores on your device when you visit. They help the site remember your
          actions and preferences over time. We also use similar technologies such as browser{" "}
          <strong className="font-semibold text-[var(--text-primary)]">local storage</strong>, which works like a cookie but is
          managed directly by the site. In this policy, "cookies" covers both.
        </LegalP>
      </LegalSection>

      <LegalSection id="how-we-use" number="02" title="How We Use Cookies">
        <LegalP>We use cookies to:</LegalP>
        <LegalList
          items={[
            {
              id: "how-auth",
              content: (
                <>
                  Keep you signed in and secure. Your authentication session is stored as an essential cookie by our sign-in
                  provider.
                </>
              ),
            },
            {
              id: "how-drafts",
              content: (
                <>
                  Save in-progress work, such as resume drafts and tailored settings, so you don't lose data between visits.
                </>
              ),
            },
            {
              id: "how-preferences",
              content: (
                <>
                  Remember your choices, such as editor mode, your cookie preferences, and UI settings.
                </>
              ),
            },
            {
              id: "how-improve",
              content: (
                <>
                  Understand how the Service is used so we can improve features and fix issues. We do not currently run third-party
                  analytics trackers.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="categories" number="03" title="Categories of Cookies">
        <LegalList
          items={[
            {
              id: "cat-essential",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Essential.</strong> Required for the Service to
                  function — sign-in, security, and preventing abuse. These are always active and cannot be disabled.
                </>
              ),
            },
            {
              id: "cat-preferences",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Preferences.</strong> Remember your settings and
                  choices. Disabling these may affect how the Service is personalized for you.
                </>
              ),
            },
            {
              id: "cat-analytics",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Analytics.</strong> Help us measure usage patterns in
                  aggregate. We currently rely on our own server logs rather than third-party analytics cookies.
                </>
              ),
            },
            {
              id: "cat-marketing",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Marketing.</strong> Used to show relevant promotions.
                  We do not currently set any third-party advertising or marketing cookies.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="cookies-we-set" number="04" title="Cookies We Set">
        <LegalList
          items={[
            {
              id: "set-session",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Authentication session.</strong> Set by our sign-in
                  provider (Supabase) to keep you logged in. Category: Essential.
                </>
              ),
            },
            {
              id: "set-consent",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Cookie consent preference.</strong> Stores your cookie
                  choices (e.g., "rm_cookie_consent_v1") in local storage. Category: Essential.
                </>
              ),
            },
            {
              id: "set-drafts",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Draft state.</strong> Temporary resume drafts and
                  tailored-view settings stored in local storage. Category: Preferences.
                </>
              ),
            },
            {
              id: "set-mode",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Interface preferences.</strong> Editor and display
                  mode choices. Category: Preferences.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="third-party" number="05" title="Third-Party Technologies">
        <LegalP>
          We use third-party service providers to operate the Service, including{" "}
          <strong className="font-semibold text-[var(--text-primary)]">Supabase</strong> (authentication and database) and our
          hosting and AI processing providers. These providers may set essential cookies required for authentication and security
          when you sign in. They do not use cookies for advertising on our Service. Their own use of data is governed by their
          respective privacy policies.
        </LegalP>
      </LegalSection>

      <LegalSection id="your-choices" number="06" title="Your Cookie Choices">
        <LegalP>You can control cookies in several ways:</LegalP>
        <LegalList
          items={[
            {
              id: "choices-banner",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Consent banner.</strong> When you first visit, we show
                  a banner where you can Accept All, Reject Non-Essential, or Customize your preferences.
                </>
              ),
            },
            {
              id: "choices-settings",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Cookie settings.</strong> You can reopen your
                  preferences at any time from the "Cookie Settings" link in the footer of our website.
                </>
              ),
            },
            {
              id: "choices-browser",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Browser controls.</strong> Most browsers let you
                  block or delete cookies and clear local storage. Please note that disabling essential cookies may prevent you
                  from signing in or using parts of the Service.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="consent" number="07" title="Consent & Withdrawal">
        <LegalP>
          For non-essential cookies, we request your consent before setting them. If you accept, you can change your mind at any
          time by using the Cookie Settings link in the footer or by clearing cookies in your browser. Withdrawing consent does not
          affect the lawfulness of processing based on consent before its withdrawal.
        </LegalP>
      </LegalSection>

      <LegalSection id="do-not-track" number="08" title="Do Not Track">
        <LegalP>
          Some browsers transmit "Do Not Track" (DNT) signals. Because there is not yet a common standard for how websites should
          respond to these signals, we currently do not respond to DNT headers. We do, however, honor the choices you make through
          our consent banner and cookie settings.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" number="09" title="Changes to This Policy">
        <LegalP>
          We may update this Cookie Policy from time to time. We will revise the "Last updated" date at the top of this page and,
          for material changes, notify you through the Service. If your consent is required for new categories of cookies, we will
          ask for it before using them.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number="10" title="Contact Us">
        <LegalP>
          Questions about this Cookie Policy or your cookie choices? Email us at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          . ResuMatch AI, Mumbai, Maharashtra, India.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
