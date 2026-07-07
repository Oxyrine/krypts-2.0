"use client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    description:
      "For small teams and creators starting out with content protection.",
    price: 49,
    yearlyPrice: 470,
    buttonText: "Get started",
    popular: false,
    includes: [
      "Up to 1,000 active sessions/mo",
      "Video & PDF protection",
      "Basic watermarking",
      "AES-256 encryption",
      "Email support",
    ],
  },
  {
    name: "Business",
    description:
      "Best value for growing businesses that need advanced DRM features.",
    price: 149,
    yearlyPrice: 1430,
    buttonText: "Get started",
    popular: true,
    includes: [
      "Up to 25,000 active sessions/mo",
      "All content types supported",
      "Dynamic watermarking",
      "Suspicious behavior detection",
      "API access & webhooks",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    description:
      "Advanced security and unlimited access for large teams and platforms.",
    price: 499,
    yearlyPrice: 4790,
    buttonText: "Contact sales",
    popular: false,
    includes: [
      "Unlimited sessions",
      "Custom encryption policies",
      "Multi-tenant management",
      "Dedicated account manager",
      "SLA guarantee",
      "Custom integrations",
      "SSO & audit logs",
    ],
  },
];

const PricingSwitch = ({ onSwitch }: { onSwitch: (value: string) => void }) => {
  const [selected, setSelected] = useState("0");

  const handleSwitch = (value: string) => {
    setSelected(value);
    onSwitch(value);
  };

  return (
    <div className="flex justify-center">
      <div className="relative z-10 mx-auto flex w-fit rounded-full bg-muted border border-border p-1">
        <button
          onClick={() => handleSwitch("0")}
          className={cn(
            "relative z-10 w-fit h-10 rounded-full sm:px-6 px-3 sm:py-2 py-1 font-medium transition-colors",
            selected === "0" ? "text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {selected === "0" && (
            <motion.span
              layoutId={"switch"}
              className="absolute top-0 left-0 h-10 w-full rounded-full bg-primary shadow-sm"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative">Monthly</span>
        </button>

        <button
          onClick={() => handleSwitch("1")}
          className={cn(
            "relative z-10 w-fit h-10 flex-shrink-0 rounded-full sm:px-6 px-3 sm:py-2 py-1 font-medium transition-colors",
            selected === "1" ? "text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {selected === "1" && (
            <motion.span
              layoutId={"switch"}
              className="absolute top-0 left-0 h-10 w-full rounded-full bg-primary shadow-sm"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative flex items-center gap-2">
            Yearly
            <span className={cn(
              "text-xs font-semibold px-1.5 py-0.5 rounded-full",
              selected === "1" ? "bg-primary-foreground/20" : "bg-primary/10 text-primary"
            )}>
              Save 20%
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};

export default function PricingSection6() {
  const [isYearly, setIsYearly] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);

  const togglePricingPeriod = (value: string) =>
    setIsYearly(Number.parseInt(value) === 1);

  return (
    <section
      id="pricing"
      className="py-24 md:py-32 mx-auto relative bg-background"
      ref={pricingRef}
    >
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <article className="text-center mb-16 max-w-2xl mx-auto space-y-4">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground"
          >
            Simple, transparent pricing
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-muted-foreground text-lg"
          >
            Choose the plan that fits your content protection needs. All plans include AES-256 encryption and real-time analytics.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <PricingSwitch onSwitch={togglePricingPeriod} />
          </motion.div>
        </article>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              whileHover={{ y: -6 }}
              className="h-full"
            >
              <Card
                className={cn(
                  "relative h-full transition-all duration-300",
                  plan.popular
                    ? "border-primary shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/15"
                    : "hover:border-foreground/20 hover:shadow-lg hover:shadow-foreground/5"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30">
                    <span className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader className="text-left pb-2">
                  <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-3">
                    <span className="text-4xl font-bold text-foreground">
                      $
                      <NumberFlow
                        format={{
                          currency: "USD",
                        }}
                        value={isYearly ? plan.yearlyPrice : plan.price}
                        className="text-4xl font-bold"
                      />
                    </span>
                    <span className="text-muted-foreground text-sm">
                      /{isYearly ? "year" : "month"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                </CardHeader>

                <CardContent className="pt-4">
                  <Link href="/signup" className="block">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "w-full py-3 px-4 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer",
                        plan.popular
                          ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                      )}
                    >
                      {plan.buttonText}
                    </motion.button>
                  </Link>

                  <ul className="space-y-3 mt-6 pt-6 border-t border-border">
                    {plan.includes.map((feature, featureIndex) => (
                      <li
                        key={featureIndex}
                        className="flex items-start gap-3"
                      >
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
