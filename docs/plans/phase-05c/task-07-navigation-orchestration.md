# Phase 5C Task 7: Navigation and Optimization Orchestration

**Status:** Not started  
**Depends on:** Phase 5C Tasks 1-6  
**Commit candidate:** `feat(navigation): coordinate arrival and route improvement`

## Goal

始点、距離行列、暫定順路、TOPTW、到着、購入、保留、対象外、手動目的地変更を統合する。次目的地を即時表示し、現在区間を固定したまま残りを改善する。

## Required flows

### Initial start

- 始点から1回Dijkstraでpending候補距離を得る。
- 暫定の最初の目的地を即時表示する。
- matrix不足ならbackground生成を開始する。
- matrix完成後にTOPTWを開始する。
- current targetをWorker結果で変更しない。

### Before-arrival hold

- targetをheldへする。
- current positionを最後の確定位置に保つ。
- targetを候補から外す。
- 同じcurrent positionから次候補を即時表示する。
- repaired orderで再最適化する。

### Arrival then purchase

- `到着した`でcurrent positionをtargetへ移す。
- `購入して次へ`でpurchasedへする。
- 既存best orderの次を即時採用する。
- 次々区間以降をbackground改善する。

### Arrival then hold

- `到着した`でcurrent positionをtargetへ移す。
- `後でまた来る`でheldへする。
- 既存best orderの次を即時採用する。

### Manual target

- 新target経路を即時表示する。
- old pending targetを候補へ戻す。
- held targetはpendingへ戻す。
- 新targetをfirst targetとして固定する。
- matrixを再生成しない。
- previous bestを修復してwarm startする。

### Normal completion

pendingが0、heldが1以上:

```text
通常の巡回が完了しました。保留中がN件あります。
[保留を巡回]
```

確認後に全heldをpendingへ戻し、通常最適化を開始する。

## TDD procedure

- [ ] initial startで即時targetが出るintegration testを書く。
- [ ] Worker progressでcurrent targetが変わらないtestを書く。
- [ ] before-arrival holdがcurrent positionを動かさないtestを書く。
- [ ] arrival purchaseがprepared nextを待機なしで使うtestを書く。
- [ ] arrival holdがtarget位置から次へ進むtestを書く。
- [ ] manual targetがmatrix再生成を起こさないtestを書く。
- [ ] old target reinsertionのtestを書く。
- [ ] held bulk return確認前にstateが変わらないtestを書く。
- [ ] 確認後に全heldがpendingになるtestを書く。
- [ ] REDを確認する。

```bash
npx vitest run tests/navigation-orchestration.test.ts tests/purchase-flow.test.ts
```

- [ ] orchestration serviceを追加し、Appへ直接algorithmを書かない。
- [ ] job generation IDを更新し、old progressを無視する。
- [ ] provisional orderとbest orderを区別する。
- [ ] current targetとlocked first legを同期して更新する。
- [ ] progress componentへmatrix/TOPTW stageを渡す。
- [ ] cancelはbackground improvementだけを止める。
- [ ] completion dialogを実装する。
- [ ] GREENを確認する。

```bash
npx vitest run tests/navigation-orchestration.test.ts tests/purchase-flow.test.ts tests/purchase-mutation-service.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## Acceptance criteria

- 次目的地選択が最適化完了待ちにならない。
- current first legが固定される。
- 購入前後のcurrent positionが正しい。
- before/after arrivalのholdが区別される。
- manual target変更でmatrixを再生成しない。
- held一括復帰は確認後だけ実行される。
- cancel後も現在案内を継続できる。
