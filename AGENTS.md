# ComiPath Agent Operating Rules

このファイルは、ComiPath Webappで作業する実装・レビューエージェントの共通手順だけを定める。
Task固有の仕様、変更ファイル、テスト、完了条件は必ず`docs/`側に置く。

## 1. 最初に読む文書

コード、テスト、設定、文書を変更する前に、次をこの順序で読む。

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/status/progress.md`
4. `docs/plans/roadmap.md`
5. 指定Phaseの`docs/plans/phase-XX/README.md`
6. 指定Taskの`docs/plans/phase-XX/task-YY-*.md`
7. Taskから明示的に参照されている`docs/specs/`、`docs/architecture/`、`docs/reviews/`
8. Taskが列挙する既存実装と関連テスト

`docs/archive/`は過去記録であり、現在の要求を補完する正本ではない。現在のTask文書と矛盾した場合は現在のTask文書を優先する。

## 2. 指示の解釈

### 実装指示

ユーザーが次のように指示した場合、実装モードで作業する。

> AGENTS.mdを読んで、Phase 5B Task 2を実装して

対象PhaseのTask表からTask 2の正本を特定し、そのTaskだけを実装する。
後続Task、別Phase、便利そうな追加機能を混ぜない。

### レビュー指示

ユーザーが次のように指示した場合、レビューモードで作業する。

> AGENTS.mdを読んで、Phase 5B Task 2をレビューして

レビューモードでは、原則としてファイルを変更しない。Task契約、差分、テスト結果を照合し、重要度順に指摘する。
修正まで依頼されていない場合は、レビュー中にコードや文書を直さない。

### 指定が曖昧な場合

PhaseまたはTaskを一意に解決できない場合、推測で着手しない。
`docs/README.md`とPhaseのTask表を確認しても解決できなければ、コード変更前にユーザーへ確認する。

## 3. 共通開始手順

1. `git status --short --branch`で現在のbranchと未コミット差分を確認する。
2. `docs/status/progress.md`で対象Taskの着手可否、依存Task、未承認差分を確認する。
3. Phaseのentry gateを確認する。満たしていない場合は着手しない。
4. Task文書の「変更可能ファイル」と「変更禁止」を確認する。
5. 指定ファイルと関連テストの現状を読む。
6. 計画と現実が矛盾していないことを確認する。

次の場合は作業を止めて報告する。

- Task外の既存差分が対象ファイルと重なる。
- 必須入力ファイルがない、壊れている、または形式がTask契約と異なる。
- Taskの前提となる型、API、テスト、build scriptが存在しない。
- 計画どおりに進めるとデータ損失、公開境界違反、後方互換性破壊が起きる。
- Task文書に複数の解釈があり、どれを選ぶかで外部挙動が変わる。

## 4. 実装プロトコル

1. Task文書を最初から最後まで読む。
2. Taskに記載された順番を守る。
3. 原則として、外部挙動を示す失敗テストを先に追加し、REDを確認する。
4. 失敗理由が意図した未実装機能であることを確認する。
5. 最小限の実装でGREENにする。
6. Task固有テストを実行する。
7. Task文書に指定された共通検証を実行する。
8. 変更可能ファイル以外に差分がないことを確認する。
9. 自己レビューを行う。
10. 差分、検証結果、既知の制約、提案commit messageをユーザーへ提示する。
11. ユーザーがcommitを明示承認するまでcommitしない。

Task文書のチェックボックスは、実際に完了し証拠を確認した項目だけ更新する。
失敗した検証を成功扱いにしない。

## 5. レビュープロトコル

レビューでは次を順に確認する。

1. 対象branch、base、Task範囲を確認する。
2. Taskが許可したファイルと実際の変更ファイルを比較する。
3. entry gate、依存Task、外部契約を確認する。
4. テストが要求を証明しているか確認する。
5. 実装を読んで、状態遷移、永続化、エラー処理、競合、キャンセル、再読込を確認する。
6. 公開境界と機密情報混入を確認する。
7. Task固有コマンドと共通検証を実行する。
8. 指摘を重大度順に報告する。

レビュー結果は次の形式を使う。

- `BLOCKER`: mergeまたは次Taskへ進めない問題
- `HIGH`: ユーザー操作、データ、公開環境に重大な誤動作を起こす問題
- `MEDIUM`: 要求漏れ、テスト不足、保守性上の実害がある問題
- `LOW`: 小さな改善
- `確認済み`: 問題がなかった重要項目
- `未確認`: 環境や入力不足で検証できなかった項目

問題がない場合も、実行したコマンドと未確認事項を記載する。

## 6. リポジトリ固有規約

- 新規WebappモジュールはTypeScript strictで実装する。
- 外部入力は`unknown`として受け、runtime parserで検証する。
- `any`を追加しない。
- event/dayごとのLocalStorage分離と既存GAS outboxのlocal-first原則を維持する。
- 通常の自動テストは架空の`demo-v1`または明示されたfictional fixtureを使う。
- 実地図を一般的なunit/E2E fixtureへコピーしない。
- `/maps/`はGit管理外の私的受け渡し・作業領域である。
- Python地図生成コードとPython版最適化参照実装をWebリポジトリへ追加しない。
- Litは独立した設定・ダイアログ・詳細表示に限定する。地図描画全体をTask外で作り直さない。
- モバイル操作、44px以上のタッチ領域、keyboard focus、safe-area、200% text zoomを維持する。
- raw CSV、GAS URL、sheet内容、外部投稿本文、元地図、ローカル絶対パスをログ、snapshot、artifactへ出さない。

## 7. 共通検証

Task文書が追加コマンドを指定していない場合でも、通常は次を実行する。

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npx biome check
git diff --check
git status --short --branch
```

地図、ナビゲーション、設定、状態遷移、購入同期、主要モバイル操作を変更した場合は次も実行する。

```bash
npm run test:e2e
```

最終Taskでは通常、次も実行する。

```bash
npm ci
npm run verify
npm run test:e2e
node scripts/audit-public-tree.mjs
git diff --check
git status --short --branch
git ls-files
```

sandboxがlocalhost listenを拒否した場合だけ、同じE2Eコマンドをsandbox外で再実行して判定する。
別コマンドへ置き換えて成功扱いにしない。

## 8. Git・GitHub承認境界

- branch作成は、対象Phase計画とユーザー指示に従う。
- commitは、差分・検証結果・commit messageを提示し、ユーザーが明示承認した後だけ行う。
- remoteの作成・変更、push、PR作成、Draft解除、mergeは、それぞれ別の明示承認が必要である。
- Taskごとにcommitを分ける。
- PhaseのPRは原則1本とする。
- Task commitを保持するため、統合時は原則merge commitを使う。実際のmerge方法は統合時にユーザーが決める。
- 未承認差分を別Taskのcommitへ混ぜない。

## 9. 文書更新

実装Task完了後は、Task文書の実績欄と`docs/status/progress.md`を実態に合わせる。
索引やパスを変更した場合は`docs/README.md`も同じ作業で更新する。

過去Phaseの文書は内容を修正せず、必要なら`docs/archive/`へ移動する。
過去文書の誤りを現在Taskの根拠として修正してはいけない。
