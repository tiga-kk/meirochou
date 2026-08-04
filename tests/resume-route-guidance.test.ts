import { describe, expect, it, vi } from "vitest";
import { ResumeRouteGuidanceUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance";

describe("ResumeRouteGuidanceUseCase", () => {
  it("restores valid guidance snapshot and rebuilds route geometry", async () => {
    const snapshotRepo = {
      loadSnapshot: vi.fn(() => ({
        eventId: "c108",
        dayId: "day1",
        mapAreaId: "e456",
        startPosition: {
          areaId: "e456",
          gridIndex: 10,
          svgX: 1,
          svgY: 2,
          source: "manual-start",
        },
        targetSpace: "A01",
        visitedSpaces: [],
      })),
      deleteSnapshot: vi.fn(),
    };

    const session = {
      replaceSnapshot: vi.fn(),
    };

    const assetsLoader = {
      loadMapAssets: vi.fn(async () => ({
        points: { points: [] },
        gridMetadata: { cols: 10, rows: 10 },
        gridBytes: new Uint8Array(100),
      })),
    };

    const useCase = new ResumeRouteGuidanceUseCase(
      session as any,
      snapshotRepo as any,
      assetsLoader as any,
    );

    const resumed = await useCase.execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [{ space: "A01" }],
    });

    expect(resumed).toBe(true);
    expect(session.replaceSnapshot).toHaveBeenCalled();
  });

  it("clears a snapshot whose target no longer exists in the active source", async () => {
    const snapshotRepo = {
      loadSnapshot: vi.fn(() => ({
        eventId: "c108",
        dayId: "day1",
        mapAreaId: "e456",
        startPosition: {
          areaId: "e456",
          gridIndex: 10,
          svgX: 1,
          svgY: 2,
          source: "manual-start",
        },
        targetSpace: "A01",
        visitedSpaces: [],
      })),
      deleteSnapshot: vi.fn(),
    };

    const resumed = await new ResumeRouteGuidanceUseCase(
      { replaceSnapshot: vi.fn() } as any,
      snapshotRepo as any,
      { loadMapAssets: vi.fn(async () => ({})) } as any,
    ).execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      circles: [],
    });

    expect(resumed).toBe(false);
    expect(snapshotRepo.deleteSnapshot).toHaveBeenCalledOnce();
  });
});
