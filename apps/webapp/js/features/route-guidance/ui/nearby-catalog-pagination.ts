export interface NearbyCatalogPage<T> {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly startNumber: number;
  readonly endNumber: number;
  readonly total: number;
  readonly items: readonly T[];
}

export function paginateNearbyCatalog<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize = 10,
): NearbyCatalogPage<T> {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePageIndex = Number.isFinite(pageIndex)
    ? Math.min(pageCount - 1, Math.max(0, Math.floor(pageIndex)))
    : 0;
  const start = safePageIndex * size;
  const pageItems = items.slice(start, start + size);
  return {
    pageIndex: safePageIndex,
    pageCount,
    startNumber: pageItems.length ? start + 1 : 0,
    endNumber: pageItems.length ? start + pageItems.length : 0,
    total,
    items: pageItems,
  };
}
