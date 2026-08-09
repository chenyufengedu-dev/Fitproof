export function mergeTraceStep(steps, nextStep) {
  if (!nextStep?.step) return [...steps, nextStep]
  const index = steps.findIndex((step) => step.step === nextStep.step)
  if (index < 0) return [...steps, nextStep]
  return steps.map((step, stepIndex) => stepIndex === index ? nextStep : step)
}
