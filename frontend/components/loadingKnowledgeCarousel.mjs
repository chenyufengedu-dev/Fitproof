export function wrapKnowledgeIndex(index, direction, length) {
  if (!Number.isInteger(length) || length <= 0) return 0
  return (index + direction + length) % length
}

export function visibleKnowledgeIndexes(index, length) {
  return [-1, 0, 1].map((offset) => wrapKnowledgeIndex(index, offset, length))
}

export function resolveKnowledgeSwipe(dragX, cancelled, threshold = 38) {
  if (cancelled || Math.abs(dragX) < threshold) return 0
  return dragX < 0 ? 1 : -1
}
