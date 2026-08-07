# Phase 5D: 既存Webappの責務整理を完了する

## 目的

Phase 5Dでは新機能を追加せず、現在動作しているWebappの責務境界を整理し、今後の人間・LLM実装担当がコードの入口、状態の所有者、外部I/O、UI責務を追いやすい構造へする。

現行ブランチではfeature分割の多くがすでに実装済みである。一方、旧`App`、`DataManager`、`UIManager`の責務が別名の大きなFacadeへ残っているため、旧計画を最初から再実装するのではなく、その残存責務だけを解消する。

## Phase完了時の構造

- `apps/webapp/js/app/`はbrowser entrypoint、dependency assembly、global lifecycle、browser event bindingだけを持つ。
- event/dayの正本は`features/event-day/`のSession/Repository/Use Caseである。
- circle statusとGAS outboxは`features/circle-status/`が所有する。
- circle data sourceは`features/circle-data-source/`が所有する。
- local data deletionは`features/local-data-deletion/`が所有する。
- route guidanceの状態、route計算、snapshot、Worker、map assetsは`features/route-guidance/`から追える。
- feature UIは対応featureの`ui/`に置き、汎用DOM処理だけを`shared/ui/`へ置く。
- composition rootは具体的な依存関係を明示的に生成・接続する。依存関係を隠すためのfactory群へ分解しない。

## 対象外

- ユーザー向け機能の追加・削除
- UIの意図的なデザイン変更
- LocalStorage schema変更やデータ移行方式の追加
- GAS/CSVの外部契約変更
- Dijkstra、距離行列、ALNS、時間減衰目的関数のアルゴリズム変更
- 性能最適化そのもの
- 将来機能のための抽象化
- 「Clean Architecture」という名前に合わせるためだけの層・interface・class追加

## 実装原則

1. 新しい構造を追加する前に、既存のfeature Session、Use Case、Controller、Viewを再利用する。
2. 同じmutable stateを複数のFacadeへ複製しない。移行中も正本を一つに決める。
3. 旧Facadeを別名のFacadeへ置き換えない。削除まで完了して初めて責務移行完了とする。
4. pure algorithmの移動ではアルゴリズムを変更しない。責務変更と計算変更を同じタスクへ混ぜない。
5. テストは旧classの存在ではなく、外部挙動と新しい責務境界を検証する。
6. 各タスクは関連テストを中心に実行する。Phase最後にfull E2Eまで実行する。
7. ファイル数や行数を減らす・増やすこと自体を目標にしない。

## 実装順序

| タスク | 目的 | 主な依存 |
|---|---|---|
| Task 1 | Route Guidance固有モジュールの配置を一本化 | なし |
| Task 2 | Route Guidanceの状態所有と処理順序をfeatureへ移管 | Task 1 |
| Task 3 | `EventDayDataStore`を削除して既存featureを直接接続 | Task 2 |
| Task 4 | `ComiPathDomCoordinator`をfeature別Viewへ解体 | Task 3 |
| Task 5 | `ComiPathBrowserRuntime`を削除しbrowser bindingを明示化 | Task 2〜4 |
| Task 6 | architecture guardrailとテスト境界を強化 | Task 5 |
| Task 7 | full E2Eを含む最終検証とPhase完了整理 | Task 6 |

Task 1〜5は責務を一方向に移す。後続Taskで削除するFacadeへ新しい責務を追加してはいけない。

## Phase受入条件

- `apps/webapp/js/comipath-browser-runtime.js`、`apps/webapp/js/event-day-data-store.ts`、`apps/webapp/js/comipath-dom-coordinator.js`が削除されている。
- production sourceがこれらのFacadeをimportしない。
- route guidance固有のproduction moduleがrootの`navigation/`、`routing/`、`route-planner.ts`、navigation snapshot repositoryへ分散していない。
- route guidanceのmutable stateは`RouteGuidanceSession`を正本として追跡できる。
- event/dayとcircle statusのmutable stateはfeatureのSession/Repositoryを正本として追跡できる。
- browser event listener、timer、Worker等のlifecycle ownerが明確で、`stop()`時に解除される。
- architecture testが「旧ファイル名だけ消して巨大Facadeを別名へ移す」実装を合格させない。
- `npm run verify:webapp`が成功する。
- `npm run test:e2e`が成功する。既知のvisual snapshot差分は、根拠なしにsnapshotを更新して解決しない。
