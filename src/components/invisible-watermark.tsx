"use client"

// Full-screen forensic overlay: a plain low-opacity (0.01) text layer,
// imperceptible during normal viewing. Deliberately a straightforward alpha
// blend (not mix-blend-mode tricks) so the Forensic Scanner can recover it
// the same way it recovers the server-side image watermark: a levels/
// contrast boost on a captured screenshot, not a high-pass difference scheme.
// Not gated by krypts_watermark_settings -- this layer always renders,
// independent of whether the visible FloatingWatermark is enabled.
//
// Mid-gray text gives some contrast against both light and dark video/PDF
// content, since the actual brightness can't be sampled per-frame like the
// server-side image path does.
export function InvisibleWatermark({ email }: { email: string }) {
  const displayText = `${email} | ${Date.now().toString(36)}`
  // Blank-line gaps between repetitions -- packing them as one continuous
  // wrapped string (no separation at all) made repetitions run directly
  // into each other once revealed, reading as illegible noise instead of
  // legible repeated lines.
  const gridText = Array(60).fill(displayText).join("\n\n\n\n")

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30 overflow-hidden select-none"
      aria-hidden="true"
      style={{
        opacity: 0.05,
        color: "#808080",
        fontSize: "14px",
        lineHeight: "14px",
        fontFamily: "monospace",
        fontWeight: "bold",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        padding: "16px",
      }}
    >
      {gridText}
    </div>
  )
}
