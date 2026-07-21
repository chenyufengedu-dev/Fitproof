import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AI scan intro is isolated from the homepage and drives the title verification state", async () => {
  const [inputPage, intro, styles] = await Promise.all([
    readProjectFile("InputPage.tsx"),
    readProjectFile("FitProofIntroAnimation.tsx"),
    readProjectFile("../app/globals.css"),
  ]);

  assert.match(inputPage, /FitProofIntroAnimation/);
  assert.match(inputPage, /onPhaseChange=\{setIntroPhase\}/);
  assert.match(inputPage, /fitproof-brand-card is-\$\{introPhase\}/);
  assert.match(inputPage, /fitproof-ai-title/);

  assert.match(intro, /INTRO_DURATION_MS = 4200/);
  assert.match(intro, /FITPROOF_LETTERS/);
  assert.match(intro, /fitproof-ai-intro__scanner/);
  assert.match(intro, /fitproof-ai-intro__line-dot/);
  assert.match(intro, /fitproof-ai-intro__eye-signal/);
  assert.match(intro, /fitproof-ai-intro__scan-ray/);
  assert.match(intro, /fitproof-cat-companion-cropped\.png/);
  assert.doesNotMatch(intro, /lottie-web|framer-motion|CAT_STORY_FRAMES|cat1|cat2|cat3/);

  assert.match(styles, /Homepage brand entrance: V4 AI scan generation/);
  assert.match(styles, /fitproofLetterGenerate/);
  assert.match(styles, /fitproofScannerSweep/);
  assert.match(styles, /fitproofLineLoad/);
  assert.match(styles, /fitproofCatAssistantEnter/);
  assert.match(styles, /fitproofTitleVerified/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
