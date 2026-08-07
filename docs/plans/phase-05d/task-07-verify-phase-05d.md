# フェーズ5D タスク7: 最終検証とPhase完了整理

## 目的

Phase 5Dの最終状態をfull test、build、Playwright E2Eで確認し、既知のE2E差分を「既存挙動の回帰」か「承認が必要な表示変更」かに分類して解消する。すべての受入条件を満たした場合だけPhaseを完了扱いにする。

## 対象外

- E2Eを通すためだけのassertion削除・skip追加・許容差拡大
- visual snapshotの機械的な一括更新
- Phase 5Dと無関係な機能追加
- 性能改善や追加リファクタリング

## 前提と依存関係

Task 6までが完了していること。

計画再作成時点のGitHub Actions run `31156422202`では`npm run verify:webapp`は成功し、`npm run test:e2e`だけが失敗している。既知の失敗は主に次のvisual snapshot差分である。

- settings source manager
- outbox recovery panel
- scoped deletion dialog
- navigation map catalog
- navigation route candidate

また、次目的地pinの前面表示testは一度失敗後retry成功しておりflakyである。

## 読むべき文書と既存実装

- `docs/status/progress.md`
- `docs/plans/phase-05d/README.md`
- Task 1〜6の計画文書
- `.github/workflows/webapp-ci.yml`
- `package.json`
- `tests/e2e/management.spec.ts`
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/navigation-mobile.spec.ts`
- `tests/e2e/navigation-keyboard.spec.ts`
- `tests/e2e/navigation-resume.spec.ts`

## 対象ファイル

### 作成

なし。

### 変更

- `docs/status/progress.md`
- E2Eで実際の回帰原因と特定された既存source fileだけ

E2E spec自体が誤っていることを実装・既存仕様・履歴から証明できた場合だけ、該当する次のtestを変更する。

- `tests/e2e/management.spec.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

## 変更してはいけないファイル

ユーザー承認なしに、既存visual snapshot PNGを更新・削除してはいけない。対象には少なくとも次が含まれる。

- `tests/e2e/management.spec.ts-snapshots/`
- `tests/e2e/webapp.spec.ts-snapshots/`

理由は、Phase 5DがUI redesignを目的としておらず、snapshot更新だけでは意図しない表示回帰を隠せるためである。

## 実装手順

1. clean working treeからNode/npm/Playwrightのpinned versionを確認し、`npm ci`を実行する。
2. `npm run verify:webapp`を実行する。失敗した場合はTask 1〜6のどの責務に由来するか特定し、最小のsource fixを行う。
3. `npm run test:e2e`を実行し、各failureのtrace、actual、expected、diffを確認する。
4. visual差分について、DOM内容・layout・既存仕様・Phase開始前履歴を比較する。Phase 5Dで意図していない表示変更ならsourceを修正して既存snapshotへ戻す。
5. 既存snapshotの方が明らかに古く、現在表示を正とすべき根拠がrepository内だけでは一意に決められない場合は、snapshotを変更せずユーザー判断事項として報告する。
6. 次目的地pinの前面表示flakyはretry成功だけで完了扱いにしない。DOM/SVG layer orderが決定的になるまで原因を修正するか、test側の非決定的待機が原因だと証明できる場合だけ同期条件を修正する。
7. E2EがGREENになった後、削除対象Facade/旧route pathの不存在とproduction import 0件を`rg`で再確認する。
8. public buildに不要なarchive/debug/legacy fileが混入していないことを既存audit scriptで確認する。
9. `docs/status/progress.md`のTask 7を完了、Phase 5Dを完了へ更新する。未解決事項が一つでもある場合は完了と書かない。

## テスト方針

最終Taskではfocused testではなく、CIと同じ順序の全体検証を正本とする。E2E失敗をsnapshot更新、skip、retry増加だけで消さない。

## 検証コマンド

```bash
node --version
npm --version
npm ci
npm run verify:webapp
npm run test:e2e
node scripts/audit-public-tree.mjs
git diff --check
```

`package.json`の`verify:webapp`がfull test/typecheck/buildを含む現行契約を維持していることも確認する。

## ユーザー判断が必要な事項

visual snapshot差分について、repository内の仕様・履歴・実装から「旧表示へ戻すべきか、新表示を正としてsnapshotを更新すべきか」を一意に決められない場合だけユーザーへ確認する。

その場合は、対象snapshotごとにactual/expectedの差、表示上の意味、推奨案を示す。単に「snapshotが違うので更新してよいか」とだけ聞かない。

## 受入条件

- `npm run verify:webapp`が成功する。
- `npm run test:e2e`がretry依存の既知flakyを残さず成功する。
- visual snapshotを根拠なく更新していない。
- Phase 5D READMEのPhase受入条件をすべて満たす。
- 三つの旧FacadeとRoute Guidance旧root pathがproductionから消えている。
- `docs/status/progress.md`が実際のremote HEADと実装状態に一致する。
- 未解決事項がある場合、Phaseを完了扱いにしていない。

## 予定コミットメッセージ

```text
chore(phase-5d): verify refactor completion
```
