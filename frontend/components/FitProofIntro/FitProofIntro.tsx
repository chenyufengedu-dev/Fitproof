"use client";

import { useEffect, useState } from "react";

interface FitProofIntroProps {
  className?: string;
}

type IntroPhase = "preparing" | "playing" | "complete";

const INTRO_SESSION_KEY = "fitproof-brand-intro-v3-companion-played";
const INTRO_DURATION_MS = 2600;
const CAT_COMPANION_FRAME = "/brand/fitproof-cat-companion-cropped.png";

function shouldReplayOnThisVisit() {
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  return navigation?.type === "reload" || !window.sessionStorage.getItem(INTRO_SESSION_KEY);
}

export default function FitProofIntro({ className = "" }: FitProofIntroProps) {
  const [phase, setPhase] = useState<IntroPhase>("preparing");

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
    <div
      aria-hidden="true"
      className={`fitproof-intro is-${phase} ${className}`}
      data-fitproof-title-animation
    >
      <div className="fitproof-intro__lockup">
        <div className="fitproof-intro__logo-mask">
          <span className="fitproof-wordmark">FitProof</span>
        </div>

        <svg
          className="fitproof-intro__line"
          viewBox="0 0 220 10"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="fitproof-intro__line-track"
            pathLength="1"
            d="M0 5 H220"
          />
          <path
            className="fitproof-intro__line-path"
            pathLength="1"
            d="M0 5 H220"
          />
        </svg>

        <div className="fitproof-intro__cat-companion">
          <img
            alt=""
            aria-hidden="true"
            className="fitproof-intro__cat-image"
            draggable={false}
            src={CAT_COMPANION_FRAME}
          />
        </div>
      </div>
    </div>
  );
}
