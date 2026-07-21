"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import AiMagnifier from "@/components/AiMagnifier";

export type FitProofIntroPhase = "preparing" | "playing" | "complete";

interface FitProofIntroAnimationProps {
  className?: string;
  onPhaseChange?: (phase: FitProofIntroPhase) => void;
}

const INTRO_SESSION_KEY = "fitproof-brand-intro-v4-ai-scan-played";
const INTRO_DURATION_MS = 4200;
const CAT_COMPANION_FRAME = "/brand/fitproof-cat-companion-cropped.png";
const FITPROOF_LETTERS = Array.from("FitProof");

function shouldReplayOnThisVisit() {
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  return navigation?.type === "reload" || !window.sessionStorage.getItem(INTRO_SESSION_KEY);
}

export default function FitProofIntroAnimation({
  className = "",
  onPhaseChange,
}: FitProofIntroAnimationProps) {
  const [phase, setPhase] = useState<FitProofIntroPhase>("preparing");
  const [logoWidth, setLogoWidth] = useState(220);
  const wordmarkRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const width = wordmarkRef.current?.getBoundingClientRect().width;
      if (width) setLogoWidth(Math.ceil(width));
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  useEffect(() => {
    const companion = new Image();
    companion.src = CAT_COMPANION_FRAME;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldPlay = !reducedMotion && shouldReplayOnThisVisit();

    if (!shouldPlay) {
      setPhase("complete");
      return;
    }

    window.sessionStorage.setItem(INTRO_SESSION_KEY, "true");
    const startFrame = window.requestAnimationFrame(() => setPhase("playing"));
    const finishTimer = window.setTimeout(() => setPhase("complete"), INTRO_DURATION_MS);

    return () => {
      window.cancelAnimationFrame(startFrame);
      window.clearTimeout(finishTimer);
    };
  }, []);

  return (
    <div aria-hidden="true" className={`fitproof-ai-intro is-${phase} ${className}`} style={{ "--fitproof-logo-width": `${logoWidth}px` } as CSSProperties}>
      <div className="fitproof-ai-intro__lockup">
        <div className="fitproof-ai-intro__logo" aria-label="FitProof">
          <span className="fitproof-ai-intro__wordmark" ref={wordmarkRef}>{FITPROOF_LETTERS.map((letter, index) => (
            <span
              className="fitproof-ai-intro__letter"
              key={`${letter}-${index}`}
              style={{ "--fitproof-letter-index": index } as CSSProperties}
            >
              {letter}
            </span>
          ))}</span>
          <AiMagnifier className="fitproof-ai-intro__magnifier" />
        </div>

        <div className="fitproof-ai-intro__line">
          <span className="fitproof-ai-intro__line-fill" />
          <span className="fitproof-ai-intro__line-dot" />
        </div>

        <div className="fitproof-ai-intro__cat">
          <img alt="" className="fitproof-ai-intro__cat-image" draggable={false} src={CAT_COMPANION_FRAME} />
          <span className="fitproof-ai-intro__eye-signal" />
        </div>
      </div>
    </div>
  );
}
