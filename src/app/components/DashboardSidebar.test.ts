import { describe, it, expect } from "vitest";
import { isActive } from "./DashboardSidebar";

describe("isActive", () => {
  it("matches /dashboard exactly", () => {
    expect(isActive("/dashboard", "/dashboard")).toBe(true);
  });

  it("does not match /dashboard/seasons as active for /dashboard", () => {
    expect(isActive("/dashboard/seasons", "/dashboard")).toBe(false);
  });

  it("matches /dashboard/seasons for seasons link", () => {
    expect(isActive("/dashboard/seasons", "/dashboard/seasons")).toBe(true);
  });

  it("matches /dashboard/seasons/123 as active for seasons link", () => {
    expect(isActive("/dashboard/seasons/123", "/dashboard/seasons")).toBe(true);
  });

  it("does not match /dashboard/tournaments as active for seasons", () => {
    expect(isActive("/dashboard/tournaments", "/dashboard/seasons")).toBe(false);
  });
});
