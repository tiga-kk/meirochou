export type RouteMotionPreference = "system" | "always" | "off";

export function normalizeRouteMotionPreference(
  value: unknown,
): RouteMotionPreference {
  return value === "always" || value === "off" || value === "system"
    ? value
    : "system";
}

export function resolveRouteMotionEnabled(input: {
  preference: RouteMotionPreference;
  prefersReducedMotion: boolean;
}): boolean {
  if (input.preference === "always") return true;
  if (input.preference === "off") return false;
  return !input.prefersReducedMotion;
}
