# Phase 7.2 Task 8: Phase 7.1/7.2の実機受入と回帰検証

## 目標

Task 1〜7を単体GREENで終わらせず、Phase 7.1で完了判定が早すぎた項目を実利用フローで再検証する。既存offline、management、purchase/GAS sync、routingの回帰も同時に確認する。

## やってはいけないこと

- unit test全通過だけでPhase完了にしない。
- visual snapshot差分を原因未確認のまま一括更新しない。
- retryで通ったflakyを無条件GREEN扱いしない。
- private C108 fixture unavailableを機能PASSと記録しない。
- Task 1〜7の未完了をprogress文書だけ「完了」に変えない。
- 既存失敗を今回の回帰と決めつけたり、逆に既存失敗というラベルだけで無視したりしない。

## 対象ファイル

**変更:**
- `docs/status/progress.md`
- 必要な既存E2E spec
- 意図したvisual snapshotだけ

**作成してよい:**
- `docs/reviews/phase-07-2-field-verification.md`

verification文書は実行時の証拠記録であり、現在のフェーズ/次Taskの正本にはしない。変動状態の正本は`docs/status/progress.md`だけとする。

Task 8で新規featureを追加しない。bugを見つけた場合は原因を特定し、Task 1〜7のうち責務を持つTaskへ戻して最小修正する。修正が既存Taskの範囲を越える場合だけ追加Taskを作る。

## Gate 1: Phase 7.1残件の再受入

### route flow

- current routeが赤base + moving direction cue。
- S/Gが判別可能。
- reduced motionでは静止方向cue。
- candidateにはcurrent flowなし。

### 情報階層

- 通常案内中、current destination/distanceの正本は上部summary一箇所。
- detailはcatalog/action主体。
- candidate時だけ`変更候補`を明示。

### map physics

- 指追従中bounds内は1:1。
- release後に慣性。
- bounds外elasticはTask 5のlimit以下。
- release後合法boundsへ停止。
- C108 4aspectで四辺へ到達可能。

### motion/tutorial

- fresh storageでtutorial animation。
- seen済みstorageで自動再生なし。
- helpからmanual replay。
- localStorage unavailableでもmanual replay可能。
- reduced motionで過度な移動なし。

## Gate 2: Phase 7.2新機能

### GAS setup

- managementからcode copy。
- event/day設定状態に依存せずGAS setupへ到達可能。
- clipboard不可時manual fallback。
- copied text == generated `Code.gs`。
- `upsertCatalog`、`sale`、invalid JSON、unknown actionが同じ`doPost(e)`入口で期待どおり分岐する。

### catalog extension

fixture testに加えて手動smokeを行う。

```text
1. unpacked extensionをload
2. optionsにtest GAS URL / test sheetを設定
3. 対応catalog pageを開く
4. popupでspace/image URL確認
5. send
6. spreadsheetで該当spaceのtweet列更新確認
7. 同spaceを別URLで再sendし、row追加ではなく同row更新確認
```

本番個人URLをtest artifact/logへ保存しない。content scriptがclassic scriptとして読み込め、background moduleが起動することも実機で確認する。

### candidate route

- pin tap後`ready`時点でblue line。
- preview badge/tint。
- candidate選択中は購入・保留buttonが利用不可。
- DOMを経由せず`BrowserApplication.handleAction()`を直接呼んでもcandidate mutationが起きないことをunit/integration testで証明。
- close/cancelでcandidate表示とguardが解除される。
- confirm後current targetが正しく切り替わり、route color/flowもcurrentへ移行する。

### Gallery

- 全areaのunvisitedをheader一覧で表示。
- arbitrary priority集合をdynamic表示。
- missing priorityと数値`0`を区別。
- filter/empty stateが正しい。
- area-specific/holdの既存flowが維持される。

### target layout

- portrait/landscape/square/no-image。
- 360px未満。
- 200% zoom。
- candidate preview。

## Gate 3: 既存機能回帰

