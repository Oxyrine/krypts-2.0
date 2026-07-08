import { HeroGsap } from "@/components/marketing/hero-gsap"
import { ProblemSection } from "@/components/marketing/problem"
import { SolutionSection } from "@/components/marketing/solution"
import { FeaturesSection } from "@/components/marketing/features"
import { UseCasesSection } from "@/components/marketing/use-cases"
import { IntegrationSection } from "@/components/marketing/integration"
import PricingSection from "@/components/ui/pricing-section-4"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="flex flex-col w-full overflow-hidden bg-just-black font-mori">

      {/* 1. GSAP Hero — word reveal + highlighter swipe + CSS blobs */}
      <HeroGsap />

      {/* 2. Existing sections — each wrapped in ScrollReveal for a gentle
              fade-up as it enters the viewport. The sections themselves
              are unchanged so nothing can break their internal layout. */}
      <ScrollReveal>
        <ProblemSection />
      </ScrollReveal>

      <ScrollReveal delay={50}>
        <SolutionSection />
      </ScrollReveal>

      <ScrollReveal delay={50}>
        <FeaturesSection />
      </ScrollReveal>

      <ScrollReveal delay={50}>
        <UseCasesSection />
      </ScrollReveal>

      <ScrollReveal delay={50}>
        <IntegrationSection />
      </ScrollReveal>

      {/* 3. Desktop App Download Banner */}
      <ScrollReveal>
        <section className="py-32 bg-just-black border-y border-surface-25 font-mori">
          <div className="container mx-auto px-6 max-w-[1280px] flex flex-col md:flex-row items-center justify-between gap-12">
            
            <div className="space-y-6 text-center md:text-left max-w-2xl">
              <div className="text-[16px] md:text-[19px] text-surface-cream">
                {"{ Maximum protection on Windows }"}
              </div>
              
              <h2 className="text-[44px] md:text-[66px] font-semibold leading-[1.1] tracking-[-0.01em] text-surface-cream">
                OS-Level Security
              </h2>
              
              <p className="text-[19px] md:text-[23px] leading-[1.38] text-surface-50">
                The Krypts desktop app adds OS-level screenshot blocking — your content
                appears as a solid black screen in Snipping Tool, OBS, Zoom, and Discord screen shares.
              </p>
              
              <ul className="flex flex-wrap gap-6 justify-center md:justify-start text-[16px] pt-4">
                {["Screenshot blocking", "Screen-record protection", "DevTools disabled", "No right-click"].map(f => (
                  <li key={f} className="flex items-center gap-2 text-surface-cream">
                    <span className="text-shockingly-green">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col items-center gap-4 shrink-0 mt-8 md:mt-0">
              <a
                href="https://github.com/Oxyrine/krypts-2.0/releases/download/v0.1.0/Krypts.DRM.Setup.0.1.0.exe"
                download
                className="group relative inline-flex rounded-[100px] p-[1.5px] bg-gradient-to-r from-shockingly-green to-light-green transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="flex items-center gap-2 px-8 py-5 rounded-[100px] bg-just-black text-[18px] font-semibold text-surface-cream group-hover:bg-transparent transition-colors duration-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                  Download for Windows
                </span>
              </a>
              <p className="text-[14px] text-surface-50 mt-4">v0.1.0 · Windows 10/11 x64 · 319 MB</p>
              <a
                href="https://github.com/Oxyrine/krypts-2.0/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] text-surface-50 hover:text-surface-cream transition-colors mt-1"
              >
                View release notes on GitHub →
              </a>
            </div>
            
          </div>
        </section>
      </ScrollReveal>

      <PricingSection />
    </div>
  )
}
