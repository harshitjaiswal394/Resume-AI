import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalP, LegalList } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | ResuMatch AI",
  description: "Understand ResuMatch AI subscription billing, how to cancel, refund eligibility, and how to request a refund.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      badge="Refund & Cancellation Policy"
      title="Refund & Cancellation Policy"
      intro="This policy explains how billing works on ResuMatch AI, how to cancel your subscription, and when refunds are available. It forms part of our Terms of Service."
      updated="August 8, 2026"
      sections={[
        { id: "overview", title: "Overview" },
        { id: "billing", title: "Subscription Billing" },
        { id: "cancellation", title: "Cancellation" },
        { id: "refunds", title: "Refund Eligibility" },
        { id: "how-to-request", title: "How to Request a Refund" },
        { id: "price-changes", title: "Price Changes" },
        { id: "chargebacks", title: "Chargebacks" },
        { id: "contact", title: "Contact Us" },
      ]}
    >
      <LegalSection id="overview" number="01" title="Overview">
        <LegalP>
          The Pro Plan is a paid subscription billed monthly at ₹299. The Free plan has no charge. This policy explains what
          happens when you upgrade, downgrade, or cancel, and when fees are refundable.
        </LegalP>
      </LegalSection>

      <LegalSection id="billing" number="02" title="Subscription Billing">
        <LegalList
          items={[
            {
              id: "billing-when",
              content: (
                <>
                  Subscriptions are billed in advance at the start of each monthly billing period, at the price shown at checkout.
                </>
              ),
            },
            {
              id: "billing-renewal",
              content: (
                <>
                  Subscriptions renew automatically each month until you cancel. You will be charged the applicable fee at each
                  renewal.
                </>
              ),
            },
            {
              id: "billing-failure",
              content: (
                <>
                  If a payment fails, we will attempt to retry and may notify you. If payment cannot be collected, access to Pro
                  features may be paused until the balance is settled.
                </>
              ),
            },
            {
              id: "billing-taxes",
              content: (
                <>
                  Prices shown may exclude applicable taxes, which will be added at checkout where required by law.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="cancellation" number="03" title="Cancellation">
        <LegalList
          items={[
            {
              id: "cancel-how",
              content: (
                <>
                  You can cancel your subscription at any time by contacting support at{" "}
                  <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
                    support@resumatch.ai
                  </Link>
                  .
                </>
              ),
            },
            {
              id: "cancel-effect",
              content: (
                <>
                  Cancellation takes effect at the end of the current billing period. You keep full Pro access until that date, and
                  it will not renew afterward.
                </>
              ),
            },
            {
              id: "cancel-downgrade",
              content: (
                <>
                  After cancellation, your account moves to the Free plan. Your resumes and analyses remain available under the
                  Free plan's limits.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="refunds" number="04" title="Refund Eligibility">
        <LegalList
          items={[
            {
              id: "refund-default",
              content: (
                <>
                  Unless required by applicable law, subscription fees are non-refundable. We do not provide partial refunds for
                  unused days within a billing period.
                </>
              ),
            },
            {
              id: "refund-discretion",
              content: (
                <>
                  In exceptional circumstances — for example, a billing error or a prolonged Service outage — we may, at our sole
                  discretion, issue a full or partial refund.
                </>
              ),
            },
            {
              id: "refund-legal",
              content: (
                <>
                  Nothing in this policy limits any mandatory consumer rights you may have under applicable law, including Indian
                  consumer protection law or EU consumer law where you are protected by it.
                </>
              ),
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="how-to-request" number="05" title="How to Request a Refund">
        <LegalP>
          To request a refund, email{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>{" "}
          within 14 days of the charge, with your account email and the reason for your request. We will review it and respond
          within a reasonable time. Approved refunds are processed to the original payment method and may take a few business days
          to appear.
        </LegalP>
      </LegalSection>

      <LegalSection id="price-changes" number="06" title="Price Changes">
        <LegalP>
          We may change Pro Plan pricing from time to time. If we do, we will notify you with reasonable notice. Price increases
          apply from the next billing period and never affect the period you have already paid for. If you don't agree with a price
          change, you can cancel before it takes effect.
        </LegalP>
      </LegalSection>

      <LegalSection id="chargebacks" number="07" title="Chargebacks">
        <LegalP>
          If you dispute a charge with your bank or payment provider instead of contacting us first, it may delay resolution. We
          encourage you to reach out to{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>{" "}
          before initiating a chargeback so we can resolve the issue quickly. We may contest chargebacks made without reasonable
          cause, and accounts associated with repeated chargebacks may be suspended.
        </LegalP>
      </LegalSection>

      <LegalSection id="contact" number="08" title="Contact Us">
        <LegalP>
          Billing and refund questions? Contact{" "}
          <Link href="mailto:support@resumatch.ai" className="font-semibold text-brand-600 hover:underline">
            support@resumatch.ai
          </Link>
          . ResuMatch AI, Mumbai, Maharashtra, India.
        </LegalP>
      </LegalSection>
    </LegalPage>
  );
}
