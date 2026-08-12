# Phase 7.3 Task 8 フィールド検証報告

検証日: 2026-08-12
対象HEAD: `b860f83`
基準コミット: `d61cc3b`

## 実行結果

初回検証開始時の `git status --short` は空で、HEADは基準コミットと一致していた。Task 8では本番コードとsnapshotを変更せず、旧E2E契約だけを別commitで現行導線へ合わせた。

| コマンド | 終了コード | 結果 |
|---|---:|---|
| `npm run test:route-guidance` | 0 | 6 files / 38 tests PASS |
| `npm run test:task-08-dom-views` | 0 | 2 files / 5 tests PASS |
| `npm run test:phase-05d-regressions` | 0 | 2 files / 4 tests PASS |
| `npm run test:catalog-extension` | 0 | 19 tests PASS |
| `npm run verify` | 0 | webapp 108 files / 740 tests、route 38、Phase 5D 4、architecture/typecheck/build、GAS 36、extension 19 PASS |
| `npm run test:e2e:ci`（旧E2E契約修正前） | 1 | 67 tests: 46 PASS / 13 FAIL / 8 SKIP |
| `npm run test:e2e:ci`（現行導線修正後） | 1 | 67 tests: 52 PASS / 7 FAIL / 8 SKIP。behavior失敗なし |

`npm run verify` 内では、architecture check、TypeScript typecheck、Vite build、public map asset audit、GAS build同期確認も通過した。

## E2E失敗・skipの分類

### 既知または意図したvisual差分

次の失敗は機能assertionではなくsnapshot比較で、snapshotは更新していない。

- management: `settings-shell-source-manager.png`、`outbox-recovery-panel.png`、`scoped-deletion-dialog.png`
- main/candidate: `navigation-map-catalog.png`、`navigation-target-portrait-200-percent.png`
- Gallery: `catalog-gallery.png`

Phase 7.2報告で記録済みのmanagementおよびCI描画差分と同系統である。`catalog-gallery.png` はTask 7のGallery変更に伴う意図したvisual差分候補だが、headed visual確認なしではbaseline更新可否を確定しない。

### 解消した旧E2E契約不整合

Task 3で本番導線をfloating candidate previewへ変更した後も、6本のE2Eがpin click直後に旧bottom detailの値を期待していた。テストを、候補選択系はpin click→`.candidate-preview-card`→「経路を比較」、カタログ表示系はpin click→「行き先変更」へ更新した。current target維持、候補距離・URL・route、No Image、stale image保護、resumeのassertionは維持している。

修正後、候補選択・対象catalog表示・navigation-resumeのbehavior failureは再現せず、CI相当E2Eで該当テストはPASSした。これは本番コードの回帰ではなく、Task 3後に残っていた旧E2E契約の不整合だった。

### fixture不足によるskip

`tests/c108-map-browser-smoke.spec.ts` の4 area × desktop/mobile = 8件は、`RUN_C108_SMOKE=1` が未設定のためskipされた。private C108 fixtureを取得・作成して代替することはしていない。fixture不足を回帰FAILには分類しない。

CIコンテナの `npm ci` は moderate 1件 / high 1件のaudit warningを出したが、今回のテスト結果とは独立した環境警告である。

## 実機・外部依存の確認可否

| 確認項目 | 判定 | 理由 |
|---|---|---|
| 実GAS deployment | 未実施 | 検証用deploymentを使用していない。GAS URLは取得・記録していない。 |
| GAS credential | 利用不可 | 環境変数・credential fileを読み取って利用する構成ではなく、credentialを探索・記録していない。 |
| headed browser | 未実施 | `DISPLAY` が空で、ホスト側のheaded browser executableも確認できなかった。CIはheadless Playwright container。 |
| private C108 fixture | 利用不可 | `RUN_C108_SMOKE=1` 未設定。 |
| 実機 visual / DevTools trace | 未実施 | 実機とheaded DevTools環境がない。CI失敗時traceは生成されたが、実機確認の代替には数えていない。 |

secret、GAS URL、実データは取得・保存・報告していない。

## Phase 7.3完了判定案

**アプリ実装完了・外部検証待ち。** `npm run verify`、関連focused検証、CI相当E2Eのbehavior assertionが通過している。一方、Task 4の完了条件である同一条件のbefore/after実機DevTools traceは未取得であり、Task 4およびPhase全体を完了扱いにしない。残る7件は意図した画面変更または既知のmanagement visual差分で、snapshotは更新していない。実GAS、headed browser、private C108 fixture、実機visual/DevTools traceは環境待ちとして分離し、Cloudflare Pages運用設定も別トラックで残す。
