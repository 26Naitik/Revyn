import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { LeakSection } from "@/components/landing/LeakSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { IntelligenceSection } from "@/components/landing/IntelligenceSection";
import { GuardrailsSection } from "@/components/landing/GuardrailsSection";
import { IntegrationSection } from "@/components/landing/IntegrationSection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Revyn — Revenue recovery infrastructure",
  description:
    "Revyn detects payment risk, chooses the right recovery action, and turns failed payments into recovered revenue.",
};

export default function Home() {
  return (
    <div className="min-h-dvh bg-canvas">
      <LandingNav />
      <main>
        <Hero />
        <LeakSection />
        <HowItWorks />
        <IntelligenceSection />
        <GuardrailsSection />
        <IntegrationSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
