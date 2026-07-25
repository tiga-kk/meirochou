import { describe, expect, it } from "vitest";
import {
  type DownloadAdapter,
  downloadCsv,
  formatCsvExportFilename,
} from "../apps/webapp/js/ui/csv-download";

describe("formatCsvExportFilename", () => {
  it("formats filename with padded date and time components", () => {
    const ref = { eventId: "c104", dayId: "day1" };
    // 2026-07-05 09:04:08
    const date = new Date(2026, 6, 5, 9, 4, 8);
    const filename = formatCsvExportFilename(ref, date);
    expect(filename).toBe("comipath-c104-day1-20260705-090408.csv");
  });

  it("handles valid IDs at 1 and 64 characters", () => {
    const minRef = { eventId: "a", dayId: "1" };
    const maxRef = {
      eventId: "a".repeat(64),
      dayId: "b".repeat(64),
    };
    const date = new Date(2026, 6, 25, 12, 0, 0);

    expect(formatCsvExportFilename(minRef, date)).toBe(
      "comipath-a-1-20260725-120000.csv",
    );
    expect(formatCsvExportFilename(maxRef, date)).toBe(
      `comipath-${"a".repeat(64)}-${"b".repeat(64)}-20260725-120000.csv`,
    );
  });

  it("rejects 65-character or invalid delimiter IDs and invalid dates", () => {
    const invalidRef = { eventId: "a".repeat(65), dayId: "day1" };
    const delimiterRef = { eventId: "c104:invalid", dayId: "day1" };
    const date = new Date(2026, 6, 25, 12, 0, 0);
    const invalidDate = new Date("invalid date");

    expect(() => formatCsvExportFilename(invalidRef, date)).toThrow();
    expect(() => formatCsvExportFilename(delimiterRef, date)).toThrow();
    expect(() =>
      formatCsvExportFilename({ eventId: "c104", dayId: "day1" }, invalidDate),
    ).toThrow();
  });
});

describe("downloadCsv", () => {
  it("creates Blob with UTF-8 MIME, calls adapter, and revokes URL in finally", () => {
    let createdBlob: Blob | null = null;
    const calls: string[] = [];

    const mockAdapter: DownloadAdapter = {
      createObjectURL: (blob: Blob) => {
        createdBlob = blob;
        calls.push("createObjectURL");
        return "blob:http://localhost/mock-url";
      },
      click: (url: string, filename: string) => {
        calls.push(`click:${url}:${filename}`);
      },
      revokeObjectURL: (url: string) => {
        calls.push(`revokeObjectURL:${url}`);
      },
    };

    const csvContent = "space,priority\n東A01a,1\n";
    downloadCsv(csvContent, "test.csv", mockAdapter);

    expect(createdBlob).not.toBeNull();
    expect(createdBlob?.type).toBe("text/csv;charset=utf-8");
    expect(calls).toEqual([
      "createObjectURL",
      "click:blob:http://localhost/mock-url:test.csv",
      "revokeObjectURL:blob:http://localhost/mock-url",
    ]);
  });

  it("revokes ObjectURL even if adapter.click throws an error", () => {
    const calls: string[] = [];
    const mockAdapter: DownloadAdapter = {
      createObjectURL: () => {
        calls.push("createObjectURL");
        return "blob:http://localhost/mock-url";
      },
      click: () => {
        calls.push("click");
        throw new Error("Click failed");
      },
      revokeObjectURL: (url: string) => {
        calls.push(`revoke:${url}`);
      },
    };

    expect(() => downloadCsv("header\nval\n", "test.csv", mockAdapter)).toThrow(
      "Click failed",
    );
    expect(calls).toEqual([
      "createObjectURL",
      "click",
      "revoke:blob:http://localhost/mock-url",
    ]);
  });

  it("does not call revokeObjectURL if createObjectURL throws", () => {
    const calls: string[] = [];
    const mockAdapter: DownloadAdapter = {
      createObjectURL: () => {
        calls.push("createObjectURL");
        throw new Error("Blob failed");
      },
      click: () => {
        calls.push("click");
      },
      revokeObjectURL: () => {
        calls.push("revoke");
      },
    };

    expect(() => downloadCsv("header\nval\n", "test.csv", mockAdapter)).toThrow(
      "Blob failed",
    );
    expect(calls).toEqual(["createObjectURL"]);
  });

  it("does not click again when revokeObjectURL throws after a successful click", () => {
    const calls: string[] = [];
    const mockAdapter: DownloadAdapter = {
      createObjectURL: () => {
        calls.push("createObjectURL");
        return "blob:http://localhost/mock-url";
      },
      click: () => {
        calls.push("click");
      },
      revokeObjectURL: () => {
        calls.push("revoke");
        throw new Error("Revoke failed");
      },
    };

    expect(() => downloadCsv("header\nval\n", "test.csv", mockAdapter)).toThrow(
      "Revoke failed",
    );
    expect(calls).toEqual(["createObjectURL", "click", "revoke"]);
  });
});
