# Phase 7.5 Task 8: 統合回帰・実機/人間受入でPhaseを閉じる

## 目的

Task 1〜7を自動検証と実画面の双方で確認し、map-first UIとALNS live previewを人間が受入れた場合だけPhase 7.5を終了する。

## 対象外

- FAILをこのTask内で場当たり的に修正すること。
- visual snapshotの無条件更新。
- Phase 7.4のGAS外部確認残件を混ぜること。

## 前提と依存関係

Task 1〜7完了。

## 読むべき文書と既存実装

- `docs/specs/2026-08-14-phase-07-5-map-first-ui-and-alns-visualization-design.md`
- `docs/plans/phase-07-5/README.md`
- Task 1〜7
- `.github/workflows/webapp-ci.yml`
- `package.json`

## 対象ファイル

### 新規作成

- `docs/reviews/phase-07-5-field-verification.md`

### 変更

- `docs/status/progress.md`
- 人間が意味的に承認したvisual snapshotだけ

### 削除

なし。

## 実装手順

1. Task 1〜7のfocused testsを再実行する。
2. `npm run verify`を実行する。
3. `npm run test:e2e:ci`を実行する。
4. public tree auditと`git diff --check`を実行する。
5. 390px級Motorola Androidでroute mapを開き、Phase 7.4より明確に大きいことを確認する。
6. route detailを開閉し、購入/保留、candidate selection、zoomが壊れないことを確認する。
7. nearby mapを開き、通常headerがcompactで条件drawerを閉じた状態ではmapが大きいことを確認する。
8. 5件、10件で全cardが同時表示され、card/mapが重ならないことを確認する。
9. 15件で1〜10 / 11〜15、20件で1〜10 / 11〜20を切替確認する。
10. 縦長/横長cardの自然aspect、leader line、selected toolbar、catalog detail前面表示を確認する。
11. touchでtoggle/page/detail/目的地/購入/保留を操作し、pressed/disabled/busyの不自然さや二重発火がないことを確認する。
12. ALNS fresh startを行い、距離計算後に`探索中`表示と青〜紫previewが複数回変化することを確認する。
13. ALNS探索中にmapをdrag/pinchし、操作中のpreview書換え停止と操作後のcatch-upを確認する。
14. complete後にpreviewが消え、赤current routeが残り、最終best orderがitineraryへ反映されることを確認する。
15. visual差分を人間が承認した後だけ必要snapshotを更新する。
16. verification結果を`docs/reviews/phase-07-5-field-verification.md`へ記録し、全条件PASS時だけ`progress.md`を完了へ更新する。

## テスト方針

headless PASSと人間visual/interaction PASSを分離記録する。地図面積、10件perimeterの読みやすさ、ALNS変化の面白さ、Android gesture性能は人間確認なしにPASS扱いしない。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/map-stage-layout.test.ts \
  tests/route-map-first-layout.test.ts \
  tests/nearby-catalog-pagination.test.ts \
  tests/nearby-catalog-perimeter-layout.test.ts \
  tests/nearby-map-view.test.ts \
  tests/route-optimization-preview.test.ts \
  tests/prepare-route-optimization.test.ts \
  tests/optimization-preview-model.test.ts \
  tests/navigation-runtime-controller.test.ts \
  tests/alns-worker.test.ts

npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

## 受入条件

- route/nearby双方の地図がPhase 7.4より明確に大きい。
- 補助UIが地図より優先して面積を消費しない。
- 10件までは全card、15/20は10件単位pagination。
- button interactionに新規不具合がない。
- fresh start ALNSがproductionで動く。
- 青〜紫best-order previewが複数回変化する。
- map gesture中の明確な重さが再発しない。
- complete後の正式state/routeが正しい。
- 自動回帰に新規FAILがない。
- 上記を人間が受入済み。

一つでもFAILならPhase 7.5を終了しない。

## 予定コミットメッセージ

```text
docs(phase-07-5): close map first ui acceptance
```
