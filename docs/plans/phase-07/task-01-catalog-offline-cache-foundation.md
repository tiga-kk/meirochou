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
- `publicDir`を有効化して`apps/webapp`配下を無差別に公開しない。
- 同じURLのresponse bodyが裏で変わったことを、opaque responseを読んで自動検出しようとしない。
- catalog以外のGETや非画像requestを「cacheに偶然matchした」だけで横取りしない。

## 対象ファイル

**作成:**
- `apps/webapp/catalog-service-worker.js`
- `apps/webapp/js/features/catalog-offline/application/catalog-offline-cache-port.ts`
- `apps/webapp/js/features/catalog-offline/infrastructure/browser-catalog-offline-cache.ts`
- `apps/webapp/js/features/catalog-offline/use-cases/cache-event-day-catalogs.ts`
- `apps/webapp/js/features/catalog-offline/use-cases/get-catalog-offline-status.ts`
- `apps/webapp/js/features/catalog-offline/public-api.ts`
- `tests/catalog-offline-cache.test.ts`
- `tests/catalog-offline-use-cases.test.ts`
- `tests/e2e/catalog-offline.spec.ts`

**変更:**
- `apps/webapp/js/app/browser-entrypoint.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `vite.config.ts`
- `scripts/verify-webapp-build.mjs`
- `README.md`

## インターフェース

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

## Cache identity契約

Phase 7ではcatalog imageの**URL文字列をcontent identity兼Cache Storage key**として扱う。

- 同じURLはevent/dayを跨いでも1つのcache entryを共有する。
- `cacheAll()`は既に同じURLがcache済みなら再downloadしない。
- source refreshで同じURLのresponse bodyだけが外部側で差し替わっても、Phase 7では自動検出・自動更新しない。
- 新しい画像内容を確実に取得したいsourceは、新しいURLを返すことを前提とする。

これはopaque cross-origin responseの内容比較やETag管理を追加しないための明示的な制約であり、実装担当が独自のrefresh metadata DBを追加してはいけない。

## 手順

- [ ] **Step 1: cache portのRED unit testを書く**

Cache APIをfakeして、already cached、newly cached、failedの3種を固定する。

```ts
expect(result.cached).toContain(urlA);
expect(result.cached).toContain(urlB);
expect(result.failed).toEqual([{ url: urlC, reason: expect.any(String) }]);
```

opaque responseもcache成功として扱うtestを追加する。

同じURLを2回`cacheAll()`へ渡しても2回目はnetwork fetchされず、status/countは1件として扱われることも固定する。

- [ ] **Step 2: partial success Use CaseのRED testを書く**

1件失敗しても成功済み2件をremoveしないこと、progressが`1/3`, `2/3`, `3/3`まで進むことを確認する。

already cached URLは再fetchせずprogress/countへ含め、retry時に不足分だけnetworkへ取りに行くことを固定する。

- [ ] **Step 3: build contractのRED testを追加する**

`vite.config.ts`は現在`publicDir:false`なので、source workerを置くだけでは`dist/webapp`へ出ない。`scripts/verify-webapp-build.mjs`へ、production build後に次が存在することを先に要求する。

```text
dist/webapp/catalog-service-worker.js
```

このREDはworker copy実装前に失敗することを確認する。

- [ ] **Step 4: REDを確認する**

```bash
npx vitest run --root . tests/catalog-offline-cache.test.ts tests/catalog-offline-use-cases.test.ts
npm run build:webapp
npm run verify:webapp:build
```

- [ ] **Step 5: Service Workerを実装する**

controlled pageから発生した`GET` image requestだけを対象にする。requestがcatalog cacheにmatchすればcacheを返し、matchしなければnetworkへ流す。HTML/JS/CSS/map assetまでcache-firstへ変更しない。

workerは固定cache name`comipath-catalog-v1`を使用する。activate時に古いversionを消す場合は、cache名が`comipath-catalog-`prefixかつcurrent nameと異なるものだけを対象にし、無関係なCache Storageを消さない。

Service Worker側は通常navigation/app shellのfetchへ介入しない。別persistent allowlist DBは作らず、`request.method === "GET"`かつ`request.destination === "image"`を満たすrequestについてcatalog cacheを`match`し、matchなしなら即networkへ委譲する。

cache entryの有無を「catalogとして事前保存済み」の判定に使う。map画像など別用途の画像がcatalog cacheへ明示登録されていない限り横取りしない。

- [ ] **Step 6: registrationをbrowser entrypointから行う**

```ts
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./catalog-service-worker.js");
}
```

registration failureはconsole diagnosticに留め、app startupを失敗させない。test環境で`navigator.serviceWorker`がない場合も通常起動できる。

`vite.config.ts`の`base:"./"`を維持する前提で、worker URLは現在pageと同じdirectory scopeへ解決される。scopeを`/`へhard-codeしない。

- [ ] **Step 7: browser infrastructure portを実装する**

cross-origin catalog URLは`mode:"no-cors"`相当のopaque responseを許容するRequestでfetchする。`response.type === "opaque"`はcache可能な成功として扱い、`response.ok === false`だけで誤ってfailureにしない。same-origin/basic responseは通常のHTTP失敗を拒否する。

同一URLをdedupeし、`cache.match(request)`で既存cacheを確認してから不足分だけfetch/putする。

- [ ] **Step 8: Storage persistenceをbest-effortで要求する**

`navigator.storage?.persist?.()`はoffline準備開始時または初回cache時に1回だけbest-effortで呼ぶ。false/rejectでもcache処理を続ける。permission結果をoffline ready判定には使わない。

- [ ] **Step 9: Vite buildへworkerを明示コピーする**

`publicDir:false`は維持する。`vite.config.ts`の既存build plugin/`closeBundle()`に、次の単一fileだけを明示的にcopyする処理を追加する。

```text
apps/webapp/catalog-service-worker.js
→ dist/webapp/catalog-service-worker.js
```

worker以外のsource treeをcopyしない。`scripts/verify-webapp-build.mjs`はworker存在と、HTMLからregistrationされる相対URL契約を検証する。

- [ ] **Step 10: E2Eでoffline fallbackを証明する**

`tests/e2e/catalog-offline.spec.ts`で実Service Workerを使う。

1. test catalog image URLsをnetwork経由でcacheする。
2. `navigator.serviceWorker.ready`と`navigator.serviceWorker.controller`を確認し、必要なら初回registration後に1回reloadする。
3. cache statusが全件savedになることを確認する。
4. image network routeをabortするかbrowser contextをofflineへする。
5. Galleryとcurrent catalog双方でcache済みimageが表示される。
6. 未保存URLは`No Image / オフライン未保存`fallbackになる。
7. app shell/map assetは通常の既存挙動を維持する。
8. catalog cacheへ入っていない通常画像requestはnetworkへ委譲される。

- [ ] **Step 11: public tree/security auditを実行する**

```bash
node scripts/audit-public-tree.mjs
```

Service Worker sourceにもdeployed GAS URL、credential、local absolute pathを埋め込まない。audit script自体のallowlist変更は不要な設計を維持する。

- [ ] **Step 12: focused/full verification**

```bash
npx vitest run --root . tests/catalog-offline-cache.test.ts tests/catalog-offline-use-cases.test.ts
npm run build:webapp
npm run verify:webapp:build
npx playwright test tests/e2e/catalog-offline.spec.ts
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 13: README capability表を更新する**

