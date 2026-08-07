import {
  type AlnsSearchTimeLimitMs,
  evaluateRouteScore,
  normalizeRouteValue,
  type TimeDecayedAlnsBestSolution,
  type TimeDecayedAlnsProblem,
} from "./time-decayed-objective";

export function validateSearchTimeLimit(limit: number): AlnsSearchTimeLimitMs {
  if (limit === 5_000 || limit === 10_000 || limit === 15_000) {
    return limit;
  }
  throw new Error(
    `Invalid searchTimeLimitMs: ${limit}. Allowed values are 5000, 10000, 15000.`,
  );
}

/** Deterministic pseudo-random generator used by the pure ALNS kernel. */
class PseudoRandom {
  private seed: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new Error("randomSeed must be finite");
    this.seed = Math.trunc(seed) % 2_147_483_647;
    if (this.seed <= 0) this.seed += 2_147_483_646;
  }

  next(): number {
    this.seed = (this.seed * 16_807) % 2_147_483_647;
    return (this.seed - 1) / 2_147_483_646;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

type DestroyOperator = "random" | "worst" | "related";
type RepairOperator = "greedy" | "regret";

const DESTROY_OPERATORS: readonly DestroyOperator[] = [
  "random",
  "worst",
  "related",
];
const REPAIR_OPERATORS: readonly RepairOperator[] = ["greedy", "regret"];

interface DestroyResult {
  readonly remaining: string[];
  readonly removed: string[];
}

interface Insertion {
  readonly node: string;
  readonly position: number;
  readonly score: number;
}

/**
 * Time-decayed ALNS kernel. It is deliberately independent of Worker APIs so
 * that the Worker adapter can yield between bounded batches and receive cancel.
 */
export class TimeDecayedAlnsSolver {
  private readonly rng: PseudoRandom;
  private readonly usableNodeIds: readonly string[];
  private readonly destroyWeights: Record<DestroyOperator, number> = {
    random: 1,
    worst: 1,
    related: 1,
  };
  private readonly repairWeights: Record<RepairOperator, number> = {
    greedy: 1,
    regret: 1,
  };
  private readonly destroyScores: Record<DestroyOperator, number> = {
    random: 0,
    worst: 0,
    related: 0,
  };
  private readonly repairScores: Record<RepairOperator, number> = {
    greedy: 0,
    regret: 0,
  };
  private currentRoute: string[] = [];
  private bestRoute: string[] = [];
  private bestScore = 0;
  private initialized = false;
  private iterations = 0;
  private startedAtMs = 0;

  constructor(private readonly problem: TimeDecayedAlnsProblem) {
    validateSearchTimeLimit(problem.searchTimeLimitMs);
    if (
      problem.size <= 0 ||
      problem.travelTimesSec.length < problem.size ** 2
    ) {
      throw new Error("travelTimesSec does not match problem size");
    }
    if (
      problem.nodeIds.length + 1 !== problem.size ||
      problem.serviceTimesSec.length < problem.size ||
      problem.values.length < problem.size
    ) {
      throw new Error("problem size must include the start position");
    }
    this.rng = new PseudoRandom(problem.randomSeed);
    this.usableNodeIds = Object.freeze(
      problem.nodeIds.filter((nodeId, index) => {
        const matrixIndex = index + 1;
        const startTravel = problem.travelTimesSec[matrixIndex];
        const service = problem.serviceTimesSec[matrixIndex] ?? 30;
        return (
          nodeId.length > 0 &&
          Number.isFinite(startTravel) &&
          startTravel >= 0 &&
          Number.isFinite(service) &&
          service >= 0
        );
      }),
    );
  }

  /** Build the first usable best before a Worker starts its timed search. */
  initialize(): TimeDecayedAlnsBestSolution {
    if (this.initialized) return this.getBestSolution();
    this.initialized = true;
    this.startedAtMs = globalThis.performance?.now?.() ?? Date.now();

    const candidates = this.buildInitialRoutes();
    let selected = candidates[0] ?? [];
    let selectedEvaluation = evaluateRouteScore(selected, this.problem);
    for (const route of candidates.slice(1)) {
      const evaluation = evaluateRouteScore(route, this.problem);
      if (evaluation.score > selectedEvaluation.score) {
        selected = route;
        selectedEvaluation = evaluation;
      }
    }
    this.currentRoute = [...selected];
    this.bestRoute = [...selected];
    this.bestScore = selectedEvaluation.score;
    return this.getBestSolution(selectedEvaluation);
  }

  /** Run a deterministic bounded number of ALNS iterations. */
  solveSync(iterations = 100): TimeDecayedAlnsBestSolution {
    if (!Number.isInteger(iterations) || iterations < 0) {
      throw new Error("iterations must be a non-negative integer");
    }
    this.initialize();
    this.step(iterations);
    return this.getBestSolution();
  }

  /** Advance the solver by a bounded batch; used by the cancellable Worker. */
  step(iterations: number): TimeDecayedAlnsBestSolution {
    if (!Number.isInteger(iterations) || iterations < 0) {
      throw new Error("iterations must be a non-negative integer");
    }
    this.initialize();
    for (let i = 0; i < iterations; i++) {
      this.runIteration();
    }
    return this.getBestSolution();
  }

  private runIteration(): void {
    if (this.currentRoute.length < 2) {
      this.iterations += 1;
      return;
    }
    const destroy = this.pickOperator(DESTROY_OPERATORS, this.destroyWeights);
    const repair = this.pickOperator(REPAIR_OPERATORS, this.repairWeights);
    const destroyed = this.destroyRoute(this.currentRoute, destroy);
    const candidate = this.repairRoute(
      destroyed.remaining,
      destroyed.removed,
      repair,
    );
    const candidateEvaluation = evaluateRouteScore(candidate, this.problem);
    const currentEvaluation = evaluateRouteScore(
      this.currentRoute,
      this.problem,
    );
    const improvedCurrent =
      candidateEvaluation.score >= currentEvaluation.score;
    const improvedBest = candidateEvaluation.score > this.bestScore + 1e-9;

    if (improvedCurrent) this.currentRoute = candidate;
    if (improvedBest) {
      this.bestRoute = [...candidate];
      this.bestScore = candidateEvaluation.score;
    }
    this.destroyScores[destroy] += improvedBest ? 5 : improvedCurrent ? 1 : 0;
    this.repairScores[repair] += improvedBest ? 5 : improvedCurrent ? 1 : 0;
    this.iterations += 1;
    if (this.iterations % 25 === 0) this.updateOperatorWeights();
  }

  private buildInitialRoutes(): string[][] {
    const routes: string[][] = [];
    const seen = new Set<string>();
    const add = (route: readonly string[]) => {
      const repaired = this.repairRoute([], [...route], "greedy");
      const key = repaired.join("\u0000");
      if (!seen.has(key)) {
        seen.add(key);
        routes.push(repaired);
      }
    };

    for (const initial of this.problem.initialSolutions) add(initial);
    add(this.nearestRoute());
    add(this.priorityRoute());
    add(this.valuePerTimeRoute());
    return routes.length > 0 ? routes : [[]];
  }

  private nearestRoute(): string[] {
    const route: string[] = [];
    const remaining = new Set(this.usableNodeIds);
    let previousIndex = 0;
    while (remaining.size > 0) {
      let next: string | null = null;
      let nextDistance = Number.POSITIVE_INFINITY;
      for (const nodeId of remaining) {
        const index = this.nodeIndex(nodeId);
        const distance = this.travelTime(previousIndex, index);
        if (distance < nextDistance) {
          next = nodeId;
          nextDistance = distance;
        }
      }
      if (next === null || !Number.isFinite(nextDistance)) break;
      route.push(next);
      remaining.delete(next);
      previousIndex = this.nodeIndex(next);
    }
    return route;
  }

  private priorityRoute(): string[] {
    return [...this.usableNodeIds].sort((left, right) => {
      const valueDifference = this.value(right) - this.value(left);
      return valueDifference !== 0
        ? valueDifference
        : left.localeCompare(right);
    });
  }

  private valuePerTimeRoute(): string[] {
    const route: string[] = [];
    const remaining = new Set(this.usableNodeIds);
    let previousIndex = 0;
    while (remaining.size > 0) {
      const next = [...remaining]
        .map((nodeId) => {
          const index = this.nodeIndex(nodeId);
          const travel = this.travelTime(previousIndex, index);
          const service = this.serviceTime(index);
          const denominator = travel + service;
          return {
            nodeId,
            ratio:
              Number.isFinite(denominator) && denominator > 0
                ? this.value(nodeId) / denominator
                : -1,
          };
        })
        .sort(
          (left, right) =>
            right.ratio - left.ratio || left.nodeId.localeCompare(right.nodeId),
        )[0];
      if (!next || next.ratio < 0) break;
      route.push(next.nodeId);
      remaining.delete(next.nodeId);
      previousIndex = this.nodeIndex(next.nodeId);
    }
    return route;
  }

  private repairRoute(
    baseRoute: readonly string[],
    removed: readonly string[],
    operator: RepairOperator,
  ): string[] {
    const route: string[] = [];
    const fixed = this.problem.fixedFirstTarget;
    if (fixed && this.usableNodeIds.includes(fixed)) route.push(fixed);

    const candidates = [...baseRoute, ...removed];
    const pending = [...new Set(candidates)].filter(
      (nodeId) => this.usableNodeIds.includes(nodeId) && nodeId !== fixed,
    );
    for (const nodeId of baseRoute) {
      if (nodeId !== fixed && pending.includes(nodeId)) {
        const insertion = this.bestInsertion(route, nodeId);
        if (insertion) route.splice(insertion.position, 0, nodeId);
      }
    }
    const remaining = pending.filter((nodeId) => !route.includes(nodeId));
    if (operator === "regret") {
      this.regretRepair(route, remaining);
    } else {
      for (const nodeId of remaining) {
        const insertion = this.bestInsertion(route, nodeId);
        if (insertion) route.splice(insertion.position, 0, nodeId);
      }
    }
    return route;
  }

  private regretRepair(route: string[], remaining: string[]): void {
    while (remaining.length > 0) {
      let selected: Insertion | null = null;
      let selectedRegret = Number.NEGATIVE_INFINITY;
      for (const nodeId of remaining) {
        const options = this.insertionOptions(route, nodeId);
        if (options.length === 0) continue;
        const best = options[0];
        const second = options[1]?.score ?? best.score;
        const regret = best.score - second;
        if (regret > selectedRegret) {
          selected = best;
          selectedRegret = regret;
        }
      }
      if (!selected) return;
      route.splice(selected.position, 0, selected.node);
      remaining.splice(remaining.indexOf(selected.node), 1);
    }
  }

  private bestInsertion(
    route: readonly string[],
    nodeId: string,
  ): Insertion | null {
    return this.insertionOptions(route, nodeId)[0] ?? null;
  }

  private insertionOptions(
    route: readonly string[],
    nodeId: string,
  ): Insertion[] {
    const options: Insertion[] = [];
    const fixedOffset =
      this.problem.fixedFirstTarget &&
      route[0] === this.problem.fixedFirstTarget
        ? 1
        : 0;
    for (let position = fixedOffset; position <= route.length; position++) {
      const candidate = [
        ...route.slice(0, position),
        nodeId,
        ...route.slice(position),
      ];
      if (!this.isFeasibleRoute(candidate)) continue;
      options.push({
        node: nodeId,
        position,
        score: evaluateRouteScore(candidate, this.problem).score,
      });
    }
    return options.sort(
      (left, right) =>
        right.score - left.score || left.position - right.position,
    );
  }

  private destroyRoute(
    route: readonly string[],
    operator: DestroyOperator,
  ): DestroyResult {
    const fixedOffset =
      this.problem.fixedFirstTarget &&
      route[0] === this.problem.fixedFirstTarget
        ? 1
        : 0;
    const removable = route.slice(fixedOffset);
    if (removable.length <= 1) return { remaining: [...route], removed: [] };
    const removeCount = Math.max(1, Math.ceil(removable.length * 0.2));
    let removed: string[];
    if (operator === "worst") {
      const baseline = evaluateRouteScore(route, this.problem).score;
      removed = removable
        .map((nodeId) => ({
          nodeId,
          contribution:
            baseline -
            evaluateRouteScore(
              route.filter((candidate) => candidate !== nodeId),
              this.problem,
            ).score,
        }))
        .sort((left, right) => right.contribution - left.contribution)
        .slice(0, removeCount)
        .map(({ nodeId }) => nodeId);
    } else if (operator === "related") {
      const seed = removable[this.rng.nextInt(0, removable.length - 1)];
      const seedIndex = this.nodeIndex(seed);
      removed = removable
        .map((nodeId) => ({
          nodeId,
          distance: this.travelTime(seedIndex, this.nodeIndex(nodeId)),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, removeCount)
        .map(({ nodeId }) => nodeId);
    } else {
      const shuffled = [...removable];
      for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = this.rng.nextInt(0, index);
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex],
          shuffled[index],
        ];
      }
      removed = shuffled.slice(0, removeCount);
    }
    const removedSet = new Set(removed);
    return {
      remaining: route.filter((nodeId) => !removedSet.has(nodeId)),
      removed,
    };
  }

  private pickOperator<T extends string>(
    operators: readonly T[],
    weights: Readonly<Record<T, number>>,
  ): T {
    const total = operators.reduce(
      (sum, operator) => sum + weights[operator],
      0,
    );
    let threshold = this.rng.next() * total;
    for (const operator of operators) {
      threshold -= weights[operator];
      if (threshold <= 0) return operator;
    }
    return operators[operators.length - 1];
  }

  private updateOperatorWeights(): void {
    for (const operator of DESTROY_OPERATORS) {
      this.destroyWeights[operator] =
        0.8 * this.destroyWeights[operator] + this.destroyScores[operator] / 25;
      this.destroyScores[operator] = 0;
    }
    for (const operator of REPAIR_OPERATORS) {
      this.repairWeights[operator] =
        0.8 * this.repairWeights[operator] + this.repairScores[operator] / 25;
      this.repairScores[operator] = 0;
    }
  }

  private isFeasibleRoute(route: readonly string[]): boolean {
    if (route.length === 0) return true;
    if (
      this.problem.fixedFirstTarget &&
      route[0] !== this.problem.fixedFirstTarget
    )
      return false;
    let previousIndex = 0;
    for (const nodeId of route) {
      const index = this.nodeIndex(nodeId);
      if (
        !Number.isFinite(this.travelTime(previousIndex, index)) ||
        !Number.isFinite(this.serviceTime(index))
      )
        return false;
      previousIndex = index;
    }
    return true;
  }

  private nodeIndex(nodeId: string): number {
    const index = this.problem.nodeIds.indexOf(nodeId);
    if (index < 0) throw new Error(`Unknown route node: ${nodeId}`);
    return index + 1;
  }

  private travelTime(fromIndex: number, toIndex: number): number {
    return (
      this.problem.travelTimesSec[fromIndex * this.problem.size + toIndex] ??
      Number.POSITIVE_INFINITY
    );
  }

  private serviceTime(index: number): number {
    return this.problem.serviceTimesSec[index] ?? 30;
  }

  private value(nodeId: string): number {
    return normalizeRouteValue(this.problem.values[this.nodeIndex(nodeId)]);
  }

  private getBestSolution(
    evaluation = evaluateRouteScore(this.bestRoute, this.problem),
  ): TimeDecayedAlnsBestSolution {
    return Object.freeze({
      route: Object.freeze([...this.bestRoute]),
      score: this.bestScore || evaluation.score,
      completionTimesSec: Object.freeze([...evaluation.completionTimesSec]),
      elapsedMs: Math.max(
        0,
        (globalThis.performance?.now?.() ?? Date.now()) - this.startedAtMs,
      ),
      optimizationProfileVersion: this.problem.optimizationProfileVersion,
    });
  }
}
