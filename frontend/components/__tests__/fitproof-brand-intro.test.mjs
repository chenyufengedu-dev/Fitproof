import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const replayModule = await import("../brand/brandIntroReplay.mjs").catch(() => null);


async function readFrontendFile(relativePath) {
  try {
    return await readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}


test("formal brand intro keeps the existing animated cat and excludes handoff sources", async () => {
  const [inputPage, intro, magnifier, styles, tsconfig] = await Promise.all([
    readFrontendFile("components/InputPage.tsx"),
    readFrontendFile("components/brand/FitProofBrandIntro.tsx"),
    readFrontendFile("components/brand/AiMagnifier.tsx"),
    readFrontendFile("app/globals.css"),
    readFrontendFile("tsconfig.json"),
  ]);

  assert.match(inputPage, /FitProofBrandIntro/);
  assert.match(inputPage, /ThinkingCatAnimation/);
  assert.match(inputPage, /brandLayoutReady/);
  assert.match(inputPage, /opacity-0/);
  assert.match(inputPage, /opacity-90/);
  assert.match(inputPage, /transition-opacity/);
  assert.match(inputPage, /duration-300/);
  assert.match(inputPage, /left-\[calc\(100%\+1\.75rem\)\]/);
  assert.match(inputPage, /-top-1/);
  assert.match(inputPage, /sm:top-0/);
  assert.match(inputPage, /h-\[65px\] w-14/);
  assert.match(inputPage, /sm:h-\[93px\] sm:w-20/);

  assert.match(intro, /INTRO_DURATION_MS = 4200/);
  assert.match(intro, /SCAN_INTERVAL_MS = 14000/);
  assert.match(intro, /SCAN_DURATION_MS = 1800/);
  assert.match(intro, /"scanning"/);
  assert.match(intro, /onLayoutReady/);
  assert.match(intro, /visibilitychange/);
  assert.match(intro, /getBoundingClientRect/);
  assert.match(intro, /prefers-reduced-motion: reduce/);
  assert.match(intro, /AiMagnifier/);
  assert.match(intro, /sessionStorage/);
  assert.match(magnifier, /fitproof-brand-ai-magnifier/);

  assert.match(styles, /FitProof homepage brand entrance/);
  assert.match(styles, /fitproofBrandLetterGenerate/);
  assert.match(styles, /fitproofBrandMagnifierInspect/);
  assert.match(styles, /\.fitproof-brand-intro\.is-scanning/);
  assert.doesNotMatch(styles, /\.fitproof-brand-card\.is-scanning\s+\.fitproof-brand-tagline/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

  const productionSources = [inputPage, intro, magnifier, styles].join("\n");
  assert.doesNotMatch(productionSources, /fitproof-brand-intro-handoff/);
  assert.doesNotMatch(productionSources, /fitproof-cat-companion-cropped\.png/);
  assert.match(tsconfig, /"exclude":\s*\["node_modules",\s*"public"\]/);
});

test("brand intro plays once per document, including after a refresh", () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  const { shouldPlayBrandIntro } = replayModule;

  assert.equal(shouldPlayBrandIntro({
    reducedMotion: false,
    playedDocumentId: null,
    currentDocumentId: "first-document",
  }), true);
  assert.equal(shouldPlayBrandIntro({
    reducedMotion: false,
    playedDocumentId: "first-document",
    currentDocumentId: "first-document",
  }), false);
  assert.equal(shouldPlayBrandIntro({
    reducedMotion: false,
    playedDocumentId: "first-document",
    currentDocumentId: "refreshed-document",
  }), true);
  assert.equal(shouldPlayBrandIntro({
    reducedMotion: false,
    playedDocumentId: "refreshed-document",
    currentDocumentId: "refreshed-document",
  }), false);
});

test("brand intro skips motion when reduced motion is requested", () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(replayModule.shouldPlayBrandIntro({
    reducedMotion: true,
    playedDocumentId: null,
    currentDocumentId: "first-document",
  }), false);
});

