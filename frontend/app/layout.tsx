import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/ClientLayout";
import { BrowserTracing } from "@/components/BrowserTracing";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ResuMatch AI - Indian Resume Optimizer",
  description: "Optimize your resume for the Indian job market with AI-powered ATS scoring and job matching.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        <BrowserTracing />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
