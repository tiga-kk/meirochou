import { describe, expect, test } from "vitest";
import {
  createEmptyEventDayState,
  getCircleVisitState,
  parseLocalEventDayState,
  StorageSchemaError,
  transitionCircleVisitState,
} from "../apps/webapp/js/state/storage-schema";
import type {
  DataSource,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";

describe("Storage Schema Version 1", () => {
  const validCsvSource: DataSource = {
    type: "csv",
    fileName: "circles.csv",
  };

  const validGasSource: DataSource = {
    type: "gas",
    gasUrl: "https://script.google.com/macros/s/123/exec",
    sheetName: "Sheet1",
  };

  const validNow = "2026-07-21T04:36:34.000Z";

  test("creates a valid empty state and deep freezes it", () => {
    const state: LocalEventDayState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );
    expect(state.schemaVersion).toBe(2);
    expect(state.source).toEqual(validCsvSource);
    expect(state.sourceGeneration).toBe("g-001");
    expect(state.circles).toEqual([]);
    expect(state.circleStates).toEqual({});
    expect(state.gasOutbox).toEqual([]);
    expect(state.timestamps.createdAt).toBe(validNow);
    expect(state.timestamps.updatedAt).toBe(validNow);
    expect(state.timestamps.sourceUpdatedAt).toBe(validNow);

    // Verify it is frozen
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.source)).toBe(true);
    expect(Object.isFrozen(state.circles)).toBe(true);
    expect(Object.isFrozen(state.circleStates)).toBe(true);
    expect(Object.isFrozen(state.gasOutbox)).toBe(true);
    expect(Object.isFrozen(state.timestamps)).toBe(true);

    // Should parse cleanly
    const parsed = parseLocalEventDayState(state);
    expect(parsed).toEqual(state);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  test("rejects unknown schema version", () => {
    const state = createEmptyEventDayState(validCsvSource, "g-001", validNow);
    const malformed = { ...state, schemaVersion: 3 };
    expect(() => parseLocalEventDayState(malformed)).toThrow(
      StorageSchemaError,
    );
  });

  test("rejects mismatched or invalid source fields", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );

    // Mismatched csv source containing gas field
    const malformedCsv = {
      ...baseState,
      source: {
        type: "csv",
        fileName: "circles.csv",
        sheetName: "Sheet1",
      },
    };
    expect(() => parseLocalEventDayState(malformedCsv)).toThrow(
      StorageSchemaError,
    );

    // Missing fileName in csv
    const missingFileCsv = {
      ...baseState,
      source: {
        type: "csv",
      },
    };
    expect(() => parseLocalEventDayState(missingFileCsv)).toThrow(
      StorageSchemaError,
    );

    // Mismatched gas source containing csv field
    const malformedGas = {
      ...baseState,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/123/exec",
        sheetName: "Sheet1",
        fileName: "circles.csv",
      },
    };
    expect(() => parseLocalEventDayState(malformedGas)).toThrow(
      StorageSchemaError,
    );

    // Missing fields in gas
    const missingUrlGas = {
      ...baseState,
      source: {
        type: "gas",
        sheetName: "Sheet1",
      },
    };
    expect(() => parseLocalEventDayState(missingUrlGas)).toThrow(
      StorageSchemaError,
    );
  });

  test("rejects duplicate purchased/hold spaces in legacy v1 migration", () => {
    const baseState = {
      schemaVersion: 1,
      source: validCsvSource,
      sourceGeneration: "g-001",
      circles: [{ space: "A-01" }, { space: "B-02" }],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: validNow,
        updatedAt: validNow,
        sourceUpdatedAt: validNow,
      },
    };

    const duplicatePurchased = {
      ...baseState,
      purchased: ["A-01", "B-02", "A-01"],
      hold: [],
    };
    expect(() => parseLocalEventDayState(duplicatePurchased)).toThrow(
      StorageSchemaError,
    );

    const duplicateHold = {
      ...baseState,
      purchased: [],
      hold: ["A-01", "A-01"],
    };
    expect(() => parseLocalEventDayState(duplicateHold)).toThrow(
      StorageSchemaError,
    );
  });

  test("preserves a validated source sale marker across a storage parse", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );
    const stateWithSaleMarker = {
      ...baseState,
      circles: [{ space: "A-01", isSale: "x" }],
      circleStates: { "A-01": "purchased" as const },
    };

    expect(parseLocalEventDayState(stateWithSaleMarker).circles).toEqual([
      { space: "A-01", isSale: "x" },
    ]);
  });

  test("rejects circleStates referencing an invalid/empty space (not in circles)", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );
    const stateWithCircles = {
      ...baseState,
      circles: [{ space: "A-01" }, { space: "B-02" }],
    };

    // circleStates references invalid space
    const invalidCircleState = {
      ...stateWithCircles,
      circleStates: { "C-03": "purchased" },
    };
    expect(() => parseLocalEventDayState(invalidCircleState)).toThrow(
      StorageSchemaError,
    );
  });

  test("rejects duplicate circle spaces", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );

    const duplicateCircles = {
      ...baseState,
      circles: [
        { space: "A-01", priority: 1 },
        { space: "B-02" },
        { space: "A-01", priority: 2 },
      ],
    };
    expect(() => parseLocalEventDayState(duplicateCircles)).toThrow(
      StorageSchemaError,
    );
  });

  test("rejects legacy v1 history referencing a space not in the circle list", () => {
    const baseState = {
      schemaVersion: 1,
      source: validCsvSource,
      sourceGeneration: "g-001",
      circles: [{ space: "A-01" }, { space: "B-02" }],
      purchased: [],
      hold: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: validNow,
        updatedAt: validNow,
        sourceUpdatedAt: validNow,
      },
    };

    // Invalid history referencing non-existent space
    const invalidHistorySpace = {
      ...baseState,
      history: [{ type: "purchase", space: "C-03", timestamp: validNow }],
    };
    expect(() => parseLocalEventDayState(invalidHistorySpace)).toThrow(
      StorageSchemaError,
    );

    // Invalid history referencing empty space
    const invalidHistoryEmptySpace = {
      ...baseState,
      history: [{ type: "purchase", space: "", timestamp: validNow }],
    };
    expect(() => parseLocalEventDayState(invalidHistoryEmptySpace)).toThrow(
      StorageSchemaError,
    );

    // Invalid redo referencing non-existent space
    const invalidRedoSpace = {
      ...baseState,
      redo: [{ type: "hold", space: "C-03", timestamp: validNow }],
    };
    expect(() => parseLocalEventDayState(invalidRedoSpace)).toThrow(
      StorageSchemaError,
    );
  });

  test("rejects malformed ISO 8601 timestamps", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );

    const invalidCreatedAt = {
      ...baseState,
      timestamps: {
        ...baseState.timestamps,
        createdAt: "2026/07/21 04:36:34",
      },
    };
    expect(() => parseLocalEventDayState(invalidCreatedAt)).toThrow(
      StorageSchemaError,
    );

    const invalidUpdatedAt = {
      ...baseState,
      timestamps: {
        ...baseState.timestamps,
        updatedAt: "not-a-date",
      },
    };
    expect(() => parseLocalEventDayState(invalidUpdatedAt)).toThrow(
      StorageSchemaError,
    );

    const invalidSourceUpdatedAt = {
      ...baseState,
      timestamps: {
        ...baseState.timestamps,
        sourceUpdatedAt: "",
      },
    };
    expect(() => parseLocalEventDayState(invalidSourceUpdatedAt)).toThrow(
      StorageSchemaError,
    );
  });

  test("rejects outbox entries with mismatched source generation", () => {
    const baseState = createEmptyEventDayState(
      validGasSource,
      "g-001",
      validNow,
    );

    const validOutboxEntry = {
      id: "out-001",
      eventId: "demo-v1",
      dayId: "day1",
      sourceGeneration: "g-001",
      gasUrl: "https://script.google.com/macros/s/123/exec",
      sheetName: "Sheet1",
      space: "A-01",
      purchased: true,
      createdAt: validNow,
      attempts: 0,
      lastError: null,
    };

    // Valid outbox
    const validOutbox = {
      ...baseState,
      circles: [{ space: "A-01" }],
      gasOutbox: [validOutboxEntry],
    };
    expect(parseLocalEventDayState(validOutbox).gasOutbox.length).toBe(1);

    // Mismatched source generation
    const mismatchedGeneration = {
      ...validOutbox,
      gasOutbox: [
        {
          ...validOutboxEntry,
          sourceGeneration: "g-002",
        },
      ],
    };
    expect(() => parseLocalEventDayState(mismatchedGeneration)).toThrow(
      StorageSchemaError,
    );

    const duplicateIds = {
      ...validOutbox,
      gasOutbox: [validOutboxEntry, { ...validOutboxEntry, space: "A-02" }],
    };
    expect(() => parseLocalEventDayState(duplicateIds)).toThrow(
      StorageSchemaError,
    );
  });
});

