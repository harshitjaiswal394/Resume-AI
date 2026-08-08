import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | ResuMatch AI",
  description: "Read the Terms of Service that govern your use of ResuMatch AI, including accounts, subscriptions, acceptable use, and liability.",
};

export default function TermsPage() {
  return (
    <LegalPage
      badge="Terms of Service"
      title="Terms of Service"
      intro="These Terms of Service govern your access to and use of ResuMatch AI. By signing up, uploading a resume, or otherwise using the Service, you agree to these terms. If you don't agree, please don't use the Service."
      updated="August 8, 2026"
      sections={[
        { id: "acceptance", title: "Acceptance of Terms" },
        { id: "service", title: "About the Service" },
        { id: "accounts", title: "Eligibility & Accounts" },
        { id: "plans", title: "Free & Paid Plans" },
        { id: "acceptable-use", title: "Acceptable Use" },
        { id: "content", title: "Your Content" },
        { id: "ai-output", title: "AI-Generated Output" },
        { id: "ip", title: "Our Intellectual Property" },
        { id: "third-party", title: "Third-Party Services" },
        { id: "disclaimers", title: "Disclaimers" },
        { id: "liability", title: "Limitation of Liability" },
        { id: "indemnification", title: "Indemnification" },
        { id: "termination", title: "Termination" },
        { id: "changes", title: "Changes to These Terms" },
        { id: "law", title: "Governing Law" },
        { id: "contact", title: "Contact Us" },
      ]}
    >
      <LegalSection id="acceptance" number="01" title="Acceptance of Terms">
        <LegalP>
          By accessing or using ResuMatch AI (the <strong className="font-semibold text-[var(--text-primary)]">"Service"</strong>),
          you confirm that you have read, understood, and agree to be bound by these Terms of Service (the{" "}
          <strong className="font-semibold text-[var(--text-primary)]">"Terms"</strong>). These Terms form a binding agreement
          between you and ResuMatch AI. If you use the Service on behalf of an organization, you represent that you have
          authority to bind that organization to these Terms.
        </LegalP>
      </LegalSection>

      <LegalSection id="service" number="02" title="About the Service">
        <LegalP>
          ResuMatch AI provides AI-powered tools that help job seekers analyze their resumes, check ATS compatibility, identify
          missing skills, match against live job descriptions, generate tailored resume versions, and create cover letters. The
          Service processes the resume files and information you provide to generate scores, suggestions, and content.
        </LegalP>
        <LegalP>
          The Service is provided for informational and career-optimization purposes only. We do not guarantee that any resume,
          score, suggestion, or other output will result in an interview, job offer, or employment outcome.
        </LegalP>
      </LegalSection>

      <LegalSection id="accounts" number="03" title="Eligibility & Accounts">
        <LegalP>
          You must be at least 18 years old to use the Service. You are responsible for maintaining the confidentiality of your
          account credentials and for all activity that occurs under your account. You agree to notify us immediately of any
          unauthorized access or use of your account.
        </LegalP>
        <LegalP>
          You may sign in using an email address and password or through a supported third-party provider such as Google. You are
          responsible for ensuring that the information you provide is accurate and up to date.
        </LegalP>
      </LegalSection>

      <LegalSection id="plans" number="04" title="Free & Paid Plans">
        <LegalP>
          The Service is offered under a free plan and paid subscription plan (the{" "}
          <strong className="font-semibold text-[var(--text-primary)]">"Pro Plan"</strong>). Features available on each plan are
          described on our website and may change from time to time.
        </LegalP>
        <LegalList
          items={[
            {
              id: "plans-renewal",
              content: (
                <>
                  The Pro Plan is billed monthly at the price shown at checkout. Subscriptions renew automatically at the end of
                  each billing period unless you cancel before the renewal date.
                </>
              ),
            },
            {
              id: "plans-cancel",
              content: (
                <>
                  You can cancel your subscription at any time from your account or by contacting us. Cancellation takes effect at
                  the end of the current billing period, and you will retain access until then.
                </>
              ),
            },
            {
              id: "plans-refunds",
              content: (
                <>
                  Unless required by applicable law, fees are non-refundable and we do not provide partial refunds for unused
                  portions of a billing period.
                </>
              ),
            },
            {
              id: "plans-price-changes",
              content: (
                <>
                  We may change plan pricing or features with reasonable notice. Price changes apply to the next billing period
                  and do not affect your current period.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="acceptable-use" number="05" title="Acceptable Use">
        <LegalP>You agree not to misuse the Service. Prohibited conduct includes, without limitation:</LegalP>
        <LegalList
          items={[
            {
              id: "use-consent",
              content: (
                <>
                  Uploading resumes or personal information of another person without their consent, or processing data you are
                  not authorized to process.
                </>
              ),
            },
            {
              id: "use-law",
              content: (
                <>
                  Using the Service to violate any applicable law, regulation, or third-party right, including privacy,
                  intellectual property, and data protection rights.
                </>
              ),
            },
            {
              id: "use-scraping",
              content: (
                <>
                  Attempting to access, scrape, or interfere with any part of the Service, its servers, or connected networks
                  through automated means not authorized by us.
                </>
              ),
            },
            {
              id: "use-reverse-engineer",
              content: (
                <>
                  Reverse engineering, decompiling, or otherwise attempting to derive the source code of the Service.
                </>
              ),
            },
            {
              id: "use-malicious",
              content: (
                <>
                  Using the Service to create or transmit malicious content, spam, or any content that is unlawful, defamatory,
                  or fraudulent.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="content" number="06" title="Your Content">
        <LegalP>
          You retain all ownership rights in the resumes, job descriptions, and other information you upload to the Service (your{" "}
          <strong className="font-semibold text-[var(--text-primary)]">"Content"</strong>). We do not claim ownership of your
          Content.
        </LegalP>
        <LegalP>
          By uploading Content, you grant us a non-exclusive, worldwide, royalty-free license to store, process, and use your
          Content solely for the purpose of operating, providing, and improving the Service, including running AI analysis and
          generating outputs. We do not sell your Content to third parties.
        </LegalP>
        <LegalP>
          You are solely responsible for the accuracy, completeness, and legality of your Content and for ensuring that you have
          the rights required to submit it.
        </LegalP>
      </LegalSection>

      <LegalSection id="ai-output" number="07" title="AI-Generated Output">
        <LegalP>
          The Service relies on artificial intelligence models to generate scores, suggestions, rewrites, and other outputs. AI
          output may be inaccurate, incomplete, or unsuitable for a particular use. You are responsible for reviewing any
          AI-generated output before using it on a resume, in an application, or for any other purpose.
        </LegalP>
        <LegalP>
          To the maximum extent permitted by law, we are not responsible for decisions you make based on AI-generated output, and
          we do not warrant that output will be error-free, original, or free of material that could be perceived as misleading.
        </LegalP>
      </LegalSection>

      <LegalSection id="ip" number="08" title="Our Intellectual Property">
        <LegalP>
          The Service, including its software, design, branding, trademarks, and content (other than your Content and third-party
          materials), is owned by or licensed to ResuMatch AI and is protected by intellectual property laws. You may not copy,
          reproduce, distribute, or create derivative works from the Service except as expressly permitted by these Terms or by
          applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection id="third-party" number="09" title="Third-Party Services">
        <LegalP>
          The Service relies on third-party providers for infrastructure, authentication, and AI processing. Your use of the
          Service is subject to the applicable terms and privacy policies of those providers. We are not responsible for the
          availability, performance, or content of any third-party service.
        </LegalP>
      </LegalSection>

      <LegalSection id="disclaimers" number="10" title="Disclaimers">
        <LegalP>
          To the maximum extent permitted by applicable law, the Service is provided on an{" "}
          <strong className="font-semibold text-[var(--text-primary)]">"as is"</strong> and{" "}
          <strong className="font-semibold text-[var(--text-primary)]">"as available"</strong> basis, without warranties of any
          kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the Service will be uninterrupted, secure, or error-free.
        </LegalP>
      </LegalSection>

      <LegalSection id="liability" number="11" title="Limitation of Liability">
        <LegalP>
          To the maximum extent permitted by law, ResuMatch AI and its affiliates, officers, employees, and agents will not be
          liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, data, or
          goodwill, arising out of or in connection with your use of the Service, even if advised of the possibility of such
          damages. Our total aggregate liability arising out of or in connection with these Terms will not exceed the amount you
          paid us in the twelve (12) months preceding the claim, or ₹1,000, whichever is greater.
        </LegalP>
      </LegalSection>

      <LegalSection id="indemnification" number="12" title="Indemnification">
        <LegalP>
          You agree to indemnify, defend, and hold harmless ResuMatch AI and its affiliates, officers, employees, and agents from
          and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in
          connection with your use of the Service, your Content, or your violation of these Terms or applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection id="termination" number="13" title="Termination">
        <LegalP>
          You may stop using the Service at any time and may delete your account by contacting us. We may suspend or terminate
          your access to the Service, in whole or in part, at our discretion, including if you violate these Terms. Upon
          termination, your right to use the Service ceases, and we may delete or retain your data in accordance with our Privacy
          Policy and applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" number="14" title="Changes to These Terms">
        <LegalP>
          We may update these Terms from time to time. When we do, we will revise the "Last updated" date at the top of this page
          and, for material changes, make reasonable efforts to notify you. Your continued use of the Service after changes take
          effect constitutes acceptance of the updated Terms. We encourage you to review these Terms periodically.
        </LegalP>
      </LegalSection>

      <LegalSection id="law" number="15" title="Governing Law">
        <LegalP>
          These Terms are governed by the laws of India. Any disputes arising out of or in connection with these Terms or your use
          of the Service will be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra, India.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number="16" title="Contact Us">
        <LegalP>
          If you have questions about these Terms, you can contact us at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          . ResuMatch AI, Mumbai, Maharashtra, India.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
