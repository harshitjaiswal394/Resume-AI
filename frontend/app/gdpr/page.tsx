import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "GDPR Compliance | ResuMatch AI",
  description: "How ResuMatch AI complies with the EU General Data Protection Regulation (GDPR) — data we process, legal bases, your rights, and how to exercise them.",
};

export default function GdprPage() {
  return (
    <LegalPage
      badge="GDPR Compliance"
      title="GDPR Compliance"
      intro="The EU General Data Protection Regulation (GDPR) protects the personal data of individuals in the European Economic Area (EEA) and the UK. This page explains how ResuMatch AI processes personal data under the GDPR and the rights available to you."
      updated="August 8, 2026"
      sections={[
        { id: "controller", title: "Data Controller" },
        { id: "data-we-process", title: "Personal Data We Process" },
        { id: "legal-bases", title: "Legal Bases for Processing" },
        { id: "rights", title: "Your GDPR Rights" },
        { id: "exercising", title: "How to Exercise Your Rights" },
        { id: "transfers", title: "International Transfers" },
        { id: "automated", title: "Automated Decision-Making" },
        { id: "retention", title: "Data Retention" },
        { id: "security", title: "Data Security" },
        { id: "complaints", title: "Right to Complain" },
        { id: "contact", title: "Contact Us" },
      ]}
    >
      <LegalSection id="controller" number="01" title="Data Controller">
        <LegalP>
          ResuMatch AI is the data controller responsible for the personal data we process through the Service. For any GDPR
          questions, you can contact us at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          . ResuMatch AI, Mumbai, Maharashtra, India.
        </LegalP>
      </LegalSection>

      <LegalSection id="data-we-process" number="02" title="Personal Data We Process">
        <LegalP>When you use the Service, we may process the following categories of personal data:</LegalP>
        <LegalList
          items={[
            { id: "data-identity", content: <>Identity data — name, email address, and account identifiers.</> },
            {
              id: "data-resume",
              content: (
                <>
                  Resume data — the contents of uploaded resumes, including contact details, employment history, education, and
                  skills, as well as analyses and tailored versions we generate.
                </>
              ),
            },
            {
              id: "data-usage",
              content: (
                <>
                  Usage data — how you interact with the Service, pages visited, and features used.
                </>
              ),
            },
            {
              id: "data-technical",
              content: (
                <>
                  Technical data — IP address, browser type, device information, and diagnostic logs.
                </>
              ),
            },
          ]}
        />
        <LegalP>
          We process personal data only as described in our{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            Privacy Policy
          </Link>
          . We do not sell personal data, and we do not use it for advertising purposes.
        </LegalP>
      </LegalSection>

      <LegalSection id="legal-bases" number="03" title="Legal Bases for Processing">
        <LegalP>Under the GDPR, we rely on the following legal bases:</LegalP>
        <LegalList
          items={[
            {
              id: "basis-contract",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Performance of a contract.</strong> To provide the
                  Service you sign up for — processing resumes, generating analyses, and managing your account.
                </>
              ),
            },
            {
              id: "basis-consent",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Consent.</strong> For non-essential cookies and any
                  optional communications. You can withdraw consent at any time.
                </>
              ),
            },
            {
              id: "basis-legitimate",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Legitimate interests.</strong> To keep the Service
                  secure, prevent fraud, and improve our product, balanced against your rights and interests.
                </>
              ),
            },
            {
              id: "basis-legal",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Legal obligation.</strong> Where we are required to
                  retain or disclose data to comply with applicable law.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="rights" number="04" title="Your GDPR Rights">
        <LegalP>
          You have the following rights in relation to your personal data, subject to applicable limitations under Article 23 of
          the GDPR:
        </LegalP>
        <LegalList
          items={[
            { id: "right-access", content: <><strong className="font-semibold text-[var(--text-primary)]">Access</strong> — request a copy of the personal data we hold about you.</> },
            { id: "right-rectify", content: <><strong className="font-semibold text-[var(--text-primary)]">Rectification</strong> — correct inaccurate or incomplete data.</> },
            { id: "right-erase", content: <><strong className="font-semibold text-[var(--text-primary)]">Erasure</strong> — request deletion of your data, subject to legal retention requirements.</> },
            { id: "right-restrict", content: <><strong className="font-semibold text-[var(--text-primary)]">Restriction</strong> — restrict how we process your data in certain circumstances.</> },
            { id: "right-port", content: <><strong className="font-semibold text-[var(--text-primary)]">Data portability</strong> — receive your data in a structured, machine-readable format.</> },
            { id: "right-object", content: <><strong className="font-semibold text-[var(--text-primary)]">Object</strong> — object to processing based on legitimate interests, including profiling.</> },
            { id: "right-withdraw", content: <><strong className="font-semibold text-[var(--text-primary)]">Withdraw consent</strong> — withdraw any consent you previously gave, at any time.</> },
          ]}
        />
      </LegalSection>

      <LegalSection id="exercising" number="05" title="How to Exercise Your Rights">
        <LegalP>
          To exercise any of these rights, email{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>{" "}
          with your request. We will respond within one month, as required by the GDPR. We may need to verify your identity before
          processing your request, and we may extend the response period by a further two months for complex requests, as
          permitted by law. Account deletion is also available by contacting us.
        </LegalP>
      </LegalSection>

      <LegalSection id="transfers" number="06" title="International Transfers">
        <LegalP>
          Your personal data may be processed on servers located outside the EEA, including in India and the United States, where
          our infrastructure and service providers are based. Where personal data is transferred outside the EEA or UK, we rely on
          appropriate safeguards, such as the European Commission's Standard Contractual Clauses, to ensure your data remains
          protected to a standard equivalent to the GDPR.
        </LegalP>
      </LegalSection>

      <LegalSection id="automated" number="07" title="Automated Decision-Making">
        <LegalP>
          The Service uses artificial intelligence to analyze resumes and generate scores, suggestions, and tailored content.
          These outputs are provided to you for review, and no decision that produces legal effects or significantly affects you is
          made solely on automated processing. You decide how to use the content we generate, and you can always request human
          involvement by contacting us.
        </LegalP>
      </LegalSection>

      <LegalSection id="retention" number="08" title="Data Retention">
        <LegalP>
          We retain personal data only as long as needed to provide the Service or as required by law. Account and resume data are
          deleted when you request account deletion, subject to statutory retention periods for records such as billing invoices.
          Our retention practices are described in our Privacy Policy.
        </LegalP>
      </LegalSection>

      <LegalSection id="security" number="09" title="Data Security">
        <LegalP>
          We implement appropriate technical and organizational measures to protect personal data, including encryption in transit
          and at rest, restricted access controls, and secure session management. While no system is completely secure, we
          continually review and improve our safeguards and notify regulators and affected individuals where legally required in
          the event of a personal data breach.
        </LegalP>
      </LegalSection>

      <LegalSection id="complaints" number="10" title="Right to Complain">
        <LegalP>
          If you are located in the EEA or the UK and believe our processing of your personal data violates the GDPR, you have the
          right to lodge a complaint with your local supervisory authority. You can find the contact details of your national data
          protection authority on the European Data Protection Board website. We would, however, appreciate the chance to address
          your concerns first — please contact us at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          .
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number="11" title="Contact Us">
        <LegalP>
          For any GDPR-related inquiries, including data subject requests, contact our team at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          . ResuMatch AI, Mumbai, Maharashtra, India.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
