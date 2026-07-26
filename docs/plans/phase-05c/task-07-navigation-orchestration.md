# Phase 5C Task 7: Navigation and Optimization Orchestration

**Status:** Complete
**Depends on:** Phase 5C Tasks 1-6  
**Commit candidate:** `feat(navigation): coordinate arrival and route improvement`

## Goal

始点、重み付き距離行列、area別timing profile、service time、暫定順路、time-decayed ALNS、到着、購入、保留、対象外、手動目的地変更を統合する。次目的地を即時表示し、現在区間を固定したまま残りをbackgroundで改善する。

`docs/specs/2026-07-27-phase-05c-time-decayed-alns-amendment.md`をoptimizer orchestrationの正本とする。地図内総時間予算、個別締切、TOPTWは使用しない。

## Required adapter responsibilities

- Task 5の重み付きdistance matrixをTask 6のtiming profileで`travelTimesSec`へ変換する。
- priorityを`max(0, priority ?? 0)`で`values`へ変換する。
- 各pending circleの`serviceTimesSec`を解決する。
- 通常サークルは30秒、信頼できる壁分類があるサークルは200秒とする。
- 壁分類が不明な場合は30秒をdefaultとする。
- service-time metadataの解決をgridのblocked/crowded判定と混同しない。
- `optimizationProfileVersion`をproblem、best result、recovery snapshotへ渡す。
- profile versionが変わってもdistance matrixは再利用し、旧bestは再評価または修復してからwarm startに使う。

## Required flows

### Initial start

- 始点から1回Dijkstraでpending候補への重み付き距離を得る。
- 同じtiming profileで始点距離を移動秒数へ変換する。
- 暫定の最初の目的地を即時表示する。
- matrix不足ならbackground生成を開始する。
- matrix完成後にtime-decayed ALNSを開始する。
- current targetをWorker結果で変更しない。
- Worker resultはcurrent targetより後ろの`bestOrder`だけを更新する。

### Before-arrival hold

- targetをheldへする。
- current positionを最後の確定位置に保つ。
- targetを候補から外す。
- 同じcurrent positionから次候補を即時表示する。
- previous bestからheld targetを除いたrepaired orderで再最適化する。
- distance matrixを再生成しない。

### Arrival then purchase

- `到着した`でcurrent positionをtargetへ移す。
- `購入して次へ`でpurchasedへする。
- 既存best orderの次を即時採用する。
- 次々区間以降をbackground改善する。
- 購入済みnodeをcandidate setから除き、previous bestを修復してwarm startする。

### Arrival then hold

- `到着した`でcurrent positionをtargetへ移す。
- `後でまた来る`でheldへする。
- 既存best orderの次を即時採用する。
- held nodeをcandidate setから除き、previous bestを修復してwarm startする。

### Manual target

- 新target経路を即時表示する。
- old pending targetを候補へ戻す。
- held targetはpendingへ戻す。
- 新targetをfixed first targetとして設定する。
- matrixを再生成しない。
- previous bestを修復してwarm startする。
- Worker progressまたはcompleteで新targetを上書きしない。

### Optimization cancel

- cancelはbackground improvementだけを止める。
- Workerが返すlatest bestを保持する。
- current target、current leg、表示中routeを変更しない。
- 未完了であることを理由に案内を停止しない。

### Normal completion

pendingが0、heldが1以上:

```text
通常の巡回が完了しました。保留中がN件あります。
[保留を巡回]
```

確認後に全heldをpendingへ戻し、通常最適化を開始する。全held復帰前にstate、service-time input、candidate identityを変更しない。

## TDD procedure

- [x] initial startで即時targetが出るintegration testを書く。
- [x] start distanceとmatrix distanceが同じtiming profileで秒へ変換されるtestを書く。
- [x] priorityがALNS valueへ変換されるtestを書く。
- [x] 通常30秒、壁200秒、不明30秒のservice-time resolver testを書く。
- [x] Worker progressでcurrent targetが変わらないtestを書く。
- [x] before-arrival holdがcurrent positionを動かさないtestを書く。
- [x] arrival purchaseがprepared nextを待機なしで使うtestを書く。
- [ ] arrival holdがtarget位置から次へ進むtestを書く（Circle state mutationとの接続は未実装）。
- [x] manual targetがmatrix再生成を起こさないtestを書く。
- [x] old target reinsertionとfixed first targetのtestを書く。
- [ ] profile version mismatchでdistance matrixを維持し、旧bestを再評価するtestを書く（Task 8のrecovery/cache接続へ移管）。
- [x] optimizer cancel後もcurrent legを維持するtestを書く。
- [x] held bulk return確認前にstateが変わらないtestを書く。
- [x] 確認後に全heldがpendingになるtestを書く。
- [x] REDを確認する。

```bash
npx vitest run --root . tests/navigation-orchestration.test.ts tests/optimization-input-adapter.test.ts tests/purchase-flow.test.ts
```

- [x] orchestration serviceを追加し、Appへ直接algorithmを書かない。
- [x] optimization input adapterを追加する。
- [x] job generation IDを更新し、old progressを無視する。
- [x] provisional orderとbest orderを区別する。
- [x] current targetとlocked first legを同期して更新する。
- [ ] progress componentへmatrix/time-decayed-alns stageを渡す（UI接続はTask 9へ移管）。
- [x] cancelはbackground improvementだけを止める。
- [ ] completion dialogを実装する（Lit UI接続はTask 9へ移管）。
- [x] GREENを確認する。

```bash
npx vitest run --root . tests/navigation-orchestration.test.ts tests/optimization-input-adapter.test.ts tests/purchase-flow.test.ts tests/purchase-mutation-service.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## 実績

- `NavigationOrchestrationService`を追加し、始点直後の暫定target、到着前保留、到着後の購入、手動target変更、最適化cancelを純粋な状態遷移として整理した。
- Worker結果は現在targetを必ず先頭に保持し、`bestOrder`だけを更新するよう修正した。`provisionalOrder`、`currentPosition`、`lockedFirstLeg`をWorker結果で上書きしない。
- 到着前保留では最後の確定位置から次targetへ進み、到着後購入では到着circleを次区間の始点にするよう修正した。手動target変更も現在の確定位置からのlocked legを生成する。
- optimizer generationをnavigation stateへ追加し、cancelまたは状態遷移後に古いWorker progressを破棄する。
- Task 5のN×N circle matrix、始点距離、area別timing profileを検証し、未知areaや不正距離を黙ってfallbackしないadapterへ修正した。
- Task 7固有の未接続範囲は、Circle state mutationとのarrival hold連携、profile-version再評価/recovery、進捗UI、完了ダイアログ。これらはTask 8/9の契約に従って実装する。

## Acceptance criteria

- 次目的地選択が最適化完了待ちにならない。
- current first legが固定される。
- 購入前後のcurrent positionが正しい。
- before/after arrivalのholdが区別される。
- manual target変更でmatrixを再生成しない。
- weighted distance、travel time、service time、priority valueが正しいoptimizer inputになる。
- profile version変更でmatrixとoptimizer resultのcache責務が分離される。
- held一括復帰は確認後だけ実行される。
- cancel後も現在案内を継続できる。
