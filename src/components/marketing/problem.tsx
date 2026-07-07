"use client"

import { motion } from "framer-motion"
import { AlertTriangle, Copy, DollarSign } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ProblemSection() {
  const problems = [
    {
      icon: <Copy className="h-8 w-8 text-destructive" />,
      title: "Content Piracy",
      description: "Piracy costs creators and content businesses billions annually. When your premium content is easily downloadable, your business model is at risk."
    },
    {
      icon: <AlertTriangle className="h-8 w-8 text-orange-500" />,
      title: "Unauthorized Sharing",
      description: "One paid user often means ten free users through credential sharing and public links, directly impacting your revenue metrics."
    },
    {
      icon: <DollarSign className="h-8 w-8 text-amber-500" />,
      title: "Expensive Enterprise DRM",
      description: "Traditional DRM solutions are complex, require lengthy enterprise sales cycles, and demand deep technical expertise to implement."
    }
  ]

  return (
    <section id="problem" className="py-24 bg-muted/50">
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            The multi-billion dollar problem
          </h2>
          <p className="text-lg text-muted-foreground">
            Building valuable digital content is hard. Protecting it shouldn't be.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {problems.map((problem, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full border-none shadow-md bg-background hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                    {problem.icon}
                  </div>
                  <CardTitle className="text-xl">{problem.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {problem.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
