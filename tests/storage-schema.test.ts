import { describe, expect, test } from "vitest";
import {
  createEmptyEventDayState,
  parseLocalEventDayState,
  StorageSchemaError,
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
    expect(state.schemaVersion).toBe(1);
    expect(state.source).toEqual(validCsvSource);
    expect(state.sourceGeneration).toBe("g-001");
    expect(state.circles).toEqual([]);
    expect(state.purchased).toEqual([]);
    expect(state.hold).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.redo).toEqual([]);
    expect(state.gasOutbox).toEqual([]);
    expect(state.timestamps.createdAt).toBe(validNow);
    expect(state.timestamps.updatedAt).toBe(validNow);
    expect(state.timestamps.sourceUpdatedAt).toBe(validNow);

    // Verify it is frozen
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.source)).toBe(true);
    expect(Object.isFrozen(state.circles)).toBe(true);
    expect(Object.isFrozen(state.purchased)).toBe(true);
    expect(Object.isFrozen(state.hold)).toBe(true);
    expect(Object.isFrozen(state.history)).toBe(true);
    expect(Object.isFrozen(state.redo)).toBe(true);
    expect(Object.isFrozen(state.gasOutbox)).toBe(true);
    expect(Object.isFrozen(state.timestamps)).toBe(true);

    // Should parse cleanly
    const parsed = parseLocalEventDayState(state);
    expect(parsed).toEqual(state);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  test("rejects unknown schema version", () => {
    const state = createEmptyEventDayState(validCsvSource, "g-001", validNow);
    const malformed = { ...state, schemaVersion: 2 };
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

  test("rejects duplicate purchased/hold spaces", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );
    const stateWithCircles = {
      ...baseState,
      circles: [{ space: "A-01" }, { space: "B-02" }],
    };

    const duplicatePurchased = {
      ...stateWithCircles,
      purchased: ["A-01", "B-02", "A-01"],
    };
    expect(() => parseLocalEventDayState(duplicatePurchased)).toThrow(
      StorageSchemaError,
    );

    const duplicateHold = {
      ...stateWithCircles,
      hold: ["A-01", "A-01"],
    };
    expect(() => parseLocalEventDayState(duplicateHold)).toThrow(
      StorageSchemaError,
    );
  });

  test("rejects purchased or hold referencing an invalid/empty space (not in circles)", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );
    const stateWithCircles = {
      ...baseState,
      circles: [{ space: "A-01" }, { space: "B-02" }],
    };

    // purchased references invalid space
    const invalidPurchased = {
      ...stateWithCircles,
      purchased: ["C-03"],
    };
    expect(() => parseLocalEventDayState(invalidPurchased)).toThrow(
      StorageSchemaError,
    );

    // purchased references empty space
    const emptyPurchased = {
      ...stateWithCircles,
      purchased: [""],
    };
    expect(() => parseLocalEventDayState(emptyPurchased)).toThrow(
      StorageSchemaError,
    );

    // hold references invalid space
    const invalidHold = {
      ...stateWithCircles,
      hold: ["C-03"],
    };
    expect(() => parseLocalEventDayState(invalidHold)).toThrow(
      StorageSchemaError,
    );

    // hold references empty space
    const emptyHold = {
      ...stateWithCircles,
      hold: [""],
    };
    expect(() => parseLocalEventDayState(emptyHold)).toThrow(
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

  test("rejects history referencing a space not in the circle list or empty space", () => {
    const baseState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );

    const stateWithCircles = {
      ...baseState,
      circles: [{ space: "A-01" }, { space: "B-02" }],
    };

    // Valid history referencing existing space
    const validHistory = {
      ...stateWithCircles,
      history: [{ type: "purchase", space: "A-01", timestamp: validNow }],
    };
    expect(parseLocalEventDayState(validHistory).history.length).toBe(1);

    // Invalid history referencing non-existent space
    const invalidHistorySpace = {
      ...stateWithCircles,
      history: [{ type: "purchase", space: "C-03", timestamp: validNow }],
    };
    expect(() => parseLocalEventDayState(invalidHistorySpace)).toThrow(
      StorageSchemaError,
    );

    // Invalid history referencing empty space
    const invalidHistoryEmptySpace = {
      ...stateWithCircles,
      history: [{ type: "purchase", space: "", timestamp: validNow }],
    };
    expect(() => parseLocalEventDayState(invalidHistoryEmptySpace)).toThrow(
      StorageSchemaError,
    );

    // Invalid redo referencing non-existent space
    const invalidRedoSpace = {
      ...stateWithCircles,
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
  });
});
