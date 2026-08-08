import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | ResuMatch AI",
  description: "Learn how ResuMatch AI collects, uses, stores, and protects your personal information, including your resume data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      badge="Privacy Policy"
      title="Privacy Policy"
      intro="This Privacy Policy explains how ResuMatch AI ('we', 'us', or 'our') collects, uses, stores, and protects your personal information when you use our Service. We are committed to keeping your resume data and personal information safe and secure."
      updated="August 8, 2026"
      sections={[
        { id: "overview", title: "Overview" },
        { id: "collect", title: "Information We Collect" },
        { id: "use", title: "How We Use Your Information" },
        { id: "share", title: "How We Share Information" },
        { id: "storage", title: "Data Storage & Security" },
        { id: "retention", title: "Data Retention" },
        { id: "rights", title: "Your Rights & Choices" },
        { id: "cookies", title: "Cookies & Similar Technologies" },
        { id: "children", title: "Children's Privacy" },
        { id: "third-party-links", title: "Third-Party Links" },
        { id: "transfers", title: "International Data Transfers" },
        { id: "changes", title: "Changes to This Policy" },
        { id: "contact", title: "Contact Us" },
      ]}
    >
      <LegalSection id="overview" number="01" title="Overview">
        <LegalP>
          ResuMatch AI is an AI-powered resume analysis and optimization service built for job seekers. Because your resume
          contains sensitive personal information, we design our systems around the principle of data minimization: we only
          collect what is needed to operate the Service, and we do not sell your personal information to anyone.
        </LegalP>
      </LegalSection>

      <LegalSection id="collect" number="02" title="Information We Collect">
        <LegalP>
          We collect information you provide directly, information generated through your use of the Service, and limited
          technical information:
        </LegalP>
        <LegalList
          items={[
            {
              id: "collect-account",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Account information.</strong> When you create an
                  account or sign in with Google, we collect your name and email address, and store a secure hash of your password
                  if you sign up with email.
                </>
              ),
            },
            {
              id: "collect-resume",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Resume content.</strong> When you upload a resume
                  (PDF or DOCX), we process its contents, including your contact details, work history, education, skills, and
                  other information in the file. We also store extracted fields, ATS scores, analysis results, tailored versions,
                  and cover letters you generate.
                </>
              ),
            },
            {
              id: "collect-preferences",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Preference information.</strong> Information you
                  provide about your target role, experience level, and location.
                </>
              ),
            },
            {
              id: "collect-usage",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Usage information.</strong> Details of how you use
                  the Service, such as pages visited, features used, and actions taken.
                </>
              ),
            },
            {
              id: "collect-technical",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Technical information.</strong> IP address, browser
                  type, device information, and diagnostic data needed to secure and operate the Service.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="use" number="03" title="How We Use Your Information">
        <LegalP>We use the information we collect to:</LegalP>
        <LegalList
          items={[
            {
              id: "use-provide",
              content: (
                <>
                  Provide, operate, and maintain the Service, including analyzing resumes and generating scores, suggestions, and
                  tailored content.
                </>
              ),
            },
            {
              id: "use-match",
              content: <>Match your resume against job descriptions and show relevant results.</>,
            },
            {
              id: "use-account",
              content: <>Create and manage your account and authenticate your sign-ins.</>,
            },
            {
              id: "use-communicate",
              content: <>Communicate with you about your account, billing, and service updates.</>,
            },
            {
              id: "use-security",
              content: <>Prevent fraud and abuse, and enforce our Terms of Service.</>,
            },
            {
              id: "use-improve",
              content: <>Improve and develop the Service, including refining our AI models and analysis accuracy.</>,
            },
            {
              id: "use-legal",
              content: <>Comply with legal obligations.</>,
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="share" number="04" title="How We Share Information">
        <LegalP>
          We do not sell, rent, or trade your personal information or resume content. We share information only in the following
          limited circumstances:
        </LegalP>
        <LegalList
          items={[
            {
              id: "share-providers",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Service providers.</strong> With trusted vendors
                  who help us operate the Service, such as cloud hosting and authentication providers (for example, Supabase) and
                  AI processing providers. These providers are bound by contract to process data only on our instructions and to
                  protect it.
                </>
              ),
            },
            {
              id: "share-legal",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Legal compliance.</strong> When required by law,
                  court order, or government request, or when we believe disclosure is reasonably necessary to protect the rights,
                  property, or safety of our users or the public.
                </>
              ),
            },
            {
              id: "share-transfers",
              content: (
                <>
                  <strong className="font-semibold text-[var(--text-primary)]">Business transfers.</strong> In connection with a
                  merger, acquisition, or sale of assets, where your information may be transferred as part of the transaction
                  subject to confidentiality obligations.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="storage" number="05" title="Data Storage & Security">
        <LegalP>We take reasonable technical and organizational measures to protect your information, including:</LegalP>
        <LegalList
          items={[
            { id: "storage-https", content: <>Encryption of data in transit using HTTPS.</> },
            { id: "storage-atrest", content: <>Encryption of sensitive data at rest in our databases and file storage.</> },
            {
              id: "storage-access",
              content: (
                <>
                  Restricted access to resume files and analysis data, which is only accessible to authenticated account owners.
                </>
              ),
            },
            { id: "storage-passwords", content: <>Password hashing and secure session management.</> },
          ]}
        />
        <LegalP>
          No method of transmission or storage is completely secure. While we strive to protect your information, we cannot
          guarantee absolute security, and you should never share your account credentials with anyone.
        </LegalP>
      </LegalSection>

      <LegalSection id="retention" number="06" title="Data Retention">
        <LegalP>
          We retain your account information and resume data for as long as your account is active or as needed to provide the
          Service. If you delete a resume from the Service, we remove it from active storage. If you request account deletion, we
          delete your account data, including stored resumes and analyses, unless we are required by law to retain certain records.
          Backups and logs may persist for a limited additional period for security and recovery purposes.
        </LegalP>
      </LegalSection>

      <LegalSection id="rights" number="07" title="Your Rights & Choices">
        <LegalP>
          Depending on your location, you may have rights under applicable data protection laws, including the Digital Personal
          Data Protection Act (India) and, where applicable, the GDPR. These may include the right to:
        </LegalP>
        <LegalList
          items={[
            { id: "rights-access", content: <>Access the personal information we hold about you.</> },
            { id: "rights-correct", content: <>Correct inaccurate or incomplete information.</> },
            { id: "rights-delete", content: <>Request deletion of your account and associated data.</> },
            { id: "rights-consent", content: <>Withdraw consent where processing is based on consent.</> },
            { id: "rights-port", content: <>Receive a copy of your data in a portable format.</> },
          ]}
        />
        <LegalP>
          To exercise any of these rights, contact us at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          . We will respond within the timeframes required by applicable law.
        </LegalP>
      </LegalSection>

      <LegalSection id="cookies" number="08" title="Cookies & Similar Technologies">
        <LegalP>
          We use cookies and similar technologies, including browser local storage, to keep you signed in, remember your
          preferences, and store temporary state such as in-progress resume drafts. These are necessary for the Service to
          function.
        </LegalP>
        <LegalP>
          You can control or delete cookies through your browser settings. Please note that disabling cookies or local storage may
          prevent some parts of the Service from working correctly.
        </LegalP>
      </LegalSection>

      <LegalSection id="children" number="09" title="Children's Privacy">
        <LegalP>
          The Service is not directed to individuals under the age of 18, and we do not knowingly collect personal information
          from children. If you believe a child has provided us with personal information, please contact us at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>{" "}
          and we will take steps to delete it.
        </LegalP>
      </LegalSection>

      <LegalSection id="third-party-links" number="10" title="Third-Party Links">
        <LegalP>
          The Service may contain links to external websites and job postings. We are not responsible for the privacy practices or
          content of those third-party sites. We encourage you to review the privacy policies of any site you visit.
        </LegalP>
      </LegalSection>

      <LegalSection id="transfers" number="11" title="International Data Transfers">
        <LegalP>
          Your information may be processed and stored on servers located outside your country of residence, including through
          third-party providers we use to operate the Service. Where required by law, we rely on appropriate safeguards to protect
          your information when it is transferred across borders.
        </LegalP>
      </LegalSection>

      <LegalSection id="changes" number="12" title="Changes to This Policy">
        <LegalP>
          We may update this Privacy Policy from time to time. We will revise the "Last updated" date at the top of this page and
          notify you of material changes. Your continued use of the Service after changes take effect constitutes acceptance of
          the updated Policy.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number="13" title="Contact Us">
        <LegalP>
          If you have questions, concerns, or requests regarding this Privacy Policy or your data, contact us at{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          . ResuMatch AI, Mumbai, Maharashtra, India.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