describe("Storage Schema Version 2 & Migration", () => {
  const validCsvSource: DataSource = {
    type: "csv",
    fileName: "circles.csv",
  };
  const validGasSource: DataSource = {
    type: "gas",
    gasUrl: "https://script.google.com/macros/s/123/exec",
    sheetName: "Sheet1",
  };
  const validNow = "2026-07-21T04:36:34.000Z";

  test("creates empty state as schemaVersion 2", () => {
    const state = createEmptyEventDayState(validCsvSource, "g-001", validNow);
    expect(state.schemaVersion).toBe(2);
    expect(state.circleStates).toEqual({});
    expect(getCircleVisitState(state.circleStates, "A-01")).toBe("pending");
  });

  test("migrates legacy purchased-only state to schemaVersion 2 circleStates", () => {
    const legacyV1 = {
      schemaVersion: 1,
      source: validCsvSource,
      sourceGeneration: "g-001",
      circles: [{ space: "A-01" }, { space: "B-02" }],
      purchased: ["A-01"],
      hold: [],
      history: [{ type: "purchase", space: "A-01", timestamp: validNow }],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: validNow,
        updatedAt: validNow,
        sourceUpdatedAt: validNow,
      },
    };

    const parsed = parseLocalEventDayState(legacyV1);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.circleStates).toEqual({ "A-01": "purchased" });
    expect(getCircleVisitState(parsed.circleStates, "A-01")).toBe("purchased");
    expect(getCircleVisitState(parsed.circleStates, "B-02")).toBe("pending");
    // legacy history/redo not preserved in v2
    expect(
      (parsed as unknown as Record<string, unknown>).history,
    ).toBeUndefined();
    expect((parsed as unknown as Record<string, unknown>).redo).toBeUndefined();
  });

  test("migrates legacy hold-only state to schemaVersion 2 circleStates", () => {
    const legacyV1 = {
      schemaVersion: 1,
      source: validCsvSource,
      sourceGeneration: "g-001",
      circles: [{ space: "A-01" }, { space: "B-02" }],
      purchased: [],
      hold: ["B-02"],
      history: [{ type: "hold", space: "B-02", timestamp: validNow }],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: validNow,
        updatedAt: validNow,
        sourceUpdatedAt: validNow,
      },
    };

    const parsed = parseLocalEventDayState(legacyV1);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.circleStates).toEqual({ "B-02": "held" });
    expect(getCircleVisitState(parsed.circleStates, "B-02")).toBe("held");
  });

  test("migrates legacy state with purchased and hold duplicate by prioritizing purchased", () => {
    const legacyV1 = {
      schemaVersion: 1,
      source: validCsvSource,
      sourceGeneration: "g-001",
      circles: [{ space: "A-01" }],
      purchased: ["A-01"],
      hold: ["A-01"],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: validNow,
        updatedAt: validNow,
        sourceUpdatedAt: validNow,
      },
    };

    const parsed = parseLocalEventDayState(legacyV1);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.circleStates).toEqual({ "A-01": "purchased" });
  });

  test("preserves gasOutbox and source metadata on migration", () => {
    const legacyGasV1 = {
      schemaVersion: 1,
      source: validGasSource,
      sourceGeneration: "g-001",
      circles: [{ space: "A-01" }],
      purchased: ["A-01"],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [
        {
          id: "out-001",
          eventId: "demo-v1",
          dayId: "day1",
          sourceGeneration: "g-001",
          gasUrl: "https://script.google.com/macros/s/123/exec",
          sheetName: "Sheet1",
          space: "A-01",
          purchased: true,
          createdAt: validNow,
          attempts: 0,
          lastError: null,
        },
      ],
      timestamps: {
        createdAt: validNow,
        updatedAt: validNow,
        sourceUpdatedAt: validNow,
      },
    };

    const parsed = parseLocalEventDayState(legacyGasV1);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.source).toEqual(validGasSource);
    expect(parsed.sourceGeneration).toBe("g-001");
    expect(parsed.gasOutbox).toHaveLength(1);
    expect(parsed.gasOutbox[0].id).toBe("out-001");
  });

  test("rejects malformed legacy value without throwing unhandled non-StorageSchemaError", () => {
    const malformedLegacy = {
      schemaVersion: 1,
      source: validCsvSource,
      sourceGeneration: "g-001",
      circles: [{ space: "A-01" }],
      purchased: "invalid_not_array",
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: validNow,
        updatedAt: validNow,
        sourceUpdatedAt: validNow,
      },
    };

    expect(() => parseLocalEventDayState(malformedLegacy)).toThrow(
      StorageSchemaError,
    );
  });

  test("validates exclusive state transitions", () => {
    // Valid transitions
    expect(transitionCircleVisitState("pending", "held")).toBe("held");
    expect(transitionCircleVisitState("pending", "purchased")).toBe(
      "purchased",
    );
    expect(transitionCircleVisitState("pending", "excluded")).toBe("excluded");
    expect(transitionCircleVisitState("held", "pending")).toBe("pending");
    expect(transitionCircleVisitState("held", "purchased")).toBe("purchased");
    expect(transitionCircleVisitState("held", "excluded")).toBe("excluded");
    expect(transitionCircleVisitState("purchased", "pending")).toBe("pending");
    expect(transitionCircleVisitState("excluded", "pending")).toBe("pending");

    // Invalid transitions throw error
    expect(() => transitionCircleVisitState("purchased", "held")).toThrow();
    expect(() => transitionCircleVisitState("purchased", "excluded")).toThrow();
    expect(() => transitionCircleVisitState("excluded", "held")).toThrow();
    expect(() => transitionCircleVisitState("excluded", "purchased")).toThrow();
  });
});
