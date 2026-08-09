# Phase 6 Task 9: ユーザー体験改善を最終検証する

## 目的

Task 1〜8を統合したHEADで、状態遷移、GAS local-first、一覧購入、本番画面更新、モバイル操作、アクセシビリティ、visual snapshot、公開ビルドを再検証し、Phase 6を完了可能な状態にする。

## 対象外

- 新しいUI機能の追加
- snapshotを通すためだけのデザイン変更
- threshold、skip、retry増加によるテスト回避
- 失敗を既存不具合と決めつけて検証を省略すること

## 前提と依存関係

- Task 1〜8が個別に完了している。
- 各Taskのfocused testがGREENである。
- Task 9開始時のリモートHEADを基準点として記録する。固定SHAをこの文書へ書き足さず、実行時に取得する。

## 読むべき文書と既存実装

- `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`
- `docs/plans/phase-06/README.md`
- Task 1〜8
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- `tests/purchase-flow.test.ts`
- `.github/workflows/webapp-ci.yml`
- `package.json`

## 対象ファイル

### 作成

原則なし。

### 変更

- `tests/e2e/webapp.spec.ts`
- 必要な既存E2E/integration test
- 意図したUI変更だけに対応するvisual snapshot
- `docs/status/progress.md`
- Task実績欄が既存運用で必要なら該当Task文書

### 削除

不要になった旧visual snapshotが存在する場合のみ削除する。

本番コードの新機能追加をTask 9へ持ち込まない。最終検証でTask 1〜8の要求未達や回帰を発見した場合は、失敗の所有Taskを特定してその範囲で修正し、修正後の統合HEADからTask 9の検証をやり直す。

## 実装手順

1. Task 9開始時に最新リモートHEAD、`.github/workflows/webapp-ci.yml`、`package.json`のscriptsを確認し、この文書のコマンド名が現行treeと一致することを確認する。
2. 要求ごとのE2E coverageを確認し、unit testだけでは証明できない次のflowを必ず含める。
3. Flow A: 通常案内開始→赤いcurrent routeのみ→購入→次のお品書き。開始直後と購入後のどちらもcandidate blue routeが出ないことを確認する。
4. Flow B: 別circle pin選択→候補panel→青線なし→比較開始で青線→戻るで青線なし→再比較→確定→購入→次circle。確定後のNavigationStateと表示目的地が一致することを確認する。
5. Flow C: GAS sourceで購入→delivery失敗→購入状態維持→outbox残存→次circle表示。foregroundのGAS応答を待たずlocal mutationとRoute Guidanceが完了することを確認する。
6. Flow D: 一覧で縦長2列/横長全幅→左列左swipe/右列右swipe→端末保存成功後だけカード消去。非現在targetを先に購入→現在targetを購入しても、先に購入済みのspaceを次targetへ選ばず案内が継続することを確認する。
7. Flow E: 一覧購入のLocalStorage saveを失敗させ、成功toast/カード削除/購入済み表示が発生しないことを確認する。
8. Flow F: 予定dialog→順序一覧→番号付きpin。dialog開閉でRouteGuidanceSessionが変わらないことを確認する。
9. Flow G: 使い方dialog→CSV/GASカラム説明。CSVとGASで異なるvalidationを同一規則として表示していないことを確認する。
10. mobile Chromiumで地図のoverlayが主要地図領域を隠していないことをsnapshotで確認する。
11. snapshot差分を1枚ずつ確認し、Task 4〜8の意図したUI変更だけをbaselineへ反映する。未説明差分がある状態で一括更新しない。
12. 200% text zoom、keyboard focus、44px touch target、safe-areaを確認する。`<meta name="viewport">`がユーザー拡大を禁止していないことも確認する。
13. 地図のsingle-pointer pan、pinch、wheel、pointer cancel後の復帰を実操作または意味のあるE2Eで確認する。高頻度moveのunit testだけで「操作感」を証明したことにしない。
14. CI相当の固定Playwright環境で全E2Eを実行する。現行CIが`npm run test:e2e`を実行している場合、ローカルの`test:e2e:ci` wrapperが同じPlaywright suiteを固定環境で実行することを確認する。
15. GAS buildとpublic tree auditを含むPhase全体検証を実行する。
16. 失敗が出た場合は、次を区別して記録する。
   - Phase 6差分による回帰または要求未達
   - Task開始前から存在することを基準点で確認できる既存失敗
   - 依存関係・Docker・ブラウザ等の実行環境不備
   - 外部サービス依存
17. import/compile/setup失敗を要求テストのRED成功として数えない。期待assertionまで到達した失敗か確認する。
18. 全検証がGREENになった時だけ`docs/status/progress.md`をPhase 6完了へ更新する。既存失敗が本当に残る場合は、根拠と所有範囲を明示し、無条件にGREEN扱いしない。

## テスト方針

Task固有testの再実行に加え、最終HEADで全体検証する。E2Eではmock内だけで状態を進めず、可能な範囲で実際の`BrowserApplication`→feature Controller/Use Case→Session/Repository→DOM更新を通す。

GAS flowでは外部の本物のSpreadsheetへ接続せず、delivery/fetch boundaryだけを失敗させる。ローカル状態、outbox enqueue、Route Guidance進行はproduction wiringを使用する。

一覧flowでも`setupSwipeAction`のcallback回数だけで完了扱いせず、`DomCircleGalleryView`から`BrowserApplication.addPurchased()`、`completeCircleVisit`、Repository/Sessionへ到達するintegrationを少なくとも一つ持つ。

## 検証コマンド

Task開始時に`package.json`とCI workflowとの一致を再確認した上で、現行treeでは少なくとも次を実行する。

```bash
npm ci
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
npx biome check
git diff --check
git status --short --branch
```

visual snapshot更新が必要な場合だけ、差分を1枚ずつ確認した後に次を使う。

```bash
npm run test:e2e:ci:update
npm run test:e2e:ci
```

`npm ci`や固定Playwright環境を実行できない場合は、それをproduct regressionとして扱わず環境制約として明示する。ただし実行できる静的検証、unit test、型検査まで中止しない。

## 受入条件

- Phase 6 READMEの全受入条件をE2Eまたは意味のあるunit/integration testで説明できる。
- 通常案内開始・再開・購入後にcandidate blue routeが出ない。
- 経路変更確定後の購入で次へ進む。
- GAS失敗flowでも次のお品書きが表示され、outboxが保持される。
- 一覧購入は端末保存成功後だけ成功表示し、非現在target購入後もRoute Guidanceが破綻しない。
- candidate blue routeはcomparison中だけ表示される。
- visual snapshot差分に未説明の変更がない。
- `npm run verify`、CI相当E2E、public tree auditがすべて成功する、または実行環境制約だけが明確に分離されている。
- Phase 6完了後の次Phaseを自動開始しない。

## 予定コミットメッセージ

`test(phase-06): verify user experience improvements`
