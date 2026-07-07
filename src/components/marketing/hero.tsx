"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import { motion } from "framer-motion"
import { ArrowRight, ShieldCheck, FileText, Video, Key } from "lucide-react"
import Link from "next/link"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background pt-24 pb-32 md:pt-32 md:pb-40">
      {/* Background gradients */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }}></div>
      </div>

      <div className="container mx-auto px-4 md:px-8 max-w-6xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl"
        >
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20">
              New: Universal API v2.0 Released
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6">
            The Plug-and-Play <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">DRM Platform</span>
          </h1>
          <p className="mt-6 text-xl leading-8 text-muted-foreground mb-10">
            Protect your digital content from piracy and unauthorized sharing. Secure videos, PDFs, images, and API data with enterprise-grade encryption in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className={buttonVariants({ variant: "default", size: "lg", className: "h-12 px-8 w-full sm:w-auto" })}>
              Start Free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/docs" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-8 w-full sm:w-auto bg-background/50 backdrop-blur-sm" })}>
              View Documentation
            </Link>
          </div>
        </motion.div>

        {/* Feature Pills under hero */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-16 sm:mt-24 flex justify-center flex-wrap gap-4 text-sm font-medium text-muted-foreground"
        >
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border shadow-sm"><Video className="h-4 w-4 text-pink-500" /> Video Protection</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border shadow-sm"><FileText className="h-4 w-4 text-blue-500" /> Secure PDFs</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border shadow-sm"><ShieldCheck className="h-4 w-4 text-green-500" /> Dynamic Watermarks</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border shadow-sm"><Key className="h-4 w-4 text-yellow-500" /> API Encryption</div>
        </motion.div>
      </div>
    </section>
  )
}
