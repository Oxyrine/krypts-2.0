"use client"

import { motion } from "framer-motion"
import { ArrowRight, Upload, Lock, Key, PlaySquare } from "lucide-react"

export function IntegrationSection() {
  const steps = [
    {
      icon: <Upload className="h-5 w-5" />,
      title: "1. Upload",
      description: "Upload your content via Dashboard or REST API."
    },
    {
      icon: <Lock className="h-5 w-5" />,
      title: "2. Encrypt",
      description: "We automatically encode and securely encrypt it."
    },
    {
      icon: <Key className="h-5 w-5" />,
      title: "3. Issue Token",
      description: "Your backend requests a short-lived JWT token."
    },
    {
      icon: <PlaySquare className="h-5 w-5" />,
      title: "4. Stream",
      description: "The user views the content securely via our pre-built components."
    }
  ]

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Plug-and-play workflow
          </h2>
          <p className="text-lg text-muted-foreground">
            Integrating DRM used to take months. With Krypts, it takes hours. Drop our React SDK into your app and hit the ground running.
          </p>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-border -translate-y-1/2 z-0"></div>
          
          <div className="grid md:grid-cols-4 gap-8 relative z-10">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="flex flex-col items-center text-center"
              >
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-background border-2 border-primary shadow-lg">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
