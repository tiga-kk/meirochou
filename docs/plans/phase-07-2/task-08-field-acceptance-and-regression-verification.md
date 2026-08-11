# Phase 7.2 Task 8: Phase 7.1/7.2 field acceptanceと回帰検証

## 目標

Task 1〜7を単体GREENで終わらせず、Phase 7.1で完了判定が早すぎた項目を実機利用フローで再検証する。既存offline、management、purchase/GAS sync、routingの回帰も同時に確認する。

## やってはいけないこと

- unit test全通過だけでPhase完了にしない。
- visual snapshot差分を原因未確認のまま一括更新しない。
- retryで通ったflakyを無条件GREEN扱いしない。
- private C108 fixture unavailableを機能PASSと記録しない。
- Task 1〜7の未完了をprogress文書だけ「完了」に変えない。

## 対象ファイル

**変更:**
- `docs/status/progress.md`
- 必要な既存E2E spec
- 意図したvisual snapshotだけ

**作成してよい:**
- `docs/reviews/phase-07-2-field-verification.md`

production codeは、Task 8で新規featureを追加しない。ここでbugを見つけた場合は原因を特定し、該当Taskの責務へ戻して修正する。

## Gate 1: Phase 7.1未完了項目の再受入

### route flow

- current routeが赤base + moving direction cue。
- S/Gが判別可能。
- reduced motionでは静止方向cue。
- candidateにはcurrent flowなし。

### information hierarchy

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
- reduced motionで過度な移動なし。

## Gate 2: 新Phase 7.2機能

### GAS setup

- managementからcode copy。
- clipboard不可時manual fallback。
- copied text == generated `Code.gs`。

### catalog extension

fixture testに加えて、手動smoke手順を記録する。

```text
1. unpacked extensionをload
2. optionsにtest GAS URL / test sheetを設定
3. catalog pageを開く
4. popupでspace/image URL確認
5. send
6. spreadsheetで該当spaceのtweet列更新確認
7. 同spaceを別URLで再sendし、row追加ではなく同row更新確認
```

本番個人URLをtest artifact/logへ保存しない。

### candidate route

- pin tap後`ready`時点でblue line。
- preview badge/tint。
- cancelで消える。
- confirm後current targetが正しく切り替わり、route color/flowもcurrentへ移行。

### Gallery

- 全areaのunvisitedをheader一覧で表示。
- arbitrary priority集合をdynamic表示。
- filter/empty stateが正しい。

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

Task 1で`doPost` routerを変更するため、特に既存sale mutationのcontract testを必須にする。

## CI/verification command

focusedを先に実行する。

```bash
npm run verify:gas
npm run test:catalog-extension
npx vitest run --root . \
  tests/route-preview-state.test.ts \
  tests/route-overlay-contract.test.ts \
  tests/gesture-zoom-controller.test.ts \
  tests/route-map-viewport-layout.test.ts \
  tests/gallery-view-model.test.ts \
  tests/catalog-orientation.test.ts
```

次にfull:

```bash
npm run verify
npm run test:e2e:ci
git diff --check
```

`npm run test:e2e:ci`に既知flakyが出た場合:

1. failure artifactを保存。
2. 同testだけ単発rerun。
3. 5回程度repeatで再現率を記録。
4. Phase 7.2変更との因果を比較。
5. 原因不明なら「GREEN」と書かない。

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

## documentation

`docs/reviews/phase-07-2-field-verification.md`には次だけを記録する。

```text
main/base SHA
feature HEAD SHA
実行command
PASS/FAIL/SKIP件数
既知flakyと再現結果
manual extension smoke結果（秘密情報なし）
mobile visual review結果
未完了ならblocker
```

## 完了条件

以下すべてを満たすまで`docs/status/progress.md`をPhase 7.2完了へしない。

- Task 1〜7のacceptanceが実装/test双方で満たされる。
- Phase 7.1残件4系統をfield-oriented gateで再受入する。
- full verifyが成功するか、失敗がPhase 7.2外の既知問題として証拠付きで分類される。
- manual/visual gateに未確認項目が残っていない。
- extension/GASの秘密情報がrepository/log/artifactへ入っていない。