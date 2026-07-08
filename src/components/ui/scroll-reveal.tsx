"use client";

import { useEffect, useRef } from "react";

/**
 * ScrollReveal — wraps its children in a div and toggles
 * the `is-visible` class (via IntersectionObserver) to drive
 * CSS fade+slide animations.
 *
 * Uses CSS transitions (globals.css .reveal-hidden/.is-visible)
 * so it NEVER affects layout. If JS fails the child is always visible
 * because we add `reveal-hidden` only after mount.
 */
export function ScrollReveal({
  children,
  className = "",
  stagger = false,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Add the hidden class only after mount so SSR/no-JS shows content
    el.classList.add("reveal-hidden");
    if (stagger) el.classList.add("reveal-stagger");

    // Small initial delay so the class is painted before observer fires
    const timer = setTimeout(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            el.classList.add("is-visible");
            observer.disconnect(); // only animate once
          }
        },
        { threshold: 0.12 }
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, stagger]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
