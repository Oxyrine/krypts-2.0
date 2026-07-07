"use client"

import { motion } from "framer-motion"
import { Lock, Link as LinkIcon, Fingerprint, Shield } from "lucide-react"

export function SolutionSection() {
  const solutions = [
    {
      icon: <Lock className="h-6 w-6 text-primary" />,
      title: "Hybrid Encryption",
      description: "Military-grade AES-256 encryption applied to your content before it ever reaches the user's browser."
    },
    {
      icon: <Fingerprint className="h-6 w-6 text-primary" />,
      title: "User Binding",
      description: "Content access is cryptographically bound to specific users, browsers, or devices."
    },
    {
      icon: <LinkIcon className="h-6 w-6 text-primary" />,
      title: "Token-based Access",
      description: "Generate short-lived access tokens via our API to grant granular permissions to your users."
    },
    {
      icon: <Shield className="h-6 w-6 text-primary" />,
      title: "Secure Streaming",
      description: "Our custom viewers decode content on-the-fly in memory, preventing unauthorized downloads and scraping."
    }
  ]

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:w-1/2"
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
              A comprehensive shield for your digital assets
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Krypts DRM solves piracy through a layered security approach that is practically invisible to legitimate users while establishing an impenetrable barrier for unauthorized access.
            </p>
            
            <div className="grid sm:grid-cols-2 gap-6">
              {solutions.map((solution, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                    {solution.icon}
                  </div>
                  <h3 className="font-semibold">{solution.title}</h3>
                  <p className="text-sm text-muted-foreground">{solution.description}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:w-1/2 relative"
          >
            <div className="relative rounded-2xl border bg-card/50 p-2 shadow-2xl backdrop-blur-xl">
              <div className="rounded-xl border bg-background/90 p-6 overflow-hidden">
                <div className="flex items-center gap-4 mb-6 border-b pb-4">
                  <div className="h-3 w-3 rounded-full bg-red-500"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                  <div className="text-xs font-mono text-muted-foreground ml-2">Terminal</div>
                </div>
                <div className="space-y-4 font-mono text-sm">
                  <div className="text-green-400">$ node encrypt.js --input course.mp4</div>
                  <div className="text-muted-foreground">Encrypting with AES-256...</div>
                  <div className="text-muted-foreground">Generating master key...</div>
                  <div className="text-blue-400">Success! File secured. UUID: 8f74a...</div>
                  
                  <div className="text-green-400 mt-4">$ curl -X POST https://api.krypts.com/tokens</div>
                  <div className="text-muted-foreground">Creating scoped access token...</div>
                  <div className="break-all text-yellow-400">"{`{ "token": "eyJh...GciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "expiresIn": 3600 }`}"</div>
                </div>
              </div>
            </div>
            
            {/* Decorative background circle */}
            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/20 rounded-full blur-3xl"></div>
          </motion.div>

        </div>
      </div>
    </section>
  )
}
