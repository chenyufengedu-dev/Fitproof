"use client";

import { useEffect, useState, type CSSProperties } from "react";

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
    <div aria-hidden="true" className={`fitproof-ai-intro is-${phase} ${className}`}>
      <div className="fitproof-ai-intro__lockup">
        <div className="fitproof-ai-intro__logo" aria-label="FitProof">
          {FITPROOF_LETTERS.map((letter, index) => (
            <span
              className="fitproof-ai-intro__letter"
              key={`${letter}-${index}`}
              style={{ "--fitproof-letter-index": index } as CSSProperties}
            >
              {letter}
            </span>
          ))}
          <span className="fitproof-ai-intro__scanner" />
        </div>

        <div className="fitproof-ai-intro__line">
          <span className="fitproof-ai-intro__line-fill" />
          <span className="fitproof-ai-intro__line-dot" />
        </div>

        <div className="fitproof-ai-intro__cat">
          <img alt="" className="fitproof-ai-intro__cat-image" draggable={false} src={CAT_COMPANION_FRAME} />
          <span className="fitproof-ai-intro__eye-signal" />
          <span className="fitproof-ai-intro__scan-ray" />
        </div>
      </div>
    </div>
  );
}
