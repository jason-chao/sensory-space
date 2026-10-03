import { describe, expect, it, vi } from "vitest";
import { shouldEnable, debouncer, screenClass, PUBLIC_HOSTS } from "../src/analytics";

describe("usage counting locks", () => {
  const env = { id: "abc", src: "https://stats.example/script.js" };
  it("is on only with an id, a script address and a public host name", () => {
    expect(shouldEnable(env, "sensory-space.org")).toBe(true);
    expect(shouldEnable(env, "WWW.sensory-space.org")).toBe(true);
    expect(shouldEnable(env, "localhost")).toBe(false);
    expect(shouldEnable(env, "sensory-space.pages.dev")).toBe(false);
    expect(shouldEnable(env, "192.168.1.20")).toBe(false);
    expect(shouldEnable({ id: "", src: env.src }, "sensory-space.org")).toBe(false);
    expect(shouldEnable({ id: env.id }, "sensory-space.org")).toBe(false);
    expect(shouldEnable({}, "sensory-space.org")).toBe(false);
  });
  it("lists only the public host names", () => {
    expect(PUBLIC_HOSTS).toEqual(["sensory-space.org", "www.sensory-space.org"]);
  });
  it("debounces per key and keeps the last call", () => {
    vi.useFakeTimers();
    const d = debouncer(100); const calls: string[] = [];
    d("a", () => calls.push("a1")); d("a", () => calls.push("a2")); d("b", () => calls.push("b1"));
    vi.advanceTimersByTime(150);
    expect(calls.sort()).toEqual(["a2", "b1"]);
    vi.useRealTimers();
  });
  it("classifies screens coarsely", () => {
    expect(screenClass(3840)).toBe("4k"); expect(screenClass(1920)).toBe("hd"); expect(screenClass(1366)).toBe("laptop"); expect(screenClass(800)).toBe("tablet"); expect(screenClass(390)).toBe("phone");
  });
});
