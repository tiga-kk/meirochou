# Phase 7.3 Task 3: 購入済み地図ピンの除外と候補表示の分離

## 目標

購入済みcircleを通常の行き先候補から除外し、地図ピンを押した時に現在の目的地情報を置き換えず、独立した候補カードとして表示する。

現状は `route-map-pin-model.ts` が購入済みcircleも `done` pinとして生成し、`dom-route-map-view.ts` がそのpinにも通常のcandidate preview callbackを結んでいる。CSSだけではなくpin modelと本番event接続を修正する。

## 外部挙動

通常表示では購入済みcircleの候補pinを作らない。ただし、現在地・現在目的地・明示的に選択中の特別なmarkerとして必要な場合は、それぞれの既存stateを壊さない範囲で表示してよい。

地図pinのクリック後は次を満たす。

- 上部のcurrent navigation summaryは現在の目的地のまま。
- main target detailも暗黙にcandidateへ置き換えない。
- map transformの外側にfloating candidate cardを表示する。
- cardはspace、距離、priority、利用可能ならcatalog thumbnailを持つ。
- `比較/行き先変更`等、既存仕様上必要な明示actionからだけcandidate route計算やdestination changeへ進む。
- close、外側click、適切なEscape操作でcandidate表示を閉じる。
- hover/focusだけではroute stateを変更せず、重いroute計算を連発しない。

## 対象ファイル

**変更候補:**

- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts`
- `apps/webapp/index.html`
- `apps/webapp/css/maps.css`
- `apps/webapp/css/target.css`
- `tests/route-guidance-controller.test.ts`
- `tests/dom-route-guidance-view.test.ts`
- `tests/application-assembly.test.ts`
- `tests/e2e/webapp.spec.ts`

既存の `change-destination`、comparison、route preview処理を再利用し、新しいroute計算use caseを重複作成しない。

## テスト方針

次のREDを先に作る。

- 通常stateで購入済みcircleからpinが生成されない。
- 購入完了後の再描画でもそのpinが消える。
- pin clickでcurrent target summary/detailがcandidate内容へ置換されない。
- pin clickで独立candidate surfaceが表示される。
- closeでcandidate cardと青いcandidate routeが消え、current routeは維持される。
- hover/focusだけではdestination/session stateが変化しない。
- 本番assemblyまたはE2Eで実DOMのpin clickから新candidate surfaceへ到達する。

mockしたview modelだけで合格にしない。旧 `previewTarget(pin.circle)` 直結のままでも通るテストは不十分である。

## やってはいけないこと

- 購入済みpinをCSSで透明にするだけにしない。
- candidate表示のためにcurrent target DOMを複製・上書きしない。
- pin hover/focusでroute stateを変更しない。
- candidate専用の新しいnavigation storeを作らない。
- テスト専用eventやDOM分岐を追加しない。

## 完了条件

- 購入済み候補pinがmodel段階から除外される。
- candidate UIとcurrent navigation UIの責務がDOM上もstate上も分離される。
- 本番pin clickが新しいcandidate経路へ接続されていることをE2Eまたはassembly testで証明する。
- keyboard/touchを含め既存navigationの主要操作を壊していない。