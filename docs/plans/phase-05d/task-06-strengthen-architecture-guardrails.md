# フェーズ5D タスク6: architecture guardrailとテスト境界を強化

## 目的

Phase 5Dで解消した責務混在が、単なるrenameや新しい巨大Facadeとして再発しないようにarchitecture checkerとtestsを更新する。

「特定の旧ファイル名がない」だけではなく、production wiringと依存方向を検証する。

## 対象外

- formatter/linterの大規模導入
- classやfileの一律行数制限
- architecture checkerを独自DSLや複雑な静的解析基盤へ作り直すこと
- 既存featureを理論上のClean Architectureへ合わせるためだけの追加層

## 前提と依存関係

Task 5完了後に実施する。三つのFacadeとroute guidance旧root pathが実際に削除されている状態を前提とする。

## 読むべき文書と既存実装

- `scripts/check-webapp-architecture.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`
- `tests/architecture-boundaries.test.mjs`
- `tests/legacy-app-files-removed.test.mjs`
- `tests/comipath-application-responsibility.test.mjs`
- `tests/public-boundary.test.mjs`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- 各`features/*/public-api.ts`

## 対象ファイル

### 作成

原則なし。

### 変更

- `scripts/check-webapp-architecture.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`
- `tests/architecture-boundaries.test.mjs`
- `tests/legacy-app-files-removed.test.mjs`
- `tests/comipath-application-responsibility.test.mjs`
- `tests/public-boundary.test.mjs`

### 削除

なし。`webapp-architecture-legacy-allowlist.json`が空になっても、checkerの単純さを保つために即削除する必要はない。

## 実装手順

1. 既存checkerのrulesとallowlistを、Task 1〜5完了後のsource treeに照らして棚卸しする。
2. 次の削除済みFacadeをproduction sourceからimportできないことを明示的に検証する。
   - `comipath-browser-runtime`
   - `event-day-data-store`
   - `comipath-dom-coordinator`
3. Route Guidance固有production moduleが旧rootの`navigation/`、`routing/`、`route-planner.ts`、navigation snapshot repositoryへ戻らないことを検証する。
4. Route Guidance domain/use-casesが`document`、`window`、`localStorage`、`fetch`、concrete `Worker`生成へ直接依存しないことを、現在の単純なimport/source scan方式で検証する。
5. feature DOM ViewがRepository、GAS client、route optimizer等のinfrastructureを直接importしないことを検証する。
6. `app/bind-browser-events.ts`がfeature infrastructureを直接生成・importしないことを検証する。
7. cross-feature利用は既存のpublic APIまたは明示的contractを優先する。ただし既存コードで正当な型共有がある場合に、checkerを通すためだけのre-export layerを追加しない。
8. `legacy-app-files-removed.test.mjs`は旧名称一覧だけでなく、production assemblyが削除Facadeなしで構築できること、旧route pathへのimportがないことを検証する内容へ強化する。file名自体はpackage script変更を避けるため残してよい。
9. `comipath-application-responsibility.test.mjs`はlifecycle責務だけを検証し、行数をarchitectureの代理指標にしない。
10. `assemble-comipath-application.ts`へ一律行数上限を設定しない。concrete dependencyを明示的に並べることを許容する。
11. allowlistからTask 1〜5で不要になったentryを削除する。新構造を通すためだけにallowlistを増やさない。

## テスト方針

architecture test自身について、少なくとも次のnegative caseをfixture/source textで証明する。

- 削除Facadeを別fileからimportすると失敗する。
- Route Guidance Use Caseが`localStorage`や`Worker`を直接扱うと失敗する。
- feature ViewがRepository/infrastructureを直接importすると失敗する。
- browser bindingがconcrete infrastructureを生成すると失敗する。

一方、explicit composition rootが複数featureのconcrete implementationをimportすることは許可する。

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

- 旧Facadeを別名で再導入するだけの実装をarchitecture testsが見逃さない。
- Route Guidanceの旧root module配置へ戻すimportを検出できる。
- domain/use-case、DOM View、browser bindingの禁止依存が具体的な責務に基づいて定義されている。
- composition rootを行数だけで不合格にしない。
- checkerを通すためだけの新しいre-export/facade/allowlist entryを増やしていない。
- architecture focused tests、webapp tests、buildが成功する。

## 予定コミットメッセージ

```text
test(architecture): guard phase 5d boundaries
```
