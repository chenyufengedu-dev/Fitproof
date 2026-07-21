"use client";

import FitProofIntroAnimation, { type FitProofIntroPhase } from "@/components/FitProofIntroAnimation";

interface FitProofTitleAnimationProps {
  className?: string;
  onPhaseChange?: (phase: FitProofIntroPhase) => void;
}

export default function FitProofTitleAnimation({
  className = "",
  onPhaseChange,
}: FitProofTitleAnimationProps) {
  return <FitProofIntroAnimation className={className} onPhaseChange={onPhaseChange} />;
}
