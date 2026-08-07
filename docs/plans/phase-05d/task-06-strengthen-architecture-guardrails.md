# フェーズ5D タスク6: architecture guardrailとテスト境界を強化

## 目的

Phase 5Dで解消した責務混在が、単なるrenameや新しい巨大Facadeとして再発しないようにarchitecture checkerとtestsを更新する。

「特定の旧ファイル名がない」だけではなく、production wiringと依存方向を検証する。ただし、行数や一般的な名前だけを責務境界の代理指標にしない。

## 対象外

- formatter/linterの大規模導入
- classやfileの一律行数制限
- architecture checkerを独自DSLや複雑な静的解析基盤へ作り直すこと
- 既存featureを理論上のClean Architectureへ合わせるためだけの追加層
- checkerを通すためだけのallowlist、re-export、wrapper追加

## 前提と依存関係

Task 5完了後に実施する。三つのFacadeとroute guidance旧root pathが実際に削除されている状態を前提とする。

## 読むべき文書と既存実装

- `scripts/check-webapp-architecture.mjs`
- `tests/architecture-boundaries.test.mjs`
- `tests/legacy-app-files-removed.test.mjs`
- `tests/comipath-application-responsibility.test.mjs`
- `tests/public-boundary.test.mjs`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/comipath-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`
- 各`features/*/public-api.ts`

`scripts/webapp-architecture-legacy-allowlist.json`は計画再作成時点のブランチには存在しない。checkerはファイル不存在を空allowlistとして扱っているため、このタスクのためだけに新規作成しない。

## 対象ファイル

### 作成

原則なし。

### 変更

- `scripts/check-webapp-architecture.mjs`
- `tests/architecture-boundaries.test.mjs`
- `tests/legacy-app-files-removed.test.mjs`
- `tests/comipath-application-responsibility.test.mjs`
- `tests/public-boundary.test.mjs`

### 削除

なし。

`scripts/webapp-architecture-legacy-allowlist.json`が依然として存在しない場合は、その状態を維持する。Task 1〜5の実装によって正当な既存違反を一時的に許容する必要が実際に生じた場合だけ、理由を明示した上で作成を検討するが、新構造を通すための例外追加は行わない。

## 実装手順

1. 既存checkerのrulesを、Task 1〜5完了後のsource treeに照らして棚卸しする。
2. 次の削除済みFacadeをproduction sourceからimportできないことを明示的に検証する。
   - `comipath-browser-runtime`
   - `event-day-data-store`
   - `comipath-dom-coordinator`
3. Route Guidance固有production moduleが旧rootの`navigation/`、`routing/`、`route-planner.ts`、navigation snapshot repositoryへ戻らないことを検証する。
4. Route Guidance domain/use-casesが`document`、`window`、`localStorage`、`fetch`、concrete `Worker`生成へ直接依存しないことを、現在の単純なimport/source scan方式で検証する。
5. feature DOM ViewがRepository、GAS client、route optimizer等のinfrastructureを直接importまたは生成しないことを検証する。
6. `app/bind-browser-events.ts`がfeature infrastructureを直接importしないだけでなく、`localStorage`、`fetch`、`new Worker(...)`等を直接使ってconcrete infrastructureを生成・所有しないこともsource scanで検証する。importだけを見るtestにしない。
7. cross-feature利用は既存のpublic APIまたは明示的contractを優先する。ただし既存コードで正当な型共有がある場合に、checkerを通すためだけのre-export layerを追加しない。
8. `legacy-app-files-removed.test.mjs`は旧名称一覧だけでなく、production assemblyが削除Facadeなしで構築できること、旧route pathへのimportがないことを検証する内容へ強化する。file名自体はpackage script変更を避けるため残してよい。
9. `comipath-application-responsibility.test.mjs`は`ComiPathApplication`がlifecycle participantの`start()`/`stop()`だけを調整することを挙動で検証する。物理行数は検証しない。
10. 現行checkerの`application-line-limit` ruleと、`tests/architecture-boundaries.test.mjs`でそのruleを要求するfixture/assertionを削除する。`comipath-application.ts`にも`assemble-comipath-application.ts`にも一律行数上限を設定しない。
11. composition rootが複数featureのconcrete implementationを明示的にimport・生成することは許可する。依存関係を隠すためだけにfactoryへ分割させない。
12. allowlistファイルが存在しない場合は新規作成しない。存在する状態へ変わっていた場合は、各entryが現在の意図的な例外に対応するか確認し、不要entryを削除する。新構造を通すためだけのentryは追加しない。

## テスト方針

architecture test自身について、少なくとも次のnegative caseをfixture/source textで証明する。

- 削除Facadeを別fileからimportすると失敗する。
- Route Guidance Use Caseが`localStorage`や`Worker`を直接扱うと失敗する。
- feature ViewがRepository/infrastructureを直接importまたは生成すると失敗する。
- browser bindingがconcrete infrastructureをimportする場合だけでなく、`new Worker(...)`や`localStorage`等を直接使って所有しようとしても失敗する。

一方、explicit composition rootが複数featureのconcrete implementationをimportすること、`ComiPathApplication`やcomposition rootの行数が任意の閾値を超えること自体は不合格理由にしない。

## 検証コマンド

```bash
npx vitest run --root . tests/architecture-boundaries.test.mjs \
  tests/legacy-app-files-removed.test.mjs \
  tests/comipath-application-responsibility.test.mjs \
  tests/public-boundary.test.mjs \
  tests/application-assembly.test.ts
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- 旧Facadeの責務をapp層へ戻す実装を、旧file名の不存在だけで合格させない。
- Route Guidanceの旧root module配置へ戻すimportを検出できる。
- domain/use-case、DOM View、browser bindingの禁止依存が具体的な責務に基づいて定義されている。
- browser bindingでconcrete browser infrastructureを直接生成する実装を検出できる。
- `application-line-limit`と、それを要求するtestが残っていない。
- composition rootを行数だけで不合格にしない。
- checkerを通すためだけの新しいre-export/facade/allowlist entryを増やしていない。allowlistファイルが不要なら存在しないままである。
- architecture focused tests、webapp tests、buildが成功する。

## 予定コミットメッセージ

```text
test(architecture): guard phase 5d boundaries
```
