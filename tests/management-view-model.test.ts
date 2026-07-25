import { describe, expect, it, vi } from "vitest";
import type {
  EventRegistryV1,
  GasOutboxEntry,
  LocalEventDayState,
  SourceDiff,
} from "../apps/webapp/js/types/domain";
import {
  dispatchManagementEvent,
  type ManagementEventDetailMap,
} from "../apps/webapp/js/ui/management-events";
import {
  buildDeleteOptions,
  buildEventDayOptions,
  formatOutbox,
  formatSourceDiff,
  formatSourceSummary,
} from "../apps/webapp/js/ui/management-view-model";

const sampleRegistry: EventRegistryV1 = {
  schemaVersion: 1,
  events: [
    {
      eventId: "c104",
      displayName: "コミックマーケット104",
      mapBundle: "demo-v1",
      days: [
        { dayId: "day1", displayName: "1日目 (日)" },
        { dayId: "day2", displayName: "2日目 (月)" },
      ],
    },
    {
      eventId: "c105",
      displayName: "コミックマーケット105",
      mapBundle: "demo-v1",
      days: [{ dayId: "day1", displayName: "1日目" }],
    },
  ],
};

const sampleCsvState: LocalEventDayState = {
  schemaVersion: 1,
  source: { type: "csv", fileName: "circles_day1.csv" },
  sourceGeneration: "gen_1",
  circles: [
    {
      space: "東A-01a",
      priority: 1,
      account: "@user",
      tweet: "https://x.com/1",
      memo: "secret note",
    },
  ],
  purchased: ["東A-01a"],
  hold: [],
  history: [],
  redo: [],
  gasOutbox: [],
  timestamps: {
    createdAt: "2026-07-23T00:00:00Z",
    updatedAt: "2026-07-23T00:00:00Z",
    sourceUpdatedAt: "2026-07-23T00:00:00Z",
  },
};

const sampleGasState: LocalEventDayState = {
  schemaVersion: 1,
  source: {
    type: "gas",
    gasUrl:
      "https://script.google.com/macros/s/AKfycbx_SECRET_DEPLOYMENT_ID_12345/exec?token=SECRET_QUERY_TOKEN#secret_fragment",
    sheetName: "配置シート1",
  },
  sourceGeneration: "gen_2",
  circles: [
    {
      space: "東A-01a",
      priority: 1,
      isSale: "1",
      account: "@user",
      tweet: "https://x.com/secret",
      memo: "confidential memo",
    },
  ],
  purchased: [],
  hold: [],
  history: [],
  redo: [],
  gasOutbox: [
    {
      id: "outbox_1",
      eventId: "c104",
      dayId: "day1",
      sourceGeneration: "gen_2",
      gasUrl:
        "https://script.google.com/macros/s/AKfycbx_SECRET_DEPLOYMENT_ID_12345/exec?token=SECRET_QUERY_TOKEN",
      sheetName: "配置シート1",
      space: "東A-01a",
      purchased: true,
      createdAt: "2026-07-23T00:00:00Z",
      attempts: 2,
      lastError: "network",
    },
  ],
  timestamps: {
    createdAt: "2026-07-23T00:00:00Z",
    updatedAt: "2026-07-23T00:00:00Z",
    sourceUpdatedAt: "2026-07-23T00:00:00Z",
  },
};

