# Phase 5B Handoff Report

**作成日:** 2026-07-26
**ステータス:** 完了 (Phase 5C handoff作成完了。Phase 5C entry gateの未確認項目あり)

---

## 1. Integrated commit range
- `b731e8e0a14cb80d27551630f79d4a8cadff046c..HEAD` (feature/phase-05b ブランチ)

## 2. C108 bundle version
- Manifest version: `1`
- Bundle path: `apps/webapp/map-bundles/C108/manifest.json`

## 3. Four area IDs and display names
1. `e456`: 東456ホール (Grid: 512 × 180, サークル数: 2,397)
2. `e7`: 東7ホール (Grid: 231 × 248, サークル数: 1,014)
3. `s12`: 南12ホール (Grid: 234 × 122, サークル数: 900)
4. `w12`: 西12ホール (Grid: 363 × 271, サークル数: 1,500)

## 4. Public manifest path
- Webapp Build / Public Dist: `dist/webapp/assets/maps/C108/manifest.json`
- Event Registry Manifest: `apps/webapp/events/manifest.json` -> `../map-bundles/C108/manifest.json`

## 5. Production event/day configuration
- `day1`: C108 Day 1 (`displayName: "C108 1日目"`, `mapBundle: "../map-bundles/C108/manifest.json"`)
- `day2`: C108 Day 2 (`displayName: "C108 2日目"`, `mapBundle: "../map-bundles/C108/manifest.json"`)
- ※ `demo-v1` は production 登録から除外され、E2E / テスト用レジストリ (`tests/fixtures/demo-v1/`) へ分離完了。

## 6. Demo fixture location
- `tests/fixtures/demo-v1/` (`manifest.json`, `demo-east`, `demo-west`)
- 公開 dist ビルド時: `dist/webapp/assets/maps/demo-v1/` に配置されテストで参照可能。

## 7. Grid value and weight contract
- **Grid Layout:** 2D Uint8Array 8-neighbor 格子
- **Cell values:**
  - `0`: 通行不可セル (blocked / wall / obstacle)
  - `1`: 通常通行可能セル (walkable base cost = 1.0)
  - `2..255`: 混雑・重み付きセル (cost multiplier)
- **移動コスト計算規約:**
  - 直進方向 ($\Delta x = 0$ または $\Delta y = 0$): $\text{cost} = \text{cell\_value} \times 1.0$
  - 斜め方向 ($\Delta x \neq 0$ かつ $\Delta y \neq 0$): $\text{cost} = \text{cell\_value} \times \sqrt{2}$

## 8. Validation commands and results
- `npm ci`: PASS (隔離clean workspace)
- `npm run verify`: PASS (webapp 398テスト、GAS 27テスト)
- `RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts`: PASS (Chromium & Mobile Chromium 計8テスト成功)
- `CI=1 npm run test:e2e`: 25 PASS、既存visual snapshot差分6件、通常実行時のC108 smoke skip 8件。snapshotは更新していない。
- `npx vitest run --root . tests/c108-map-assets.test.ts tests/event-registry.test.ts tests/map-manifest-loader.test.ts tests/public-boundary.test.mjs tests/deployment-build.test.mjs`: PASS (41 tests)
- `node scripts/audit-public-tree.mjs`: PASS (パブリック境界検証合格)
- `npm run verify:webapp:build`: PASS (26個の公開マップアセットがバイト同一であることを検証)
- `npx biome check`: PASS (静的解析・フォーマット合格)
- `git diff --check`: PASS (差分チェック合格)

## 9. Reachability results
- `e456`: 2,397 / 2,397 サークル到達可能 (未到達 0)
- `e7`: 1,014 / 1,014 サークル到達可能 (未到達 0)
- `s12`: 900 / 900 サークル到達可能 (未到達 0)
- `w12`: 1,500 / 1,500 サークル到達可能 (未到達 0)
- **総計:** C108 全 5,811 サークルのポータル到達可能性 100% 検証済み。

## 10. Browser smoke results
- Playwright デスクトップ (`chromium`) および モバイルエミュレーション (`mobile-chromium` Pixel 5) の両環境で 4 エリアすべて描画・座標一致検証成功。
- `console.error` および `pageerror` 検出 0 件。
- 許可リスト外の予期せぬ外部ネットワークリクエスト 0 件。

## 11. Benchmark results

| areaId | サークル数 (N) | Desktop 1-Source Median | Desktop 1-Source p95 | Mobile 1-Source Median | Mobile 1-Source p95 | Desktop N-Matrix p95 (s) | Mobile N-Matrix p95 (s) | Float64 メモリ | JSON 推定サイズ |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| `e456` | 2,397 | 43.25 ms | 59.53 ms | 38.55 ms | 68.27 ms | **142.69 s** | **163.66 s** | **43.84 MB** | **26.89 MB** |
| `e7` | 1,014 | 18.15 ms | 27.03 ms | 31.10 ms | 52.32 ms | 27.41 s | 53.06 s | 7.84 MB | 4.81 MB |
| `s12` | 900 | 18.50 ms | 19.86 ms | 19.75 ms | 26.59 ms | 17.87 s | 23.94 s | 6.18 MB | 3.71 MB |
| `w12` | 1,500 | 51.05 ms | 66.88 ms | 52.60 ms | 71.48 ms | 100.32 s | 107.21 s | 17.17 MB | 10.53 MB |

## 12. Largest matrix estimate
- **最大行列のエリア:** `e456` (東456ホール)
- **サークル数 $N$:** 2,397
- **全要素数 ($N \times N$):** 5,745,609 要素
- **全距離行列計算時間 (p95):** Desktop 約143秒、Mobile-equivalent 約164秒
- **データサイズ:** Float64 配列で **43.84 MB** (JSON シリアライズ時 約 26.89 MB)

## 13. Phase 5C entry facts
1. Dijkstra 単一始点カーネル `buildDistanceMap` は `apps/webapp/js/route-planner.ts` からexport済みである。Worker wiring自体はPhase 5Cの実装対象であり、Task 6では未実装・未検証である。
2. 最大行列の`e456`では全距離行列生成にDesktop約143秒、Mobile-equivalent約164秒を要するため、**UIメインスレッドでの同期実行は厳禁**。Web Workerでの非同期計算が必須である。
3. 距離行列計算の進捗表示（プログレスバー）は 1-source 完了ごとに $1 / N$ 単位で更新する。
4. 容量制限（43.8 MB）のため、単一のLocalStorage値へ全保存することは不可能である。Phase 5C approved planはLocalStorage cacheを指定しているため、実装開始前にchunking、別ストレージ、またはオンデマンド保持の扱いを確定する必要がある。

## 14. Known limitations
- ブラウザの LocalStorage 容量制限（一般的に 5MB〜10MB）のため、`e456` や `w12` の全距離行列を直接 LocalStorage に永続化することはできない。Phase 5C approved planとの整合を、実装開始前に確定する必要がある。
- 低スペックモバイル端末では全行列生成時のCPU占有を避けるため、初回生成の自動開始を行わずユーザー明示操作に限定する。
- Phase 5C entry gateのPython版TOPTW参照実装のGit管理外配置はTask 6では確認していない。
- Phase 5C branch作成承認とTask 1開始指示はTask 6では確認していない。

## 15. Files that must remain private
- `maps/` 配下に存在する著作物・元画像・元 SVG・Points raw CSV
- Python による地図データ生成・変換コードおよび TOPTW 参照実装