test("a Strict Mode cleanup before the first frame does not consume the intro", () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(typeof replayModule.scheduleBrandIntroPlayback, "function");

  let nextId = 0;
  let startCount = 0;
  const frames = new Map();
  const timers = new Map();
  const dependencies = {
    requestFrame(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    setTimer(callback) {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    durationMs: 4200,
    onStart() {
      startCount += 1;
    },
    onComplete() {},
  };

  const cleanupFirstSetup = replayModule.scheduleBrandIntroPlayback(dependencies);
  cleanupFirstSetup();
  assert.equal(startCount, 0);

  const cleanupSecondSetup = replayModule.scheduleBrandIntroPlayback(dependencies);
  const scheduledFrame = [...frames.values()][0];
  assert.ok(scheduledFrame);
  scheduledFrame();
  assert.equal(startCount, 1);
  cleanupSecondSetup();
});

test("the completion timer starts only after the animation frame begins", () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");

  let nextId = 0;
  const frames = new Map();
  const timers = new Map();
  const cleanup = replayModule.scheduleBrandIntroPlayback({
    requestFrame(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    setTimer(callback) {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    durationMs: 4200,
    onStart() {},
    onComplete() {},
  });

  assert.equal(timers.size, 0);
  const scheduledFrame = [...frames.values()][0];
  assert.ok(scheduledFrame);
  scheduledFrame();
  assert.equal(timers.size, 1);
  cleanup();
  assert.equal(timers.size, 0);
});

test("brand scan waits 14 seconds, scans for 1.8 seconds, then repeats", () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(typeof replayModule.scheduleBrandScanLoop, "function");

  let nextId = 0;
  const timers = new Map();
  const events = [];
  const cleanup = replayModule.scheduleBrandScanLoop({
    setTimer(callback, durationMs) {
      const id = ++nextId;
      timers.set(id, { callback, durationMs });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    intervalMs: 14000,
    scanDurationMs: 1800,
    onScanStart() {
      events.push("start");
    },
    onScanComplete() {
      events.push("complete");
    },
  });

  assert.deepEqual([...timers.values()].map(({ durationMs }) => durationMs), [14000]);
  const waitTimer = [...timers.entries()][0];
  timers.delete(waitTimer[0]);
  waitTimer[1].callback();
  assert.deepEqual(events, ["start"]);
  assert.deepEqual([...timers.values()].map(({ durationMs }) => durationMs), [1800]);

  const scanTimer = [...timers.entries()][0];
  timers.delete(scanTimer[0]);
  scanTimer[1].callback();
  assert.deepEqual(events, ["start", "complete"]);
  assert.deepEqual([...timers.values()].map(({ durationMs }) => durationMs), [14000]);

  cleanup();
  assert.equal(timers.size, 0);
});

test("brand scan cleanup prevents an active scan from completing or repeating", () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(typeof replayModule.scheduleBrandScanLoop, "function");

  let nextId = 0;
  let completionCount = 0;
  const timers = new Map();
  const cleanup = replayModule.scheduleBrandScanLoop({
    setTimer(callback, durationMs) {
      const id = ++nextId;
      timers.set(id, { callback, durationMs });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    intervalMs: 14000,
    scanDurationMs: 1800,
    onScanStart() {},
    onScanComplete() {
      completionCount += 1;
    },
  });

  const waitTimer = [...timers.entries()][0];
  timers.delete(waitTimer[0]);
  waitTimer[1].callback();
  const activeScanCallback = [...timers.values()][0].callback;

  cleanup();
  activeScanCallback();
  assert.equal(completionCount, 0);
  assert.equal(timers.size, 0);
});

test("visibility changes cancel an active scan and restart with a full interval", () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(typeof replayModule.scheduleVisibleBrandScanLoop, "function");

  let nextId = 0;
  let visibilityState = "visible";
  let visibilityListener;
  let scanStartCount = 0;
  let resetCount = 0;
  const timers = new Map();
  const cleanup = replayModule.scheduleVisibleBrandScanLoop({
    setTimer(callback, durationMs) {
      const id = ++nextId;
      timers.set(id, { callback, durationMs });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    intervalMs: 14000,
    scanDurationMs: 1800,
    onScanStart() {
      scanStartCount += 1;
    },
    onScanComplete() {},
    getVisibilityState() {
      return visibilityState;
    },
    addVisibilityListener(listener) {
      visibilityListener = listener;
    },
    removeVisibilityListener(listener) {
      if (visibilityListener === listener) visibilityListener = undefined;
    },
    onVisibilityReset() {
      resetCount += 1;
    },
  });

  assert.deepEqual([...timers.values()].map(({ durationMs }) => durationMs), [14000]);
  const waitTimer = [...timers.entries()][0];
  timers.delete(waitTimer[0]);
  waitTimer[1].callback();
  assert.equal(scanStartCount, 1);
  assert.deepEqual([...timers.values()].map(({ durationMs }) => durationMs), [1800]);

  visibilityState = "hidden";
  visibilityListener();
  assert.equal(resetCount, 1);
  assert.equal(timers.size, 0);

  visibilityState = "visible";
  visibilityListener();
  assert.equal(resetCount, 2);
  assert.equal(scanStartCount, 1);
  assert.deepEqual([...timers.values()].map(({ durationMs }) => durationMs), [14000]);

  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(visibilityListener, undefined);
});

test("brand layout is revealed only after fonts settle and width is remeasured", async () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(typeof replayModule.prepareBrandLayout, "function");

  let resolveFonts;
  const fontsReady = new Promise((resolve) => {
    resolveFonts = resolve;
  });
  const events = [];
  const cleanup = replayModule.prepareBrandLayout({
    fontsReady,
    measure() {
      events.push("measure");
    },
    onReady() {
      events.push("ready");
    },
  });

  assert.deepEqual(events, ["measure"]);
  resolveFonts();
  await fontsReady;
  await Promise.resolve();
  assert.deepEqual(events, ["measure", "measure", "ready"]);
  cleanup();
});

test("brand layout still reveals when font readiness rejects", async () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(typeof replayModule.prepareBrandLayout, "function");

  const events = [];
  const fontsReady = Promise.reject(new Error("font load failed"));
  const cleanup = replayModule.prepareBrandLayout({
    fontsReady,
    measure() {
      events.push("measure");
    },
    onReady() {
      events.push("ready");
    },
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["measure", "measure", "ready"]);
  cleanup();
});

test("brand layout cleanup prevents post-unmount measurement and reveal", async () => {
  assert.ok(replayModule, "brandIntroReplay.mjs should provide executable replay behavior");
  assert.equal(typeof replayModule.prepareBrandLayout, "function");

  let resolveFonts;
  const fontsReady = new Promise((resolve) => {
    resolveFonts = resolve;
  });
  let measureCount = 0;
  let readyCount = 0;
  const cleanup = replayModule.prepareBrandLayout({
    fontsReady,
    measure() {
      measureCount += 1;
    },
    onReady() {
      readyCount += 1;
    },
  });

  cleanup();
  resolveFonts();
  await fontsReady;
  await Promise.resolve();
  assert.equal(measureCount, 1);
  assert.equal(readyCount, 0);
});
