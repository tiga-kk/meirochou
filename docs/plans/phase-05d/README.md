# Phase 5D: 既存Webappの責務整理を完了する

## 目的

Phase 5Dでは新機能を追加せず、現在動作しているWebappの責務境界を整理し、今後の人間・LLM実装担当がコードの入口、状態の所有者、外部I/O、UI責務を追いやすい構造へする。

現行ブランチではfeature分割の多くがすでに実装済みである。一方、旧`App`、`DataManager`、`UIManager`の責務が別名の大きなFacadeへ残っていたため、その残存責務を解消する方針でTask 1〜6を実装した。

Task 7の最終検証中に、既存計画だけでは解消できない二つのblockerが判明した。

1. `app/bind-browser-events.ts`が旧browser runtimeのfeature state、dependency assembly、route workflow等を引き継ぎ、新しい大規模Facadeになっている。
2. CI固定環境で5件のvisual snapshot差分が安定して再現するが、Phase 5Dの回帰かbaseline更新対象か未判定である。

このためTask 7を完了扱いにせず、Task 8〜11を追加する。Task 8・9でbrowser bindingを正しい境界へ修復し、Task 10でsnapshotを根拠付きで解消し、Task 11で最終検証をやり直す。

## Phase完了時の構造

- `apps/webapp/js/app/`はbrowser entrypoint、dependency assembly、global lifecycle、薄いbrowser event binding、必要最小限のcross-feature orchestrationだけを持つ。
- event/dayの正本は`features/event-day/`のSession/Repository/Use Caseである。
- circle statusとGAS outboxは`features/circle-status/`が所有する。
- circle data sourceは`features/circle-data-source/`が所有する。
- local data deletionは`features/local-data-deletion/`が所有する。
- route guidanceの状態、route計算、snapshot、Worker、map assetsは`features/route-guidance/`から追える。
- feature UIは対応featureの`ui/`に置き、汎用DOM処理だけを`shared/ui/`へ置く。
- composition rootは具体的な依存関係を明示的に生成・接続する。依存関係を隠すためのfactory群へ分解しない。
- browser binderはconcrete infrastructureやfeature mutable stateを所有せず、eventをpublic Controller/actionへ転送してcleanupする。

## 対象外

- ユーザー向け機能の追加・削除
- UIの意図的なデザイン変更
- LocalStorage schema変更やデータ移行方式の追加
- GAS/CSVの外部契約変更
- Dijkstra、距離行列、ALNS、時間減衰目的関数のアルゴリズム変更
- 性能最適化そのもの
- 将来機能のための抽象化
- 「Clean Architecture」という名前に合わせるためだけの層・interface・class追加
- EventBus、DI container、generic runtime framework等の新しい基盤導入

## 実装原則

1. 新しい構造を追加する前に、既存のfeature Session、Use Case、Controller、Viewを再利用する。
2. 同じmutable stateを複数のFacadeへ複製しない。移行中も正本を一つに決める。
3. 旧Facadeを別名のFacadeへ置き換えない。削除まで完了して初めて責務移行完了とする。
4. pure algorithmの移動ではアルゴリズムを変更しない。責務変更と計算変更を同じタスクへ混ぜない。
5. テストは旧classの存在ではなく、外部挙動と新しい責務境界を検証する。
6. 各タスクは関連テストを中心に実行する。Phase最後にCI相当のfull E2Eまで実行する。
7. ファイル数や行数を減らす・増やすこと自体を目標にしない。
8. visual snapshotは原因を判定してから変更する。GREEN化のための一括更新、threshold緩和、skip、retry増加をしない。

## 実装順序

| タスク | 目的 | 主な依存 |
|---|---|---|
| Task 1 | Route Guidance固有モジュールの配置を一本化 | なし |
| Task 2 | Route Guidanceの状態所有と処理順序をfeatureへ移管 | Task 1 |
| Task 3 | `EventDayDataStore`を削除して既存featureを直接接続 | Task 2 |
| Task 4 | `ComiPathDomCoordinator`をfeature別Viewへ解体 | Task 3 |
| Task 5 | `ComiPathBrowserRuntime`を削除しbrowser bindingを明示化 | Task 2〜4 |
| Task 6 | architecture guardrailとテスト境界を強化 | Task 5 |
| Task 7 | full E2Eを含む最終検証を開始し、追加blockerを特定 | Task 6 |
| Task 8 | browser bindingからfeature ownership違反を除去 | Task 7で判明したblocker |
| Task 9 | 残ったbrowser event registrationをowner別に分割 | Task 8 |
| Task 10 | visual snapshot 5件を根拠付きで解消 | Task 9 |
| Task 11 | Task 8〜10後のHEADでPhase全体を再検証 | Task 10 |

Task 1〜6の完了実績をやり直さない。ただしTask 7で判明したTask 5/6の受入条件未達はTask 8・9で修正し、Task 11で改めて確認する。

## Phase受入条件

- `apps/webapp/js/comipath-browser-runtime.js`、`apps/webapp/js/event-day-data-store.ts`、`apps/webapp/js/comipath-dom-coordinator.js`が削除されている。
- production sourceがこれらのFacadeをimportしない。
- route guidance固有のproduction moduleがrootの`navigation/`、`routing/`、`route-planner.ts`、navigation snapshot repositoryへ分散していない。
- route guidanceのmutable stateは`RouteGuidanceSession`を正本として追跡できる。
- event/dayとcircle statusのmutable stateはfeatureのSession/Repositoryを正本として追跡できる。
- source request/cancellation stateはCircle Data Source featureが所有する。
- `bind-browser-events.ts`と個別binderがRepository、HTTP/GAS client、Worker、route algorithmを生成・importしない。
- browser event listener、timer、Worker等のlifecycle ownerが明確で、`stop()`時に解除される。
- architecture checkerが`bind-browser-events.ts`をconcrete infrastructure検査から特例除外しない。
- architecture testが「旧ファイル名だけ消して巨大Facadeを別名へ移す」実装を合格させない。
- 5件のvisual snapshot差分が、既存表示への回帰修正または証拠付きbaseline更新で解消されている。
- snapshot threshold、skip、retry増加でfailureを隠していない。
- `npm run verify:webapp`が成功する。
- CI相当の`npm run test:e2e:ci`が成功する。
