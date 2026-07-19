"use client"

// Full-screen forensic overlay: renders at opacity 0.02 with mix-blend-mode
// "difference", so each covered pixel's channels shift by roughly
// 0.02 * (255 - 2*bg) -- a few RGB steps, invisible in normal viewing but
// recoverable by the Forensic Scanner's high-pass + contrast-stretch pass.
// Not gated by krypts_watermark_settings -- this layer always renders,
// independent of whether the visible FloatingWatermark is enabled.
//
// Known limitation: on ~50% gray backgrounds the difference term cancels
// out and the mark locally vanishes. Acceptable -- real content is almost
// never uniform mid-gray.
export function InvisibleWatermark({ email }: { email: string }) {
  const displayText = `${email} | ${Date.now().toString(36)} | `
  const gridText = Array(3000).fill(displayText).join("")

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30 overflow-hidden break-all select-none"
      aria-hidden="true"
      style={{
        opacity: 0.02,
        mixBlendMode: "difference",
        color: "#ffffff",
        fontSize: "12px",
        lineHeight: "12px",
        fontFamily: "monospace",
        fontWeight: "bold",
      }}
    >
      {gridText}
    </div>
  )
}
