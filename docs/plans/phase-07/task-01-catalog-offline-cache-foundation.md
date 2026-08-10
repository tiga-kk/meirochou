# Phase 7 Task 1: Service Worker + Cache Storageのcatalog offline基盤

## 目標

現在のevent/dayに含まれるcatalog image URLを明示的に事前保存し、network offlineでも保存済み画像をGalleryとRoute Guidanceから表示できるbrowser infrastructureを追加する。

## やってはいけないこと

- full PWA化しない。
- install prompt、push、periodic/background syncを追加しない。
- catalog imageをLocalStorage/base64へ保存しない。
- external imageのopaque response bodyを読もうとしない。
- offline cache失敗をcircle data/purchase stateのfailureへ昇格させない。
- UI componentから`caches` APIを直接操作しない。

## Files

**Create:**
- `apps/webapp/catalog-service-worker.js`
- `apps/webapp/js/features/catalog-offline/application/catalog-offline-cache-port.ts`
- `apps/webapp/js/features/catalog-offline/infrastructure/browser-catalog-offline-cache.ts`
- `apps/webapp/js/features/catalog-offline/use-cases/cache-event-day-catalogs.ts`
- `apps/webapp/js/features/catalog-offline/use-cases/get-catalog-offline-status.ts`
- `apps/webapp/js/features/catalog-offline/public-api.ts`

**Modify:**
- `apps/webapp/js/app/browser-entrypoint.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `vite.config.ts`/build verification only as required to copy the worker as a public asset
- `README.md` Service Worker capability row after completion

**Test:**
- `tests/catalog-offline-cache.test.ts`
- `tests/catalog-offline-use-cases.test.ts`
- `tests/e2e/catalog-offline.spec.ts`
- build/public-tree contract tests as needed

## Interfaces

```ts
export interface CatalogOfflineCachePort {
  getStatus(urls: readonly string[]): Promise<{
    cached: number;
    total: number;
  }>;

  cacheAll(
    urls: readonly string[],
    onProgress: (progress: { current: number; total: number }) => void,
  ): Promise<{
    cached: readonly string[];
    failed: readonly { url: string; reason: string }[];
  }>;

  remove(urls: readonly string[]): Promise<void>;
}
```

Use Case:

```ts
export interface CacheEventDayCatalogsInput {
  readonly urls: readonly string[];
  readonly onProgress: (progress: { current: number; total: number }) => void;
}

export class CacheEventDayCatalogsUseCase {
  execute(input: CacheEventDayCatalogsInput): Promise<{
    cachedCount: number;
    totalCount: number;
    failedCount: number;
  }>;
}
```

## Steps

- [ ] **Step 1: cache portのRED unit testを書く**

Cache APIをfakeして、already cached、newly cached、failedの3種を固定する。

```ts
expect(result.cached).toContain(urlA);
expect(result.cached).toContain(urlB);
expect(result.failed).toEqual([{ url: urlC, reason: expect.any(String) }]);
```

- [ ] **Step 2: partial success Use CaseのRED testを書く**

1件失敗しても成功済み2件をremoveしないこと、progressが`1/3`, `2/3`, `3/3`まで進むことを確認する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/catalog-offline-cache.test.ts tests/catalog-offline-use-cases.test.ts
```

- [ ] **Step 4: Service Workerを実装する**

scope内ページからのimage requestについて、catalog cacheにmatchがあればcacheを返し、なければnetworkへ流す。HTML/JS/CSS/map assetまでcache-firstへ変更しない。

workerは固定cache name`comipath-catalog-v1`を使用する。activate時に将来versionの古い`comipath-catalog-v*`を削除する契約を追加してよいが、無関係なCache Storageを消さない。

- [ ] **Step 5: registrationをbrowser entrypointから行う**

```ts
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./catalog-service-worker.js");
}
```

registration failureはconsole diagnosticに留め、app startupを失敗させない。

- [ ] **Step 6: browser infrastructure portを実装する**

cross-origin catalog URLはopaque responseを許容するRequestでfetchし、`response.ok`だけに依存してopaqueを誤ってfailure扱いしない。network exceptionはfailedへ分類する。

同一URLを重複downloadしないよう入力URLをdedupeする。

- [ ] **Step 7: Storage persistenceをbest-effortで要求する**

`navigator.storage?.persist?.()`はoffline準備開始時または初回cache時に1回だけbest-effortで呼べる。false/rejectでもcache処理を続ける。

- [ ] **Step 8: build/public asset contractを追加する**

production build後の`dist/webapp/catalog-service-worker.js`が存在し、repository外private assetを含まないことをverifyする。

- [ ] **Step 9: E2Eでoffline fallbackを証明する**

1. test image URLsをnetwork経由でcacheする。
2. service worker controlを待つ。
3. browser contextをofflineへする、またはimage network routeをabortする。
4. Galleryとcurrent catalog双方でcache済みimageが表示される。
5. 未保存URLはfallbackになる。

- [ ] **Step 10: focused/full verification**

```bash
npx vitest run --root . tests/catalog-offline-cache.test.ts tests/catalog-offline-use-cases.test.ts
npm run build:webapp
npm run verify:webapp:build
npm run test:e2e:ci -- --grep "offline|オフライン"
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 11: commit**

```bash
git add apps/webapp/catalog-service-worker.js \
  apps/webapp/js/features/catalog-offline \
  apps/webapp/js/app/browser-entrypoint.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  vite.config.ts tests README.md
git commit -m "feat(offline): cache catalog images for event use"
```

## 受入条件

- user actionから任意URL集合をCache Storageへ保存できるportがある。
- partial failureで成功済みcacheが残る。
- cached external imageをoffline時に表示できる。
- service worker failureでapp startupが止まらない。
- app shell全体をcache-firstへしない。
- Service Worker以外のPWA機能を追加しない。
