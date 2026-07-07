"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { Check, Info } from "lucide-react"

export function PricingSection() {
  const tiers = [
    {
      name: "Starter",
      description: "For small teams and creators starting out.",
      price: "$49",
      features: [
        "Up to 1,000 active token sessions/mo",
        "Video & PDF Protection",
        "Basic Watermarking",
        "Community Support",
        "Standard API Rate Limits"
      ],
    },
    {
      name: "Pro",
      description: "For growing platforms with scale needs.",
      price: "$199",
      popular: true,
      features: [
        "Up to 25,000 active token sessions/mo",
        "All file types + API Payload Encryption",
        "Advanced Dynamic Watermarking",
        "Priority Email Support",
        "Advanced Analytics & Webhooks",
        "Custom CNAME branding"
      ]
    },
    {
      name: "Enterprise",
      description: "For large organizations and high volume.",
      price: "Custom",
      features: [
        "Unlimited sessions",
        "Dedicated infrastructure",
        "Custom integrations",
        "24/7 Phone Support",
        "SLA Guarantee",
        "SOC2 Compliance Reporting"
      ]
    }
  ]

  return (
    <section id="pricing" className="py-24 bg-muted/20">
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-muted-foreground">
            Start protecting your content today with our straightforward plans. Scale seamlessly as your platform grows.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative flex flex-col rounded-3xl p-8 shadow-sm ring-1 ${tier.popular ? 'bg-background ring-primary/50 shadow-xl scale-105 z-10' : 'bg-background ring-border'}`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase text-primary-foreground tracking-wide">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-xl font-bold">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mt-2 min-h-10">{tier.description}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tracking-tight">{tier.price}</span>
                  {tier.price !== "Custom" && <span className="text-sm font-semibold text-muted-foreground">/month</span>}
                </div>
              </div>
              
              <ul className="flex-1 space-y-4 text-sm mb-8">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex gap-3 text-muted-foreground items-start">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button 
                variant={tier.popular ? "default" : "outline"} 
                className={`w-full ${tier.popular ? '' : 'bg-background'}`}
                size="lg"
              >
                {tier.name === "Enterprise" ? "Contact Sales" : "Get Started"}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
