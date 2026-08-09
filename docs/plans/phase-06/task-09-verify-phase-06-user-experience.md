# Phase 6 Task 9: ユーザー体験改善を最終検証する

## 目的

Task 1〜8を統合したHEADで、状態遷移、GAS local-first、モバイル操作、アクセシビリティ、visual snapshot、公開ビルドを再検証し、Phase 6を完了可能な状態にする。

## 対象外

- 新しいUI機能の追加
- snapshotを通すためだけのデザイン変更
- threshold、skip、retry増加によるテスト回避

## 前提と依存関係

- Task 1〜8が個別に完了している。
- 各Taskのfocused testがGREENである。

## 読むべき文書と既存実装

- `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`
- `docs/plans/phase-06/README.md`
- Task 1〜8
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- `.github/workflows/webapp-ci.yml`
- `package.json`

## 対象ファイル

### 作成

原則なし。

### 変更

- `tests/e2e/webapp.spec.ts`
- 必要な既存E2E test
- 意図したUI変更だけに対応するvisual snapshot
- `docs/status/progress.md`
- Task実績欄が既存運用で必要なら該当Task文書

### 削除

不要になった旧visual snapshotが存在する場合のみ削除する。

## 実装手順

1. 要求ごとのE2E coverageを確認し、unit testだけでは証明できない次のflowを必ず含める。
2. Flow A: 通常案内開始→赤いcurrent routeのみ→購入→次のお品書き。
3. Flow B: 別circle pin選択→候補panel→比較開始で青線→確定→購入→次circle。
4. Flow C: GAS sourceで購入→delivery失敗→購入状態維持→outbox残存→次circle表示。
5. Flow D: 一覧で縦長2列/横長全幅→左列左swipe/右列右swipe→購入状態更新。
6. Flow E: 予定dialog→順序一覧→番号付きpin。
7. Flow F: 使い方dialog→CSV/GASカラム説明。
8. mobile Chromiumで地図のoverlayが主要地図領域を隠していないことをsnapshotで確認する。
9. snapshot差分を1枚ずつ確認し、Task 4〜8の意図したUI変更だけをbaselineへ反映する。
10. 200% text zoom、keyboard focus、44px touch target、safe-areaを確認する。
11. CI相当の固定Playwright環境で全E2Eを実行する。
12. GAS buildとpublic tree auditを含むPhase全体検証を実行する。
13. 全検証がGREENになった時だけ`docs/status/progress.md`をPhase 6完了へ更新する。

## テスト方針

Task固有testの再実行に加え、最終HEADで全体検証する。E2Eではmock内だけで状態を進めず、可能な範囲で実際のBrowserApplication→feature Controller/Use Case→DOM更新を通す。

GAS flowでは外部の本物のSpreadsheetへ接続せず、fetch boundaryだけを失敗させる。ローカル状態とRoute Guidance進行は実production wiringを使用する。

## 検証コマンド

```bash
npm ci
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
npx biome check
git diff --check
git status --short --branch
git ls-files
```

visual snapshot更新が必要な場合だけ、差分確認後に次を使う。

```bash
npm run test:e2e:ci:update
npm run test:e2e:ci
```

## 受入条件

- Phase 6 READMEの全受入条件をE2Eまたは意味のあるunit/integration testで説明できる。
- GAS失敗flowでも次のお品書きが表示される。
- candidate blue routeはcomparison中だけ表示される。
- visual snapshot差分に未説明の変更がない。
- `npm run verify`、CI相当E2E、public tree auditがすべて成功する。
- Phase 6完了後の次Phaseを自動開始しない。

## 予定コミットメッセージ

`test(phase-06): verify user experience improvements`
