# ComiPath Public Webapp Development Guidelines

このリポジトリで実装するエージェントは、コードを変更する前に必ず [docs/README.md](docs/README.md) を読む。ここでは、その文書導線とこのリポジトリ固有の実装・検証規約だけを定める。

## 1. 文書導線と正本

1. [docs/README.md](docs/README.md) で対象文書と読む順序を確認する。
2. [docs/status/progress.md](docs/status/progress.md) で現在のPhase、未承認差分、次の着手可否を確認する。
3. [docs/plans/roadmap.md](docs/plans/roadmap.md) で公開境界とPhase間依存を確認する。
4. 対象Phaseの`docs/plans/phase-*.md`を最初から最後まで読む。
5. 必要に応じて`docs/architecture/`の契約を読む。`docs/reviews/`は確定したレビュー判断、`docs/archive/`は参照専用であり実装根拠に使わない。

`docs/`はローカル専用でGit ignoreされている。ただし、この作業ツリーで作業するエージェントにとっては設計・進捗の正本である。計画や進捗を変更した場合は、`docs/README.md`の索引も同じターンで更新する。

## 2. 現在の実装状態

- Phase 1は完了済み。Phase 2はTask 1–8まで完了し、Task 8は `335f04f` としてコミット済みである。
- Phase 2のexit gateは完了した。次はPhase 3の承認済みTask計画を確認してから着手し、Phase 3のexit gate完了前にPhase 4を開始しない。
- Phase 3はTask 1–8の実装・レビューを完了した。Task 8ではキャッシュ済みGAS stateの無通信起動、購入のLocalStorage先行保存、失敗POST後のreload再送、onlineイベントのcoalescingを実ブラウザで検証し、Native fetchのbind漏れも修正した。Task 8の検証（focused/Webapp/GAS/E2E）は完了し、次はTask 9のdocumentation and exit gateである。
- Phase 3/4は概要計画のTask表から `docs/plans/phase-03/` / `docs/plans/phase-04/` の指定Task文書を開き、1 Taskずつ実装・レビュー・承認する。前Phaseのentry gateを満たしていない場合、次Phaseの開始や完了を宣言しない。

## 3. Task実行プロトコル

ユーザーから「Phase N Task Mを実装」と指示された場合、以下を順に実行する。Task固有の指示はこのファイルへ追加せず、対象Phaseの計画文書に置く。

1. `docs/status/progress.md` と `docs/plans/roadmap.md` を読み、対象Phaseのentry gate、未承認差分、依存Taskを確認する。
2. 対象の `docs/plans/phase-*.md` でPhase全体の契約と依存順を確認し、Task表から指定Task文書を開いて最初から最後まで読む。Phase 2 Task 8は専用文書、Phase 3/4はTask別サブディレクトリを正本とする。
3. Taskが参照する `docs/architecture/` と `docs/reviews/` の文書、既存実装、関連テストを読む。`docs/archive/` は現在の要求を補完しない。
4. TaskのStep順を守って失敗テストから始める。計画が曖昧・矛盾・現在の実装と不整合なら、コードを書く前に対象Phase計画と進捗を訂正し、理由を報告する。
5. 対象Taskに明記されたファイルと最小限の直接依存だけを変更する。後続Task、別Phase、未承認の既存差分を混ぜない。
6. Task固有のテストと第5節の検証を実行し、計画と進捗のチェック状況を実態に合わせて更新する。

## 4. 実装規約

- 新規WebappモジュールはTypeScript strictで実装し、外部境界は`unknown`からruntime parserで検証する。`any`を追加しない。
- LocalStorageはevent/dayごとに分離された正本である。source generation、CSV preview、GAS outboxの安全境界は`docs/architecture/data-contracts.md`に従う。
- 通常の開発・ビルド・テストには架空地図`apps/webapp/map-bundles/demo-v1`だけを使う。実地図やprivate mapを自動検出しない。
- Litは設定など独立性の高いUIだけに使う。地図、ピン、ジェスチャー、ボトムシートを広範囲にLit化しない。
- UI作業では`docs/architecture/ui-ux-direction.md`を読み、現行モバイル画像回帰を維持する。

## 5. 検証とコミット境界

TaskごとのRED/GREENに加え、通常は次を実行する。

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npx biome check
git diff --check
git status --short --branch
```

地図、設定、購入同期、主要モバイル操作を変更した場合は `npm run test:e2e` も実行する。sandboxがlocalhost listenを拒否する場合だけ、同じコマンドをsandbox外で再実行して判定する。

`comipath-web` のcommitは、対象ファイルだけをstageし、差分・検証結果・Conventional Commitメッセージをユーザーへ提示して明示承認を得てから行う。remote作成・設定・push・PR・mergeは別の明示承認が必要である。
