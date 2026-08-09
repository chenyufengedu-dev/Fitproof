"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import AiMagnifier from "./AiMagnifier";
import {
  prepareBrandLayout,
  scheduleBrandIntroPlayback,
  scheduleVisibleBrandScanLoop,
  shouldPlayBrandIntro,
} from "./brandIntroReplay.mjs";

export type FitProofIntroPhase = "preparing" | "playing" | "complete" | "scanning";

interface FitProofBrandIntroProps {
  className?: string;
  onLayoutReady?: () => void;
  onPhaseChange?: (phase: FitProofIntroPhase) => void;
}

const INTRO_SESSION_KEY = "fitproof-brand-intro-scan-played";
const INTRO_DURATION_MS = 4200;
const SCAN_INTERVAL_MS = 14000;
const SCAN_DURATION_MS = 1800;
const FITPROOF_LETTERS = Array.from("FitProof");
let playedDocumentIdInMemory: string | null = null;

export default function FitProofBrandIntro({
  className = "",
  onLayoutReady,
  onPhaseChange,
}: FitProofBrandIntroProps) {
  const [phase, setPhase] = useState<FitProofIntroPhase>("preparing");
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [logoWidth, setLogoWidth] = useState(226);
  const wordmarkRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const width = wordmarkRef.current?.getBoundingClientRect().width;
      if (width) setLogoWidth(Math.ceil(width));
    };
    const stopPreparingLayout = prepareBrandLayout({
      fontsReady: document.fonts?.ready || Promise.resolve(),
      measure,
      onReady: () => onLayoutReady?.(),
    });
    window.addEventListener("resize", measure);
    return () => {
      stopPreparingLayout();
      window.removeEventListener("resize", measure);
    };
  }, [onLayoutReady]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const currentDocumentId = String(performance.timeOrigin);
    let playedDocumentId = playedDocumentIdInMemory;
    try {
      playedDocumentId = window.sessionStorage.getItem(INTRO_SESSION_KEY) || playedDocumentId;
    } catch {
      // The module-level marker still prevents replays within this document.
    }
    const shouldPlay = shouldPlayBrandIntro({ reducedMotion, playedDocumentId, currentDocumentId });
    if (!shouldPlay) {
      setPhase("complete");
      if (!reducedMotion) setLoopEnabled(true);
      return;
    }

    return scheduleBrandIntroPlayback({
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      setTimer: (callback, durationMs) => window.setTimeout(callback, durationMs),
      clearTimer: (id) => window.clearTimeout(id),
      durationMs: INTRO_DURATION_MS,
      onStart: () => {
        playedDocumentIdInMemory = currentDocumentId;
        try {
          window.sessionStorage.setItem(INTRO_SESSION_KEY, currentDocumentId);
        } catch {
          // Storage can be unavailable in privacy modes; the in-memory marker is enough here.
        }
        setPhase("playing");
      },
      onComplete: () => {
        setPhase("complete");
        setLoopEnabled(true);
      },
    });
  }, []);

  useEffect(() => {
    if (!loopEnabled) return;
    return scheduleVisibleBrandScanLoop({
      setTimer: (callback, durationMs) => window.setTimeout(callback, durationMs),
      clearTimer: (id) => window.clearTimeout(id),
      intervalMs: SCAN_INTERVAL_MS,
      scanDurationMs: SCAN_DURATION_MS,
      onScanStart: () => setPhase("scanning"),
      onScanComplete: () => setPhase("complete"),
      getVisibilityState: () => document.visibilityState,
      addVisibilityListener: (listener) => document.addEventListener("visibilitychange", listener),
      removeVisibilityListener: (listener) => document.removeEventListener("visibilitychange", listener),
      onVisibilityReset: () => setPhase("complete"),
    });
  }, [loopEnabled]);

  return (
    <div
      aria-hidden="true"
      className={`fitproof-brand-intro is-${phase} ${className}`}
      style={{ "--fitproof-brand-logo-width": `${logoWidth}px` } as CSSProperties}
    >
      <span className="fitproof-brand-intro-logo">
        <span className="fitproof-brand-intro-wordmark" ref={wordmarkRef}>
          {FITPROOF_LETTERS.map((letter, index) => (
            <span
              className="fitproof-brand-intro-letter"
              key={`${letter}-${index}`}
              style={{ "--fitproof-brand-letter-index": index } as CSSProperties}
            >
              {letter}
            </span>
          ))}
        </span>
        <AiMagnifier className="fitproof-brand-intro-magnifier" />
      </span>
      <span className="fitproof-brand-intro-line">
        <span className="fitproof-brand-intro-line-fill" />
        <span className="fitproof-brand-intro-line-dot" />
      </span>
    </div>
  );
}
