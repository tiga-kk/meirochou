export function normalizeCirclePriority(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const priority = Number(value);
  return Number.isFinite(priority) ? priority : null;
}

export function collectCirclePriorities(
  circles: readonly { priority?: unknown }[],
): number[] {
  return [
    ...new Set(
      circles
        .map((circle) => normalizeCirclePriority(circle.priority))
        .filter((priority): priority is number => priority !== null),
    ),
  ].sort((left, right) => right - left);
}

export function matchesCirclePriority(
  circle: { priority?: unknown },
  selectedPriorities: readonly number[] | null,
): boolean {
  if (selectedPriorities === null || selectedPriorities.length === 0) {
    return true;
  }
  const priority = normalizeCirclePriority(circle.priority);
  return priority !== null && selectedPriorities.includes(priority);
}

export function filterCirclesByPriority<T extends { priority?: unknown }>(
  circles: readonly T[],
  selectedPriorities: readonly number[] | null,
): T[] {
  return circles.filter((circle) =>
    matchesCirclePriority(circle, selectedPriorities),
  );
}
