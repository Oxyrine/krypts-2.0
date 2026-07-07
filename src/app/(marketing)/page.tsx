import dynamic from "next/dynamic"
import { GlassEffect, GlassFilter } from "@/components/ui/liquid-glass"

const ShaderAnimation = dynamic(() => import("@/components/ui/shader-animation").then(m => ({ default: m.ShaderAnimation })), { loading: () => <div className="h-full w-full bg-zinc-950" /> })
import { ProblemSection } from "@/components/marketing/problem"
import { SolutionSection } from "@/components/marketing/solution"
import { FeaturesSection } from "@/components/marketing/features"
import { UseCasesSection } from "@/components/marketing/use-cases"
import { IntegrationSection } from "@/components/marketing/integration"
import PricingSection from "@/components/ui/pricing-section-4"
import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="flex flex-col w-full overflow-hidden">
      <GlassFilter />

      {/* Hero with Shader Animation */}
      <section className="relative h-screen w-full">
        <ShaderAnimation />
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-8 px-4 text-center">
          <GlassEffect className="rounded-full px-5 py-2">
            <span className="text-sm font-medium text-white">
              New: Universal API v2.0 Released
            </span>
          </GlassEffect>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-white max-w-3xl">
            The Plug-and-Play <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">DRM Platform</span>
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl">
            Protect your digital content with military-grade encryption, real-time watermarking, and granular access control — all through a simple API.
          </p>

          <div className="flex gap-5">
            <Link href="/signup">
              <GlassEffect className="rounded-2xl px-8 py-4 hover:px-9 hover:py-5 hover:rounded-3xl">
                <span className="text-base font-semibold text-white">Get Started Free</span>
              </GlassEffect>
            </Link>
            <Link href="/dashboard">
              <GlassEffect className="rounded-2xl px-8 py-4 hover:px-9 hover:py-5 hover:rounded-3xl" style={{ background: "rgba(255,255,255,0.05)" }}>
                <span className="text-base font-semibold text-white/90">View Dashboard</span>
              </GlassEffect>
            </Link>
          </div>
        </div>
      </section>
      <ProblemSection />
      <SolutionSection />
      <FeaturesSection />
      <UseCasesSection />
      <IntegrationSection />
      <PricingSection />
    </div>
  )
}
