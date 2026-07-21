import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("brand intro forms one calm logo-and-cat companion event", async () => {
  const [titleIntro, inputPage, intro, styles, v2Snapshot, svgSnapshot, storyboardSnapshot] = await Promise.all([
    readProjectFile("FitProofTitleAnimation.tsx"),
    readProjectFile("InputPage.tsx"),
    readProjectFile("FitProofIntro/FitProofIntro.tsx"),
    readProjectFile("../app/globals.css"),
    readFile(new URL("../../../docs/fitproof-intro-v2-png-sequence-snapshot.md", import.meta.url), "utf8"),
    readFile(new URL("../../../docs/fitproof-intro-v3-svg-mascot-snapshot.md", import.meta.url), "utf8"),
    readFile(new URL("../../../docs/fitproof-intro-v3-storyboard-snapshot.md", import.meta.url), "utf8"),
  ]);

  assert.match(v2Snapshot, /FitProof Intro V2 Snapshot/);
  assert.match(svgSnapshot, /Single SVG Mascot/);
  assert.match(storyboardSnapshot, /Four-Step Storyboard/);
  assert.match(titleIntro, /FitProofIntro/);
  assert.match(inputPage, /rounded-\[30px\][^"]*px-6[^"]*pt-\[10px\][^"]*pb-\[14px\]/);
  assert.match(inputPage, /<p className="mt-\[6px\] text-xl font-semibold text-slate-800">/);
  assert.match(inputPage, /<p className="mt-2 text-\[15px\] leading-relaxed text-slate-500">/);
  assert.match(inputPage, /<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-\[#0B6E63\]">/);
  assert.match(intro, /CAT_COMPANION_FRAME/);
  assert.match(intro, /new Image\(\)/);
  assert.match(intro, /INTRO_DURATION_MS = 2600/);
  assert.match(intro, /fitproof-intro__logo-mask/);
  assert.match(intro, /fitproof-wordmark/);
  assert.match(intro, /fitproof-intro__cat-companion/);
  assert.match(intro, /fitproof-intro__cat-image/);
  assert.match(intro, /viewBox="0 0 220 10"/);
  assert.match(intro, /preserveAspectRatio="none"/);
  assert.match(intro, /d="M0 5 H220"/);
  assert.match(intro, /\/brand\/fitproof-cat-companion-cropped\.png/);
  assert.doesNotMatch(intro, /CAT_STORY_FRAMES|CatMascot|fitproof-story-cat-peek|fitproof-story-cat-fit|fitproof-story-cat-pro|cat1|cat2|cat3|lottie-web/);
  assert.match(styles, /--fitproof-duration: 2600ms/);
  assert.match(styles, /\.fitproof-intro\s*{[^}]*width: 100%/s);
  assert.match(styles, /height: 116px/);
  assert.match(styles, /padding: 0 16px/);
  assert.match(styles, /place-items: center/);
  assert.match(styles, /\.fitproof-intro__lockup\s*{[^}]*width: 252px/s);
  assert.match(styles, /\.fitproof-intro__lockup\s*{[^}]*max-width: min\(252px, calc\(100vw - 32px\)\)/s);
  assert.match(styles, /\.fitproof-intro__lockup\s*{[^}]*height: 96px/s);
  assert.match(styles, /\.fitproof-intro__logo-mask\s*{[^}]*top: 6px/s);
  assert.match(styles, /\.fitproof-intro__logo-mask\s*{[^}]*left: 0/s);
  assert.match(styles, /\.fitproof-intro__logo-mask\s*{[^}]*width: 220px/s);
  assert.match(styles, /\.fitproof-intro__cat-companion\s*{[^}]*right: 0/s);
  assert.match(styles, /\.fitproof-intro__cat-companion\s*{[^}]*top: 18px/s);
  assert.match(styles, /\.fitproof-intro__cat-companion\s*{[^}]*width: 44px/s);
  assert.match(styles, /\.fitproof-intro__cat-companion\s*{[^}]*height: 52px/s);
  assert.match(styles, /\.fitproof-intro__line\s*{[^}]*left: 0/s);
  assert.match(styles, /\.fitproof-intro__line\s*{[^}]*top: 66px/s);
  assert.match(styles, /\.fitproof-intro__line\s*{[^}]*width: 220px/s);
  assert.match(styles, /\.fitproof-intro__line\s*{[^}]*height: 3px/s);
  assert.match(styles, /\.fitproof-intro__line-track\s*{[^}]*opacity: 0/s);
  assert.match(styles, /animation: fitproofLogoReveal 750ms cubic-bezier\(0\.4, 0, 0\.2, 1\) forwards/);
  assert.match(styles, /animation: fitproofLineSettle 400ms cubic-bezier\(0\.4, 0, 0\.2, 1\) 650ms forwards/);
  assert.match(styles, /fitproofCatCompanionEnter 520ms cubic-bezier\(0\.4, 0, 0\.2, 1\) 180ms forwards/);
  assert.match(styles, /fitproofCatCompanionSettle 320ms cubic-bezier\(0\.4, 0, 0\.2, 1\) 1050ms forwards/);
  assert.match(styles, /fitproofCatReadyNod 260ms cubic-bezier\(0\.4, 0, 0\.2, 1\) 1450ms forwards/);
  assert.match(styles, /@keyframes fitproofCatCompanionEnter/);
  assert.match(styles, /@keyframes fitproofCatCompanionSettle/);
  assert.match(styles, /@keyframes fitproofLineSettle/);
  const introStyles = styles.slice(styles.indexOf("Homepage brand entrance"));
  const logoMaskBlock = styles.match(/\.fitproof-intro__logo-mask\s*{(?<block>[^}]*)}/s)?.groups?.block ?? "";
  assert.doesNotMatch(logoMaskBlock, /opacity|scale|blur|filter/);
  assert.doesNotMatch(introStyles, /steps\(|infinite|particle|glow|blur|filter|bounce|fitproofCatStoryboard|fitproofFramePeek|fitproofFrameFit|fitproofFramePro|fitproofFrameFinal/);
  assert.match(styles, /@media \(max-width: 374px\)/);
  assert.match(styles, /@media \(min-width: 400px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