describe("management-events", () => {
  it("dispatches typed management custom events with bubbles and composed", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener("event-day-select", listener);

    const detail: ManagementEventDetailMap["event-day-select"] = {
      eventId: "c104",
      dayId: "day1",
    };

    const dispatched = dispatchManagementEvent(
      target,
      "event-day-select",
      detail,
    );
    expect(dispatched).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe("event-day-select");
    expect(event.detail).toEqual(detail);
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});

describe("buildEventDayOptions", () => {
  it("builds options in registry order with correct selected and configured status", () => {
    const states = [
      { ref: { eventId: "c104", dayId: "day1" }, state: sampleGasState },
    ];
    const selected = { eventId: "c104", dayId: "day1" };

    const options = buildEventDayOptions(sampleRegistry, states, selected);
    expect(options).toHaveLength(3);

    expect(options[0]).toEqual({
      eventId: "c104",
      eventLabel: "コミックマーケット104",
      dayId: "day1",
      dayLabel: "1日目 (日)",
      configured: true,
      selected: true,
      pendingCount: 1,
    });

    expect(options[1]).toEqual({
      eventId: "c104",
      eventLabel: "コミックマーケット104",
      dayId: "day2",
      dayLabel: "2日目 (月)",
      configured: false,
      selected: false,
      pendingCount: 0,
    });

    expect(options[2]).toEqual({
      eventId: "c105",
      eventLabel: "コミックマーケット105",
      dayId: "day1",
      dayLabel: "1日目",
      configured: false,
      selected: false,
      pendingCount: 0,
    });
  });

  it("handles missing local state and unknown selected ref safely", () => {
    const options = buildEventDayOptions(sampleRegistry, [], {
      eventId: "unknown",
      dayId: "unknown",
    });
    expect(options).toHaveLength(3);
    expect(
      options.every(
        (o) => !o.selected && !o.configured && o.pendingCount === 0,
      ),
    ).toBe(true);
  });

  it("marks empty.csv sentinel with 0 circles as unconfigured (configured=false)", () => {
    const emptySentinelState: LocalEventDayState = {
      ...sampleCsvState,
      source: { type: "csv", fileName: "empty.csv" },
      circles: [],
      purchased: ["東A-01a"], // retained activity
    };

    const options = buildEventDayOptions(
      sampleRegistry,
      [{ ref: { eventId: "c104", dayId: "day1" }, state: emptySentinelState }],
      { eventId: "c104", dayId: "day1" },
    );

    expect(options[0].configured).toBe(false);
  });
});

describe("formatSourceSummary", () => {
  it("formats CSV source summary", () => {
    const summary = formatSourceSummary(sampleCsvState);
    expect(summary).toEqual({
      typeLabel: "CSV",
      detail: "circles_day1.csv",
      endpointSummary: null,
      pendingCount: 0,
    });
  });

  it("formats GAS source summary redacting deployment ID and query token", () => {
    const summary = formatSourceSummary(sampleGasState);
    expect(summary).toEqual({
      typeLabel: "Googleスプレッドシート",
      detail: "配置シート1",
      endpointSummary: "script.google.com",
      pendingCount: 1,
    });
  });

  it("fails closed for an unknown source variant", () => {
    expect(() =>
      formatSourceSummary({
        ...sampleCsvState,
        source: { type: "unknown" },
      } as unknown as LocalEventDayState),
    ).toThrow("Unsupported data source");
  });
});

describe("formatSourceDiff", () => {
  it("formats source diff with added, updated, and removed circles", () => {
    const diff: SourceDiff = {
      added: [{ space: "東A-02a", priority: 2 }],
      updated: [
        {
          before: { space: "東A-01a", priority: 1, memo: "old" },
          after: { space: "東A-01a", priority: 3, memo: "old" },
        },
      ],
      removed: [{ space: "東A-03b" }],
      unchanged: [{ space: "東A-04a" }],
    };

    const formatted = formatSourceDiff(diff);
    expect(formatted.added).toEqual([{ space: "東A-02a", changedFields: [] }]);
    expect(formatted.updated).toEqual([
      { space: "東A-01a", changedFields: ["優先度"] },
    ]);
    expect(formatted.removed).toEqual([
      { space: "東A-03b", changedFields: [] },
    ]);
    expect(formatted.countsLabel).toBe("追加: 1件 / 更新: 1件 / 削除: 1件");
  });

  it("handles empty diff", () => {
    const diff: SourceDiff = {
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
    };
    const formatted = formatSourceDiff(diff);
    expect(formatted.added).toEqual([]);
    expect(formatted.updated).toEqual([]);
    expect(formatted.removed).toEqual([]);
    expect(formatted.countsLabel).toBe("追加: 0件 / 更新: 0件 / 削除: 0件");
  });
});

describe("formatOutbox", () => {
  it("formats outbox entries with safe Japanese labels", () => {
    const entries: GasOutboxEntry[] = [
      {
        id: "outbox_1",
        eventId: "c104",
        dayId: "day1",
        sourceGeneration: "gen_2",
        gasUrl: "https://script.google.com/macros/s/SECRET/exec",
        sheetName: "配置シート1",
        space: "東A-01a",
        purchased: true,
        createdAt: "2026-07-23T00:00:00Z",
        attempts: 2,
        lastError: "network",
      },
      {
        id: "outbox_2",
        eventId: "c104",
        dayId: "day2",
        sourceGeneration: "gen_2",
        gasUrl: "https://script.google.com/macros/s/SECRET/exec",
        sheetName: "配置シート2",
        space: "西A-05b",
        purchased: false,
        createdAt: "2026-07-23T00:00:00Z",
        attempts: 0,
        lastError: null,
      },
      {
        id: "outbox_3",
        eventId: "c104",
        dayId: "day1",
        sourceGeneration: "gen_2",
        gasUrl: "https://script.google.com/macros/s/SECRET/exec",
        sheetName: "配置シート1",
        space: "東A-01b",
        purchased: true,
        createdAt: "2026-07-23T00:00:00Z",
        attempts: 1,
        lastError: "http-500",
      },
    ];

    const formatted = formatOutbox(entries, sampleRegistry);
    expect(formatted).toHaveLength(3);

    expect(formatted[0]).toEqual({
      id: "outbox_1",
      refLabel: "コミックマーケット104 1日目 (日)",
      sourceLabel: "配置シート1",
      space: "東A-01a",
      desiredLabel: "購入済みにする",
      attemptsLabel: "2回試行",
      errorLabel: "通信エラー",
    });

    expect(formatted[1]).toEqual({
      id: "outbox_2",
      refLabel: "コミックマーケット104 2日目 (月)",
      sourceLabel: "配置シート2",
      space: "西A-05b",
      desiredLabel: "購入を取り消す",
      attemptsLabel: "0回試行",
      errorLabel: null,
    });

    expect(formatted[2]).toEqual({
      id: "outbox_3",
      refLabel: "コミックマーケット104 1日目 (日)",
      sourceLabel: "配置シート1",
      space: "東A-01b",
      desiredLabel: "購入済みにする",
      attemptsLabel: "1回試行",
      errorLabel: "サーバーエラー (500)",
    });
  });
});

describe("buildDeleteOptions", () => {
  it("builds delete options when unblocked (pendingCount === 0)", () => {
    const options = buildDeleteOptions({
      selected: { eventId: "c104", dayId: "day1" },
      eventDayCount: 2,
      activeCircleCount: 15,
      activityCount: 3,
      pendingCount: 0,
    });

    expect(options).toHaveLength(4);
    expect(options[0]).toEqual({
      scope: { type: "circles", ref: { eventId: "c104", dayId: "day1" } },
      label: "サークルリストの削除（15件）",
      consequence:
        "サークル配置情報を削除し、空のリストにします。購入・チェックの活動履歴は保持されます。",
      blocked: false,
      blockedReason: null,
    });

    expect(options[1]).toEqual({
      scope: { type: "activity", ref: { eventId: "c104", dayId: "day1" } },
      label: "購入・チェック履歴の削除（3件）",
      consequence:
        "この日の購入済み・チェック状態・操作履歴をすべて消去します。サークル情報は保持されます。",
      blocked: false,
      blockedReason: null,
    });

    expect(options[2]).toEqual({
      scope: { type: "event-day", ref: { eventId: "c104", dayId: "day1" } },
      label: "この日（データ）の削除",
      consequence: "この日程のサークル情報および履歴をすべて削除します。",
      blocked: false,
      blockedReason: null,
    });

    expect(options[3]).toEqual({
      scope: { type: "all-events" },
      label: "全日程データの削除（2日程）",
      consequence:
        "登録されている全日程のサークル情報・履歴・設定を消去し、初期状態に戻します。",
      blocked: false,
      blockedReason: null,
    });
  });

  it("blocks all delete options when pendingCount > 0", () => {
    const options = buildDeleteOptions({
      selected: { eventId: "c104", dayId: "day1" },
      eventDayCount: 2,
      activeCircleCount: 15,
      activityCount: 3,
      pendingCount: 2,
    });

    expect(options).toHaveLength(4);
    for (const opt of options) {
      expect(opt.blocked).toBe(true);
      expect(opt.blockedReason).toBe(
        "送信待ちのGAS同期があるため削除できません。同期を完了するか廃棄してください。",
      );
    }
  });

  it("does not expose mutable input refs through frozen scopes", () => {
    const selected = { eventId: "c104", dayId: "day1" };
    const options = buildDeleteOptions({
      selected,
      eventDayCount: 1,
      activeCircleCount: 0,
      activityCount: 0,
      pendingCount: 0,
    });

    const circlesScope = options[0].scope;
    if (circlesScope.type !== "circles") throw new Error("unexpected scope");
    expect(circlesScope.ref).not.toBe(selected);
    expect(Object.isFrozen(circlesScope)).toBe(true);
    expect(Object.isFrozen(circlesScope.ref)).toBe(true);
    expect(Object.isFrozen(options[3].scope)).toBe(true);
  });
});

describe("Sensitive Data Leakage Audit (Step 3)", () => {
  it("ensures no secret tokens, deployment paths, or raw urls are leaked into view models", () => {
    const secretUrl =
      "https://script.google.com/macros/s/AKfycbx_SENSITIVE_DEPLOYMENT_KEY_9999/exec?access_token=TOP_SECRET_TOKEN#secret_anchor";
    const sensitiveState: LocalEventDayState = {
      ...sampleGasState,
      source: {
        type: "gas",
        gasUrl: secretUrl,
        sheetName: "秘密の配置シート",
      },
      circles: [
        {
          space: "東A-01a",
          memo: "VERY_SECRET_MEMO_CONTENT",
          tweet: "https://twitter.com/secret_account/status/123456",
        },
      ],
      gasOutbox: [
        {
          id: "outbox_sensitive",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen_secret",
          gasUrl: secretUrl,
          sheetName: "秘密の配置シート",
          space: "東A-01a",
          purchased: true,
          createdAt: "2026-07-23T00:00:00Z",
          attempts: 1,
          lastError:
            "Unexpected runtime failure at line 42: Error: secret stack trace",
        },
      ],
    };

    const summary = formatSourceSummary(sensitiveState);
    const serializedSummary = JSON.stringify(summary);

    expect(serializedSummary).not.toContain(
      "AKfycbx_SENSITIVE_DEPLOYMENT_KEY_9999",
    );
    expect(serializedSummary).not.toContain("TOP_SECRET_TOKEN");
    expect(serializedSummary).not.toContain("/macros/s/");

    const outbox = formatOutbox(sensitiveState.gasOutbox, sampleRegistry);
    const serializedOutbox = JSON.stringify(outbox);

    expect(serializedOutbox).not.toContain(
      "AKfycbx_SENSITIVE_DEPLOYMENT_KEY_9999",
    );
    expect(serializedOutbox).not.toContain("TOP_SECRET_TOKEN");
    expect(serializedOutbox).not.toContain("secret stack trace");
    expect(serializedOutbox).not.toContain("VERY_SECRET_MEMO_CONTENT");

    const unknownCategoryOutbox = formatOutbox(
      [
        {
          ...sensitiveState.gasOutbox[0],
          lastError: "http-https://secret.example/token",
        },
      ],
      sampleRegistry,
    );
    expect(JSON.stringify(unknownCategoryOutbox)).not.toContain(
      "secret.example",
    );
    expect(unknownCategoryOutbox[0].errorLabel).toBe("送信エラー");

    const diff: SourceDiff = {
      added: [],
      updated: [
        {
          before: { space: "東A-01a", memo: "VERY_SECRET_MEMO_CONTENT" },
          after: { space: "東A-01a", memo: "NEW_SECRET_MEMO_CONTENT" },
        },
      ],
      removed: [],
      unchanged: [],
    };
    const diffVm = formatSourceDiff(diff);
    const serializedDiff = JSON.stringify(diffVm);

    expect(serializedDiff).not.toContain("VERY_SECRET_MEMO_CONTENT");
    expect(serializedDiff).not.toContain("NEW_SECRET_MEMO_CONTENT");
  });
});