`README.md`のService Worker/PWA説明を次の意味に合わせる。

```text
Service Worker: catalog image offline cacheのみ対応
Installable PWA: 非対応
Background Sync: 非対応
```

同じURLの外部画像内容が後から差し替わっても自動refreshしないURL identity制約は、ユーザー向け詳細へ書く必要はないが、開発者向け説明に誤って「常に最新版へ更新」と記載しない。

- [ ] **Step 14: commit**

```bash
git add apps/webapp/catalog-service-worker.js \
  apps/webapp/js/features/catalog-offline \
  apps/webapp/js/app/browser-entrypoint.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  vite.config.ts scripts/verify-webapp-build.mjs \
  tests/catalog-offline-cache.test.ts tests/catalog-offline-use-cases.test.ts \
  tests/e2e/catalog-offline.spec.ts README.md
git commit -m "feat(offline): cache catalog images for event use"
```

## 受入条件

- user actionから任意URL集合をCache Storageへ保存できるportがある。
- already cached URLを再downloadしない。
- URL文字列がPhase 7のcache identityであることが明示され、同一URLのbody差し替えを自動検出しない。
- partial failureで成功済みcacheが残る。
- opaque cross-origin image responseをcacheできる。
- cached external imageをnetwork failure時に表示できる。
- Service WorkerはGET imageかつcatalog cache hitだけをcache fallbackし、app shell等を横取りしない。
- `dist/webapp/catalog-service-worker.js`がproduction buildへ必ず含まれる。
- service worker registration/cache failureでapp startupが止まらない。
- app shell全体をcache-firstへしない。
- Service Worker以外のPWA機能を追加しない。
