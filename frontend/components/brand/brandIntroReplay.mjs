/**
 * @param {{
 *   reducedMotion: boolean,
 *   playedDocumentId: string | null,
 *   currentDocumentId: string
 * }} input
 */
export function shouldPlayBrandIntro({
  reducedMotion,
  playedDocumentId,
  currentDocumentId,
}) {
  if (reducedMotion) return false;
  return playedDocumentId !== currentDocumentId;
}

/**
 * @param {{
 *   fontsReady: PromiseLike<unknown>,
 *   measure: () => void,
 *   onReady: () => void
 * }} input
 */
export function prepareBrandLayout({ fontsReady, measure, onReady }) {
  let disposed = false;
  const finalize = () => {
    if (disposed) return;
    measure();
    onReady();
  };

  measure();
  void Promise.resolve(fontsReady).then(finalize, finalize);

  return () => {
    disposed = true;
  };
}

/**
 * @param {{
 *   requestFrame: (callback: () => void) => number,
 *   cancelFrame: (id: number) => void,
 *   setTimer: (callback: () => void, durationMs: number) => number,
 *   clearTimer: (id: number) => void,
 *   durationMs: number,
 *   onStart: () => void,
 *   onComplete: () => void
 * }} input
 */
export function scheduleBrandIntroPlayback({
  requestFrame,
  cancelFrame,
  setTimer,
  clearTimer,
  durationMs,
  onStart,
  onComplete,
}) {
  /** @type {number | undefined} */
  let finishTimer;
  const startFrame = requestFrame(() => {
    onStart();
    finishTimer = setTimer(onComplete, durationMs);
  });
  return () => {
    cancelFrame(startFrame);
    if (finishTimer !== undefined) clearTimer(finishTimer);
  };
}

/**
 * @param {{
 *   setTimer: (callback: () => void, durationMs: number) => number,
 *   clearTimer: (id: number) => void,
 *   intervalMs: number,
 *   scanDurationMs: number,
 *   onScanStart: () => void,
 *   onScanComplete: () => void
 * }} input
 */
export function scheduleBrandScanLoop({
  setTimer,
  clearTimer,
  intervalMs,
  scanDurationMs,
  onScanStart,
  onScanComplete,
}) {
  let disposed = false;
  /** @type {number | undefined} */
  let waitTimer;
  /** @type {number | undefined} */
  let scanTimer;

  const scheduleNextScan = () => {
    waitTimer = setTimer(() => {
      waitTimer = undefined;
      if (disposed) return;

      onScanStart();
      scanTimer = setTimer(() => {
        scanTimer = undefined;
        if (disposed) return;

        onScanComplete();
        scheduleNextScan();
      }, scanDurationMs);
    }, intervalMs);
  };

  scheduleNextScan();

  return () => {
    disposed = true;
    if (waitTimer !== undefined) clearTimer(waitTimer);
    if (scanTimer !== undefined) clearTimer(scanTimer);
  };
}

/**
 * @param {{
 *   setTimer: (callback: () => void, durationMs: number) => number,
 *   clearTimer: (id: number) => void,
 *   intervalMs: number,
 *   scanDurationMs: number,
 *   onScanStart: () => void,
 *   onScanComplete: () => void,
 *   getVisibilityState: () => string,
 *   addVisibilityListener: (listener: () => void) => void,
 *   removeVisibilityListener: (listener: () => void) => void,
 *   onVisibilityReset: () => void
 * }} input
 */
export function scheduleVisibleBrandScanLoop({
  setTimer,
  clearTimer,
  intervalMs,
  scanDurationMs,
  onScanStart,
  onScanComplete,
  getVisibilityState,
  addVisibilityListener,
  removeVisibilityListener,
  onVisibilityReset,
}) {
  /** @type {(() => void) | undefined} */
  let stopScanLoop;
  const stopLoop = () => {
    stopScanLoop?.();
    stopScanLoop = undefined;
  };
  const startLoop = () => {
    stopLoop();
    if (getVisibilityState() !== "visible") return;
    stopScanLoop = scheduleBrandScanLoop({
      setTimer,
      clearTimer,
      intervalMs,
      scanDurationMs,
      onScanStart,
      onScanComplete,
    });
  };
  const handleVisibilityChange = () => {
    onVisibilityReset();
    if (getVisibilityState() === "visible") startLoop();
    else stopLoop();
  };

  startLoop();
  addVisibilityListener(handleVisibilityChange);
  return () => {
    removeVisibilityListener(handleVisibilityChange);
    stopLoop();
  };
}
