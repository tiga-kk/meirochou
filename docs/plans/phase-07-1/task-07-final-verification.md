# Phase 7.1 Task 7: 総合検証・snapshot・進捗確定

## 目標

Task 1〜6のproduction実装が個別には成立していても、相互作用でナビゲーション、地図、管理画面、アクセシビリティ、performanceを壊していないことを最終確認する。意図したvisual snapshotだけを新しい基準へ更新し、`docs/status/progress.md`を実装済みcommit SHAと実測結果に合わせて更新する。

このTaskでは新しいUI機能を追加しない。検証で見つかったPhase 7.1由来の小さな回帰は所有Taskの範囲で修正してよいが、新しい設計や別機能が必要な問題は残件として分離する。

## やってはいけないこと

- `--update-snapshots`を全体へ無条件実行し、差分を一括acceptしない。
- retryで一度成功しただけでflakyをGREEN扱いしない。
- Task開始前から存在する失敗をPhase 7.1回帰と断定しない。
- 逆に、Task開始SHAで成功していたfailureを「既存」として逃がさない。
- test helperやcomponent public methodで本番UI経路を迂回して総合E2Eを成立させない。
- verificationのためにproduction logicへtest専用分岐を追加しない。
- Task 7で新しいmotion、abstraction、component、settingを増やさない。
- 最終implementation commitのSHAを、そのcommit自身へ事前に書き込もうとしない。

## 基準点

Task 7開始直前に次を記録する。

```text
TASK_START_SHA=<最新origin/mainまたは実装branch上のTask 6完了HEAD>
```

既存失敗を分類する必要がある場合は、Phase 7.1の各Task開始SHAまたはTask 1開始前の最新`origin/main`を比較基準として使用する。計画作成時SHA`c812de4...`を無条件の回帰基準にしない。

## 総合E2E項目

最低限、同じ最終コードに対して次を確認する。

1. current route flow
   - no-preferenceでcomputed dash offsetが時間変化する。
   - Start→Goal方向を視認できる。
   - reduced motionでloop停止、solid routeとS/Gは残る。
2. navigation information hierarchy
   - 通常案内でcurrent target/distanceの上下重複がない。
   - candidate preview/loading/readyで候補spaceとdistance/statusが文字で見える。
   - comparison/cancel/confirmが回帰しない。
3. map pan
   - C108各areaの必要端へ到達できる。
   - bounds内1:1。
   - release後の慣性と停止。
   - bounds外へ残らない。
   - idle RAFなし。
4. Gallery hint
   - 初回だけ自動表示。
   - 実swipe方向を短く示す。
   - reduced motionで移動停止。
5. management isolation
   - open中に下層mainが見えない。
   - background scrollしない。
   - close後にscroll位置復元。
6. management list/detail
   - mobile overview→detail→back。
   - detailを見るだけではactive day不変。
   - 「この日程を開く」でmain active day変更 + management close。
   - desktop 2-pane。
7. existing management operations
   - GAS再読込。
   - CSV設定/編集。
   - offline準備progress/partial failure契約。
   - delete confirmation + cache cleanup。
   - outbox retry/discard。
8. accessibility / responsive
   - keyboard focus/Escape/nested dialog。
   - 44px操作領域。
   - 200% zoom。
   - safe-area。

## performance確認

map pan:

- pointermoveごとにlayout readを増やしていない。
- transform writeは既存どおり1 frameへcoalesceされる。
- idle時RAFなし。

motion:

- 新規animationは原則`transform`/`opacity`。
- management surfaceのbackgroundはopen直後からopaque。
- animation待ちがbusiness operation完了条件になっていない。

## snapshot方針

Phase 7から残っていたmanagement snapshot差分と、Phase 7.1で意図して変わるnavigation/management snapshotを区別する。

1. 対象testを通常実行して差分を確認する。
2. 変更理由をproduction DOM/CSS差分と対応付ける。
3. 意図したsnapshotだけ個別に更新する。
4. 更新後に通常runで再確認する。
5. 無関係snapshot差分がstageされていないことを確認する。

snapshot更新だけで機能assertion不足を補わない。

## E2E helper監査

Task 6でmanagement helperを変更した後、少なくともlist→detail/openの主要E2Eが次を満たすか確認する。

- `#toggle-settings`からmanagementを開く。
- overview rowを実際のbutton/click/keyboard経路で選ぶ。
- component methodを直接呼んでdetail stateを作らない。
- application/session stateをtestから直接書き換えてaction成功扱いしない。

fixtureによる初期localStorage seedは既存test setupとして許容するが、操作経路自体は本番UIを通す。

## 既存失敗の分類

full verificationで失敗した場合:

1. focused testで再現する。
2. Task 7開始HEADだけでなく、必要なら該当Task開始SHAでも同じ失敗が再現するか確認する。
3. 次へ分類する。
   - Phase 7.1回帰
   - 既存失敗/flaky
   - fixture unavailable等の環境制約
   - 外部service依存
4. Phase 7.1回帰なら所有Task範囲の最小修正を行い、focused→fullの順で再実行する。
5. 既存/環境失敗なら、failure名、比較基準、再現結果をprogressへ記録する。

## 手順

- [ ] **Step 1: Task 1〜6のcommitと変更範囲を確認する**

各Taskが意図したfileだけを変更しているか確認する。Task間で同じ責務を重複実装していないかも見る。

- [ ] **Step 2: focused regressionを一巡する**

route、navigation、gesture、management、Galleryの対象testを個別に通し、どのTask由来か分かる状態にする。

- [ ] **Step 3: intended snapshotだけ更新する**

必要なsnapshotだけ個別更新し、その直後に通常runで再確認する。

- [ ] **Step 4: full verification**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 5: failureを基準点と比較して分類する**

retry成功のみで結論を出さない。Phase 7.1開始前でも再現する場合は既存残件として記録し、今回の回帰と混同しない。

- [ ] **Step 6: implementation側の最終commitを確定する**

検証中にPhase 7.1回帰を修正した場合、そのcode/test/snapshotをcommitし、最終production HEAD SHAを取得する。

- [ ] **Step 7: progressを別のdocs-only commitで更新する**

最終production HEADが確定してから`docs/status/progress.md`へ次を記録する。

- Task 1〜6の完了状態。
- 代表的なimplementation commit SHA。
- full verification結果。
- snapshot更新理由。
- 残る既存flaky/環境制約。
- 次の作業。

このdocs commitをproduction implementation commitへ混ぜなくてよい。未来のSHAを事前に書かない。

## 完了条件

- Task 1〜6の主要要求が同じ最終コード上で本番経路から確認できる。
- `npm run verify`と`npm run test:e2e:ci`が成功するか、失敗を基準点比較で具体的に分類できている。
- public tree auditと`git diff --check`が通る。
- 意図しないsnapshot差分が残らない。
- Phase 7.1由来の既知回帰を未分類のまま残さない。
- progressが実際の最終production HEADと検証結果を反映する。
