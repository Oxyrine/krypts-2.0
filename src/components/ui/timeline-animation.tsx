"use client"

import { cn } from "@/lib/utils"
import { motion, Variants } from "framer-motion"
import React, { RefObject } from "react"

interface TimelineContentProps {
  children: React.ReactNode
  animationNum: number
  timelineRef: RefObject<HTMLDivElement | null>
  className?: string
  as?: React.ElementType
  customVariants?: Variants
}

export function TimelineContent({
  children,
  animationNum,
  timelineRef,
  className,
  as: Component = "div",
  customVariants,
}: TimelineContentProps) {
  const defaultVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 20,
      filter: "blur(10px)",
    },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        delay: i * 0.3,
        duration: 0.5,
      },
    }),
  }

  const variants = customVariants || defaultVariants

  return (
    <motion.div
      custom={animationNum}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={variants}
      className={cn(className)}
    >
      {Component !== "div" ? (
        <Component>{children}</Component>
      ) : (
        children
      )}
    </motion.div>
  )
}
