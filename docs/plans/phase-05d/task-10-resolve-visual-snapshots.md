# Phase 5D Task 10: visual snapshot差分を根拠付きで解消する

## 目的

Task 8・9の構造修正後に、CIで残るvisual snapshot差分を一枚ずつ調査し、「Phase 5Dで混入した見た目の回帰を戻す」のか「既存baselineが現在の意図した表示に対して古いので更新する」のかを証拠に基づいて決める。

snapshotをGREENにすること自体を目的にしない。Phase 5DはUI redesignではないため、意図しないvisual changeをbaseline更新で承認してはいけない。

Task 7時点の5枚は調査対象候補であり、Task 10開始時のfresh CI-equivalent runを最終的なfailure一覧の正本とする。Task 8・9で自然に解消したsnapshotを、5枚という数を合わせるために再度変更してはいけない。

## 前提

- Task 8とTask 9が完了していること。
- `npm run verify:webapp`が成功していること。
- Task 10開始時にCIと同じPlaywright環境でfreshなactual/diffを取り直すこと。

Task 8・9のDOM/event ownership修正で画面出力が変わった場合、Task 7時点のartifactではなくTask 10開始時のfresh artifactを判断対象にする。

## Task 7時点で確認済みの候補

2026-08-07のGitHub Actions run `31176251395`、Node.js `22.14.0`、npm `10.9.2`、Playwright `1.61.1`では`npm run verify:webapp`は成功し、E2Eだけが次の5枚で失敗した。

| snapshot | Task 7時点の差分 |
|---|---|
| `settings-shell-source-manager.png` | expected 369x1265 / actual 369x1264、約5% pixel diff |
| `outbox-recovery-panel.png` | expected 343x131 / actual 343x151、約23% pixel diff |
| `scoped-deletion-dialog.png` | expected 343x359 / actual 343x358、約5% pixel diff |
| `navigation-map-catalog.png` | expected 369x884 / actual 369x865、約7% pixel diff |
| `navigation-map-route-candidate.png` | expected 369x1173 / actual 369x1154、約9% pixel diff |

Task 7ではすべてretry後も同じ種類の差分が再現している。これはTask 10開始時点の調査候補として使うが、Task 8・9後にも必ず同じ5件が失敗すると仮定しない。

## 履歴上の基準

調査時は少なくとも次を比較する。

- Phase 5D base: `c1b75dfb518b19bf5750cf468c9d18c8877ac590`
- CI描画にsnapshotを揃えた既知commit: `0a2c04286d804f4041508622ef48e2cd7ff9cdbf` (`test(e2e): align mobile snapshots with CI rendering`)
- Task 10開始時HEAD

`0a2c042...`では今回対象の5枚を含むmobile snapshot群がCI renderingへ合わせて更新されている。したがって「OS差だから全部更新する」という説明は不可とする。

Phase 5D baseから現HEADまでの比較では、management側の一部snapshotはPhase 5D中にも更新されている一方、route guidance側の対象snapshotにはbaseから変更されていないものがある。画像の履歴だけで結論を出さず、対応するDOM/CSS/Viewの変更履歴も照合する。

## 対象外

- UI redesign
- snapshot threshold緩和
- retry回数増加
- screenshot testのskip/削除
- failureを隠すためのlocator変更
- Playwright version変更
- フォントやviewportをsnapshotに合わせるだけの環境hack
- Task 8・9のarchitecture再設計
- fresh runで既にPASSしたsnapshotの不要な更新

## 対象ファイル

### 調査・必要な場合のみ変更

