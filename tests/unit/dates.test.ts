import { describe, expect, it } from "vitest";
import { atLocal } from "../../src/utils/dates.js";

describe("atLocal (wall clock in a time zone -> instant)", () => {
  it("handles Asia/Colombo (+05:30, no DST)", () => {
    expect(atLocal("2026-10-13", "18:40", "Asia/Colombo").toISOString()).toBe(
      "2026-10-13T13:10:00.000Z",
    );
    expect(atLocal("2026-01-01", "00:00", "Asia/Colombo").toISOString()).toBe(
      "2025-12-31T18:30:00.000Z",
    );
  });

  it("honours daylight saving time", () => {
    expect(atLocal("2026-07-01", "12:00", "America/New_York").toISOString()).toBe(
      "2026-07-01T16:00:00.000Z",
    ); // EDT
    expect(atLocal("2026-01-01", "12:00", "America/New_York").toISOString()).toBe(
      "2026-01-01T17:00:00.000Z",
    ); // EST
    expect(atLocal("2026-03-29", "12:00", "Europe/London").toISOString()).toBe(
      "2026-03-29T11:00:00.000Z",
    ); // BST begins that morning
  });

  it("handles UTC and negative-offset zones", () => {
    expect(atLocal("2026-06-15", "09:30", "UTC").toISOString()).toBe("2026-06-15T09:30:00.000Z");
    expect(atLocal("2026-06-15", "09:30", "America/Sao_Paulo").toISOString()).toBe(
      "2026-06-15T12:30:00.000Z",
    );
  });
});
