"use client";

import FitProofIntro from "@/components/FitProofIntro/FitProofIntro";

interface FitProofTitleAnimationProps {
  className?: string;
}

export default function FitProofTitleAnimation({
  className = "",
}: FitProofTitleAnimationProps) {
  return <FitProofIntro className={className} />;
}