- `tests/e2e/management.spec.ts`
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts-snapshots/`の実際に失敗している対象画像
- `tests/e2e/webapp.spec.ts-snapshots/`の実際に失敗している対象画像
- failureに対応する現行component / View / CSS
  - `apps/webapp/js/components/comipath-settings.ts`
  - `apps/webapp/js/components/outbox-panel.ts`
  - `apps/webapp/js/components/storage-delete-dialog.ts`
  - `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
  - `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
  - `apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts`
  - `apps/webapp/css/`配下の対応style

実際に原因と関係のあるファイルだけを変更する。候補5枚すべてのproduction fileを機械的に触らない。

E2E spec自体は、locator/fixture/assertionが現行の既存仕様と明確に不一致であることを実装・履歴から証明できた場合だけ変更する。snapshot差分を消すためにtest側を現在実装へ合わせることは禁止する。

## 各snapshotの判定

Task 10開始時にFAILしている各snapshotを、次のどちらかに分類する。

### `REGRESSION`

Phase 5Dのrefactorで、既存仕様にない表示・spacing・高さ・内容・状態が変わった。

対応:

- production codeを既存表示へ戻す。
- expected snapshotは変更しない。
- semantic E2E assertionも通ることを確認する。

### `BASELINE_UPDATE`

現在の表示が既存仕様・意味論と一致しており、expected image側が古いことを履歴とDOM inspectionから一意に説明できる。

対応:

- production codeをsnapshotに合わせて歪めない。
- CI固定環境で、対象spec/testだけを実行して必要なbaselineだけを更新する。
- 更新理由をcommitまたは進捗記録へ残す。

Task 7候補のうちTask 8・9後のfresh runで既にPASSしたものは、`RESOLVED_BY_PRIOR_FIX`として記録してよい。この場合snapshotもproductionもTask 10では変更しない。どのTask 8/9差分で解消したか追える範囲で記録する。

`UNKNOWN`のままTask完了にしない。

## ユーザー判断が必要な場合

`BASELINE_UPDATE`は見た目の新しいbaselineを正として固定する操作であるため、repository内の既存仕様、semantic assertion、履歴から現在表示が正しいと一意に判断できる場合だけ自動で行う。

次のような場合はsnapshotを更新せず、該当1件だけユーザー判断事項として残す。

- old/newどちらの表示も既存仕様を満たす。
- spacing、文言、表示要素のどちらを製品上の正とするかrepositoryから決められない。
- Phase 5D以前から存在した意図的UI変更か、偶発差分かを履歴から区別できない。

質問する場合はexpected/actualの意味上の差、履歴、推奨案を示す。単に「snapshotを更新してよいか」とだけ聞かない。

## 判定に必要な証拠

各failureについて次を確認する。

1. expected / actual / diff画像を目視する。
2. elementのbounding box差を確認する。
3. text content、表示/非表示要素、ARIA、class/stateを比較する。
4. Phase 5D baseと現HEADの関連DOM/CSS/View diffを確認する。
5. snapshotを最後に意図的に更新したcommitを確認する。
6. semantic assertionが同じuser behaviorを示しているか確認する。
7. Task 8・9でその画面に関係するproduction変更があれば、その差分も確認する。
8. test fixture/stateがexpected作成時と同じ意味を持つか確認する。

画像サイズが1px違うだけでも、それだけを理由にbaseline updateとしない。逆にpixel diff率が大きいだけでregressionと断定もしない。何が描画されたかを確認する。

## Task 7候補ごとの重点確認

### `settings-shell-source-manager.png`

- source panelの表示内容・busy/error/preview state
- settings shell内のgap/padding/border
- feature View分離によるwrapper差
- Phase 5D中にsnapshot自体が更新された履歴

### `outbox-recovery-panel.png`

Task 7時点では高さが20px増えており、他の1px級差分より大きい。fresh runでも失敗する場合は最優先で内容差を確認する。

- 新しいlabel/message/buttonが増えていないか
- error/recovery stateが二重表示されていないか
- padding/line-heightだけの変更か
- old baselineの状態fixtureと現在fixtureが同一か

### `scoped-deletion-dialog.png`

- dialog title/description/confirm text
- focus/ARIA
- modal padding/border
- Phase 5D中のsnapshot更新後にさらに差が出る理由

### `navigation-map-catalog.png`

- target card内のmap、catalog image、text、route status
- current/selected targetのどちらを表示しているか
- route guidance View分割でwrapper/layoutが変わっていないか
- baseline画像がPhase 5D baseから据え置かれている場合、その表示を正本として扱えるか

### `navigation-map-route-candidate.png`

- current routeとcandidate routeの比較表示
- route selection controlsのvisibility
- map/catalog section高さ
- selected/current stateの二重描画がないか

## 実装手順

1. CI固定containerで更新なしの`npm run test:e2e:ci`を実行し、Task 10開始時のfailure一覧とfresh actual/diffを生成する。
2. Task 7候補5枚について、PASSしたものは`RESOLVED_BY_PRIOR_FIX`として変更せず記録する。FAILしているものと新規snapshot failureだけを以後の対象にする。
3. 各FAILを上記基準で個別に調査する。
4. `REGRESSION`と判定したものはproduction codeだけを修正し、そのtestを更新なしで再実行する。
5. `BASELINE_UPDATE`と判定したものはproduction codeを変更せず、対象testだけをCI固定containerで更新する。
6. baseline更新直後に`git diff --name-only`と画像diffを確認し、意図したPNG以外が変わっていたらその更新を採用しない。未関連差分をreset/restoreして消すのではなく、対象を絞ったisolated worktree/cloneで再実行する。
7. 各対象が解消した後、そのspec全体を更新なしで実行する。
8. 最後にfull `npm run test:e2e:ci`を更新なしで実行し、新しいsnapshot failureがないことを確認する。
9. `npm run verify:webapp`を再実行する。

## 実行コマンド

最初の再現:

```bash
npm run test:e2e:ci
```

対象を絞る場合、`scripts/run-e2e-in-ci-container.sh`は追加引数をPlaywrightへ渡すため、spec pathや`--grep`を明示する。

例:

```bash
npm run test:e2e:ci -- tests/e2e/management.spec.ts --grep '<対象test名>'
npm run test:e2e:ci -- tests/e2e/webapp.spec.ts --grep '<対象test名>'
```

baseline更新が必要と判定した場合も、full updateを先に実行しない。対象testだけを指定する。

```bash
npm run test:e2e:ci:update -- tests/e2e/management.spec.ts --grep '<対象test名>'
# または
npm run test:e2e:ci:update -- tests/e2e/webapp.spec.ts --grep '<対象test名>'
```

更新後:

```bash
git diff --name-only
npm run test:e2e:ci
npm run verify:webapp
git diff --check
```

## 禁止事項

- full `npm run test:e2e:ci:update`を最初に実行して差分原因を消す。
- `--update-snapshots`を対象指定なしで実行する。
- `maxDiffPixels`、`maxDiffPixelRatio`、thresholdを緩める。
- testをskipする。
- retry増加でGREEN扱いする。
- actual screenshotを手動コピーする。
- CIとは異なるOS/Playwrightの画像を正本にする。
- Task 7候補5枚を一括更新してから事後的に理由を付ける。
- PASS済みsnapshotを数合わせで更新する。

## 受入条件

- Task 7候補5枚について、Task 10開始時のfresh結果が記録されている。
- fresh runでFAILしたsnapshotはそれぞれ`REGRESSION`または`BASELINE_UPDATE`の根拠を説明できる。
- Task 8・9で既に解消した候補は変更せず`RESOLVED_BY_PRIOR_FIX`として扱っている。
- regressionはproduction code修正で解消し、baselineを変更していない。
- baseline updateはCI固定環境かつ対象testだけから生成され、意図したsnapshotだけが変更されている。
- repositoryから正しい見た目を一意に決められない場合、baselineを独断更新していない。
- semantic E2E assertionを弱めていない。
- threshold、retry、skipを変更していない。
- `npm run test:e2e:ci`が更新なしで成功する。
- `npm run verify:webapp`が成功する。

## 予定コミットメッセージ

全てregression修正なら:

```text
fix(ui): restore phase 5d visual behavior
```

baseline更新を含む場合は理由が分かるmessageにする。例:

```text
test(e2e): refresh verified phase 5d visual baselines
```

production修正とbaseline更新が独立してレビュー可能なら、別commitにする。
