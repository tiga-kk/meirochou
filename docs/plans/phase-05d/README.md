# Phase 5D: 既存Webappの責務整理を完了する

## 目的

Phase 5Dでは新機能を追加せず、現在動作しているWebappの責務境界を整理し、今後の人間・LLM実装担当がコードの入口、状態の所有者、外部I/O、UI責務を追いやすい構造へする。

現行ブランチではfeature分割の多くがすでに実装済みである。一方、旧`App`、`DataManager`、`UIManager`の責務が別名の大きなFacadeへ残っていたため、その残存責務を解消する方針でTask 1〜6を実装した。

Task 7の最終検証中に、既存計画だけでは解消できない二つのblockerが判明した。

1. `app/bind-browser-events.ts`が旧browser runtimeのfeature state、dependency assembly、route workflow等を引き継ぎ、新しい大規模Facadeになっている。
2. CI固定環境で5件のvisual snapshot差分が安定して再現するが、Phase 5Dの回帰かbaseline更新対象か未判定である。

このためTask 7を完了扱いにせず、Task 8〜11を追加した。Task 8・9でbrowser bindingを修正し、Task 10でsnapshotを根拠付きで解消し、Task 11でfull verificationを実行した。

Task 11後の独立レビューで、CI GREENではあるものの、`BrowserEventBinding`の残存責務が`BrowserApplication`へほぼ移動していること、architecture checkerがそのfileを例外扱いしていること、Event Day startup・Route Guidance snapshot contract・test実行範囲にも残存問題があることを確認した。このためPhase完了判定を再度開き、Task 12で残存する責務境界とテスト漏れを解消する。

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
- `BrowserApplication`を残す場合も、global lifecycle、browser shell、必要最小限のcross-feature orchestrationに限定し、feature固有のroute計算、Repository write、HTTP loadを持たない。

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
3. 旧Facadeを別名のFacadeへ置き換えない。削除または責務縮小まで完了して初めて責務移行完了とする。
4. pure algorithmの移動ではアルゴリズムを変更しない。責務変更と計算変更を同じタスクへ混ぜない。
5. テストは旧classの存在ではなく、外部挙動と新しい責務境界を検証する。
6. 各タスクは関連テストを中心に実行する。Phase最後にCI相当のfull E2Eまで実行する。
7. ファイル数や行数を減らす・増やすこと自体を目標にしない。
8. visual snapshotは原因を判定してから変更する。GREEN化のための一括更新、threshold緩和、skip、retry増加をしない。
9. architecture checkerを通すために特定fileの例外やallowlistを増やさない。

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
| Task 10 | visual snapshot差分を根拠付きで解消 | Task 9 |
| Task 11 | Task 8〜10後のHEADでPhase全体を再検証 | Task 10 |
| Task 12 | 残存するapplication責務、dependency direction、snapshot contract、test実行漏れを解消 | Task 11後の独立レビュー |

Task 1〜11の有効な実装と検証結果は維持する。Task 12はそれらを作り直すTaskではなく、Task 11後の独立レビューで確認した残存問題だけを対象にする。

## Phase受入条件

- `apps/webapp/js/comipath-browser-runtime.js`、`apps/webapp/js/event-day-data-store.ts`、`apps/webapp/js/comipath-dom-coordinator.js`が削除されている。
- production sourceがこれらのFacadeをimportしない。
- route guidance固有のproduction moduleがrootの`navigation/`、`routing/`、`route-planner.ts`、navigation snapshot repositoryへ分散していない。
- route guidanceのmutable stateは`RouteGuidanceSession`を正本として追跡できる。
- event/dayとcircle statusのmutable stateはfeatureのSession/Repositoryを正本として追跡できる。
- source request/cancellation stateはCircle Data Source featureが所有する。
- `bind-browser-events.ts`と個別binderがRepository、HTTP/GAS client、Worker、route algorithmを生成・importしない。
- `BrowserApplication`がfeature固有のconcrete infrastructure、route algorithm、Event Day Repository writeを所有しない。
- initial event/dayを決定・commitするproduction経路が一つである。
- Route Guidance snapshotのproduction contractが一つで、引数を無視するadapterや後差し替えcallbackがない。
- feature UIが同featureのconcrete infrastructure classへ直接依存しない。
- use caseが`fetch`、`localStorage`、`new Worker(...)`等のconcrete browser APIを直接所有しない。
- browser event listener、timer、Worker等のlifecycle ownerが明確で、`stop()`時に解除される。
- architecture checkerが`bind-browser-events.ts`または`browser-application.ts`をconcrete infrastructure検査から特例除外しない。
- architecture testが「旧ファイル名だけ消して巨大Facadeを別名へ移す」実装を合格させない。
- `browser-application.ts`に`// @ts-nocheck`が残っていない。
- obsoleteなlegacy runtime test importが残っていない。
- `npm run test:webapp`が残存するwebapp unit/characterization testを手書きfile listの漏れなく実行する。
- visual snapshot差分が、既存表示への回帰修正または証拠付きbaseline更新で解消されている。
- snapshot threshold、skip、retry増加でfailureを隠していない。
- `npm run verify:webapp`が成功する。
- CI相当の`npm run test:e2e:ci`が成功する。
- `npm run verify:gas`が成功する。