最低限:

- CSV preview/apply。
- GAS source preview/apply。
- sale purchase POST + outbox recovery。
- local deletion + catalog cache cleanup。
- offline catalog cache。
- event/day switching。
- route optimization/start/resume/finish。
- current purchase/hold operations。
- management dialog isolation/focus。

Task 1で`doPost` routerを変更するため既存sale mutationのcontract testを必須にする。Task 3で`handleAction()`を変更するため通常current purchase/holdとcandidate guardを両方確認する。

## 自動検証

focused testは、実際にTask 1〜7で作成・変更されたtest file名をTask開始時に確認して実行する。計画段階の仮ファイル名を無条件で固定しない。

最低限の責務:

```text
GAS router/upsert
Chrome extension extractor/client
candidate overlay
BrowserApplication purchase/hold candidate guard
route overlay animation/reduced motion
GestureZoom map-specific overscroll/bounds
Gallery global scope/priority/tutorial
catalog orientation/layout
```

次にfull:

```bash
npm run verify
npm run test:e2e:ci
git diff --check
```

Task 2完了時点で次も静的に確認する。

```text
package.json: npm run verify が verify:webapp + verify:gas + extension tests に到達する
.github/workflows/webapp-ci.yml: npm run verify を実行し、その後 npm run test:e2e を実行する
```

CI workflow自体の変更はTask 2の責務であり、Task 8で初めて追加しない。

## 既存失敗・flakyの分類

full testで失敗した場合は、まず同じcommandをTask開始基準HEADまたは変更前証拠と比較できる範囲で分類する。

- 今回の変更で新たに失敗した: Task責務へ戻して修正。
- 開始基準でも同じ失敗: 既存失敗として証拠を記録し、Phase 7.2の要求を証明するfocused testが通るなら無条件停止理由にはしない。
- fixture/外部環境不足: SKIPまたは環境要因として記録し、PASSへ数えない。
- retryだけで通る: flakyとしてfailure artifact、単発rerun、複数回repeatの結果を残す。
- 原因不明: GREENと書かない。独立して完了できるGateまで捨てない。

## visual review matrix

最低viewport:

| viewport | 用途 |
|---|---|
| 360x800 | 小型mobile |
| 390x844 | 標準mobile |
| 430x932 | 大型mobile |
| 1280x800 | desktop |

追加:

- 390px viewportで200% browser zoom相当。
- `prefers-reduced-motion: reduce`。

確認画面:

- current route。
- alternate candidate route。
- portrait target detail。
- landscape target detail。
- global Gallery + tutorial。
- management GAS setup。

## performance sanity

map gestureについて:

- pointermove handlerで新規layout readをしない。
- active transform更新は1 RAFへcoalesce。
- route animationはCSS/SVGでJS frame loopなし。
- Gallery tutorial終了後にtimer/animation classが残留しない。
- persistent `will-change`を外した場合、操作性能の明確な回帰がない。

## documentation

`docs/reviews/phase-07-2-field-verification.md`を作る場合は次の実行証拠だけを記録する。

```text
実装開始時base SHA
検証対象HEAD SHA
実行command
PASS/FAIL/SKIP件数
既存失敗/flakyと再現結果
manual extension smoke結果（秘密情報なし）
mobile visual review結果
未完了ならblocker
```

Task番号や現在状態をこのverification文書へ正本として重複保持しない。

## 完了条件

以下を満たすまで`docs/status/progress.md`をPhase 7.2完了へしない。

- Task 1〜7の受入条件が本番接続とtest双方で満たされる。
- Phase 7.1残件をfield-oriented gateで再受入する。
- `npm run verify`がwebapp、GAS、extensionを実際に含み、GitHub Actionsも同じverifyへ到達する。
- full verify/E2Eが成功するか、失敗が今回の変更外として証拠付きで分類される。
- manual/visual gateに未確認項目が残っていない。
- extension/GASの秘密情報がrepository/log/artifactへ入っていない。