"use client"

import { motion } from "framer-motion"
import { Video, FileText, Image as ImageIcon, Database } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function FeaturesSection() {
  const features = [
    {
      icon: <Video className="h-6 w-6" />,
      title: "Video DRM",
      description: "Custom encrypted video player that prevents downloads, blocks screen recording systems, and streams adaptive bitrates.",
      color: "text-pink-500",
      bg: "bg-pink-500/10"
    },
    {
      icon: <FileText className="h-6 w-6" />,
      title: "PDF Protection",
      description: "Secure PDF viewer that renders pages on-client. Disables right-click, removes print functionality, and applies dynamic DOM overlays.",
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      icon: <ImageIcon className="h-6 w-6" />,
      title: "Image Guard",
      description: "Watermark overlay system, obfuscated URLs, and right-click-save prevention for valuable visual assets.",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10"
    },
    {
      icon: <Database className="h-6 w-6" />,
      title: "API Data Encryption",
      description: "Encrypt JSON payloads before they hit the wire. Ensure only authorized frontend clients can decrypt your valuable API responses.",
      color: "text-purple-500",
      bg: "bg-purple-500/10"
    }
  ]

  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Protect any digital format
          </h2>
          <p className="text-lg text-muted-foreground">
            Whether you're selling video courses, proprietary research PDFs, or high-value API data, we have a specialized protection module for your stack.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Card className="h-full border bg-card/50 backdrop-blur hover:bg-card transition-colors">
                <CardHeader>
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.bg} ${feature.color}`}>
                    {feature.icon}
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
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
