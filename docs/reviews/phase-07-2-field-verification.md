# Phase 7.2 field verification

実装開始時のTask 8基準SHA: `4c14b431e1a11f9ac50ee4c87ab1b9443a54c90f`

## 自動検証

| command | 結果 |
|---|---|
| `npm run verify` | PASS: Webapp 106 files / 721 tests、route 38、Phase 5D 4、GAS 30、extension 9、architecture/typecheck/build/public audit |
| `npm run test:e2e:ci` | 50 passed / 7 failed / 8 skipped |
| `npx playwright test tests/e2e/webapp.spec.ts --grep 'portrait|landscape|目的地|候補'` | PASS: 7 tests |
| `npx playwright test tests/e2e/webapp.spec.ts --grep '一覧|Gallery|操作方法|priority'` | PASS: 6 tests |
| `npx vitest run --root . tests/catalog-orientation.test.ts tests/navigation-view-model-split.test.ts` | PASS: 5 tests |
| `git diff --check` | PASS |

`package.json`の`npm run verify`は`verify:webapp`、`verify:gas`、`test:catalog-extension`へ到達し、`.github/workflows/webapp-ci.yml`は`npm run verify`後に`npm run test:e2e`を実行することを確認した。

## CI相当E2Eの分類

失敗7件はすべてvisual snapshot比較で、機能assertionの失敗ではない。

- managementの`settings-shell-source-manager.png`、`outbox-recovery-panel.png`、storage deletion画面: 既存のmanagement visual baseline差分。
- Task 7の`navigation-map-catalog.png`、`route-comparison.png`、Task 6の`catalog-gallery.png`、Task 7の200% target snapshot: ローカルの対象E2Eでは通過しているCIコンテナ側の描画差分。CI用snapshotを根拠なく一括更新していない。
- C108 map browser smoke 8件: private fixture unavailableによるskip。機能PASSには数えていない。
- CIの`npm ci`はmoderate 1 / high 1のaudit warningを出したが、テスト結果とは独立した環境警告。

## 手動・視覚確認

- ローカルbrowser E2Eでtargetのlandscape、portrait、320px/200% zoom、candidate preview、Gallery global scope、dynamic priority、tutorial replayを確認した。
- 拡張の自動extractor/client 9件、Manifest V3/content script/background moduleの静的契約は通過した。
- unpacked extensionをheaded Chromeへロードしてtest GASへ送信するmanual smokeは未実施。実行環境にheaded Chromiumと`DISPLAY`がなく、個人GAS URLやcredentialを追加して代替していない。

## 未完了事項

Task 8のmanual extension smokeと、headed環境でのCI visual baseline確認が未確認である。そのため`docs/status/progress.md`はPhase 7.2完了へ進めず、現在の正本状態をTask 7完了のまま保持する。
