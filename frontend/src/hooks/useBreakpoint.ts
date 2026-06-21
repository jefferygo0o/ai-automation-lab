import { useEffect, useState } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "desktop";
    return compute(window.innerWidth);
  });

  useEffect(() => {
    function onResize() {
      setBp(compute(window.innerWidth));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return bp;
}

function compute(w: number): Breakpoint {
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}