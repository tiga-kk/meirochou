export function resolveBundleAssetUrl(
  manifestPath: string,
  relativePath: string,
  pageHref: string,
): string {
  const manifestUrl = new URL(manifestPath, pageHref);
  return new URL(relativePath, manifestUrl).href;
}
