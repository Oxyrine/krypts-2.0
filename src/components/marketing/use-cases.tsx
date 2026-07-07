"use client"

import { motion } from "framer-motion"
import { GraduationCap, Briefcase, Camera, Building2 } from "lucide-react"

export function UseCasesSection() {
  const cases = [
    {
      title: "EdTech Platforms",
      icon: <GraduationCap className="h-6 w-6" />,
      description: "Prevent course videos and proprietary workbooks from ending up on torrent sites.",
      stats: "Reduce piracy by 99%"
    },
    {
      title: "SaaS Founders",
      icon: <Briefcase className="h-6 w-6" />,
      description: "Secure premium reports, market data, and proprietary API feeds from being scraped.",
      stats: "Protect core IP"
    },
    {
      title: "Content Creators",
      icon: <Camera className="h-6 w-6" />,
      description: "Ensure that paid subscriber content isn't shared freely on social media platforms.",
      stats: "Enforce paid access"
    },
    {
      title: "Enterprises",
      icon: <Building2 className="h-6 w-6" />,
      description: "Secure confidential board decks, financials, and internal training materials from leaks.",
      stats: "Enterprise compliance"
    }
  ]

  return (
    <section id="use-cases" className="py-24 bg-muted/30 border-y">
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for digital businesses
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cases.map((useCase, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative p-6 rounded-2xl bg-background border shadow-sm group hover:border-primary/50 transition-colors"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {useCase.icon}
              </div>
              <h3 className="text-lg font-semibold mb-2">{useCase.title}</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {useCase.description}
              </p>
              <div className="absolute bottom-6 left-6 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
                {useCase.stats}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
