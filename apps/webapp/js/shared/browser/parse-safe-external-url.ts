export function parseSafeExternalUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Ignore invalid URLs
  }
  return "";
}

export { parseSafeExternalUrl as normalizeExternalUrl };
