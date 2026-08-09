import {
  parseSpace,
  type SpaceArea,
} from "../../../../shared/domain/space-parser";

export { parseSpace };

export function calculateSpaceDistance(
  spaceA: string,
  spaceB: string,
  areas: readonly SpaceArea[] = [],
): number {
  const [areaA, labelA, numberA] = parseSpace(spaceA, areas);
  const [areaB, labelB, numberB] = parseSpace(spaceB, areas);
  if (!areaA || !areaB || areaA !== areaB || !labelA || !labelB) {
    return 10000;
  }
  const normalizedA = numberA > 32 ? 64 - numberA : numberA;
  const normalizedB = numberB > 32 ? 64 - numberB : numberB;
  return (
    Math.abs(labelA.charCodeAt(0) - labelB.charCodeAt(0)) * 7 +
    Math.abs(normalizedA - normalizedB)
  );
}

export function solveNearestNeighbor<T extends { space: string }>(
  startSpace: string,
  candidates: readonly T[],
  areas: readonly SpaceArea[] = [],
): Array<T & { isStart: boolean }> {
  if (candidates.length === 0) return [];

  const nodes = [{ space: startSpace, isStart: true }, ...candidates] as Array<
    T & { isStart: boolean }
  >;
  const path = [nodes[0]];
  const visited = new Set([0]);
  let currentIndex = 0;

  while (path.length < nodes.length) {
    let nextIndex = -1;
    let minimumDistance = Infinity;
    for (let index = 1; index < nodes.length; index += 1) {
      if (visited.has(index)) continue;
      const distance = calculateSpaceDistance(
        nodes[currentIndex].space,
        nodes[index].space,
        areas,
      );
      if (distance < minimumDistance) {
        minimumDistance = distance;
        nextIndex = index;
      }
    }
    if (nextIndex === -1) break;
    path.push(nodes[nextIndex]);
    visited.add(nextIndex);
    currentIndex = nextIndex;
  }
  return path;
}
