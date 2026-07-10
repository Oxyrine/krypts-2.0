import { useEffect, useRef } from "react";
import { api } from "./api";

export function useTelemetry(fileId: string) {
  const lastScrubTime = useRef<number>(0);
  const scrubCount = useRef<number>(0);
  const devToolsOpen = useRef<boolean>(false);

  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      api.analytics.submitTelemetry("copy_attempt", { fileId }).catch(() => {});
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && (e.key === "p" || e.key === "s" || e.key === "c")) || e.key === "PrintScreen") {
        api.analytics.submitTelemetry("copy_attempt", { fileId, key: e.key }).catch(() => {});
      }
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C"))) {
        if (!devToolsOpen.current) {
          devToolsOpen.current = true;
          api.analytics.submitTelemetry("dev_tools_opened", { fileId }).catch(() => {});
        }
      }
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [fileId]);

  const reportScrubbing = () => {
    const now = Date.now();
    if (now - lastScrubTime.current < 500) {
      scrubCount.current += 1;
      if (scrubCount.current > 5) {
        api.analytics.submitTelemetry("rapid_scrubbing", { fileId }).catch(() => {});
        scrubCount.current = 0; // Reset after reporting
      }
    } else {
      scrubCount.current = 0;
    }
    lastScrubTime.current = now;
  };

  return { reportScrubbing };
}
