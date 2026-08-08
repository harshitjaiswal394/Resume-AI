import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { BlogExplorer } from "@/components/marketing/BlogExplorer";

export const metadata: Metadata = {
  title: "Career Blog | ResuMatch AI",
  description: "India-focused career advice: resume strategies, interview preparation, salary negotiation, and job market trends from the ResuMatch AI team.",
};

export default function BlogPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Career Blog"
        title="Career advice built on"
        highlight="real job data"
        subtitle="Resume strategies, interview tactics, and salary insights from the team analyzing thousands of Indian resumes and live job postings every day."
      />
      <BlogExplorer />
    </MarketingShell>
  );
}
