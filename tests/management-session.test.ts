import { describe, expect, it, vi } from "vitest";
import type { EventDayRef } from "../apps/webapp/js/types/domain";
import {
  type ActiveSourcePreview,
  ManagementSession,
} from "../apps/webapp/js/ui/management-session";

describe("ManagementSession", () => {
  it("manages independent busy lanes", () => {
    const session = new ManagementSession();
    expect(session.isBusy("transition")).toBe(false);
    expect(session.isAnyBusy()).toBe(false);

    session.setBusy("source-request", true);
    expect(session.isBusy("source-request")).toBe(true);
    expect(session.isBusy("transition")).toBe(false);
    expect(session.isAnyBusy()).toBe(true);

    session.setBusy("source-request", false);
    expect(session.isBusy("source-request")).toBe(false);
    expect(session.isAnyBusy()).toBe(false);
  });

  it("generates monotonically increasing request tokens and validates latest", () => {
    const session = new ManagementSession();
    const token1 = session.nextRequestToken();
    const token2 = session.nextRequestToken();

    expect(token2).toBeGreaterThan(token1);
    expect(session.isLatestRequestToken(token1)).toBe(false);
    expect(session.isLatestRequestToken(token2)).toBe(true);
  });

  it("manages and aborts GAS request controller", () => {
    const session = new ManagementSession();
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, "abort");

    session.setGasAbortController(controller);
    expect(session.getGasAbortController()).toBe(controller);

    session.abortGasRequest();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(session.getGasAbortController()).toBeNull();
  });

  it("stores and clears active preview using frozen copies", () => {
    const session = new ManagementSession();
    const ref: EventDayRef = { eventId: "c104", dayId: "day1" };
    const preview: ActiveSourcePreview = {
      kind: "gas",
      ref,
      previewId: "prev_1",
      mode: "refresh",
      expectedSourceGeneration: "gen_1",
    };

    session.setActivePreview(preview);
    const retrieved = session.getActivePreview();
    expect(retrieved).toEqual(preview);
    expect(retrieved?.ref).not.toBe(ref);
    expect(Object.isFrozen(retrieved)).toBe(true);
    expect(Object.isFrozen(retrieved?.ref)).toBe(true);

    session.clearPreview();
    expect(session.getActivePreview()).toBeNull();
  });

  it("resets in-flight work and preview on event/day change or settings close", () => {
    const session = new ManagementSession();
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, "abort");

    session.setGasAbortController(controller);
    session.setActivePreview({
      kind: "csv",
      ref: { eventId: "c104", dayId: "day1" },
      previewId: "prev_csv",
      expectedSourceGeneration: "gen_0",
    });
    session.setBusy("source-request", true);

    const oldToken = session.nextRequestToken();

    session.onEventDayChange();

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(session.getActivePreview()).toBeNull();
    expect(session.isLatestRequestToken(oldToken)).toBe(false);
    expect(session.isBusy("source-request")).toBe(false);

    // On settings close
    session.setBusy("delete", true);
    session.onSettingsClose();
    expect(session.isAnyBusy()).toBe(false);
  });
});
