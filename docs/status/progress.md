# 実装進捗

更新日: 2026-08-14

この文書を、現在フェーズ、現在Task、次に着手するTask、未完了の外部確認の唯一の正本とする。

## 現在状態

- 現在フェーズ: **Phase 7.4（第二回人間受入FAILにより再オープン）**
- 現在Task: **Task 27: 経路motion・地図workspaceの最終人間受入**
- 次に着手するTask: **Task 27**
- canonical plan: `docs/plans/phase-07-4/README.md`
- 最新設計: `docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`
- 最新人間受入記録: `docs/reviews/phase-07-4-second-human-acceptance-failures.md`
- レビュー指摘対応: 経路motionのgesture後resumeを`cfffd85`、nearby workspaceのJS/CSS mode統一を`e494ecb`で修正。
- 人間確認前に作成されたsnapshot-only 3コミットの対象10枚は`0c7b476`で更新前へ復元済み。Task 27の人間visual確認までbaselineを更新しない。

Task開始時の基準commitは、実装開始直前の対象branch最新remote HEADから取得する。文書中の過去SHAを実装開始点として固定しない。

## 履歴の扱い

Task 1〜18の実装・検証履歴は保持する。第二回人間確認で改善済みと判断された近接pin、candidate青線、priority/件数/hold、目的地action、購入Undo、leader line、表示中心等を未実装へ巻き戻さない。

Task 19〜22は2026-08-14の第二回実機確認より前に作成した**未実装の暫定計画**である。実機結果によって前提が変わったため、実装せずTask 23〜27へ置換する。後続sessionはTask 19〜22を実装開始点にしない。

## 第二回人間確認で確定した残件

### 経路アニメーション

Motorola Androidで`Animator 再生時間スケール=0x`のときcurrent route motionが見えず、この設定だけを1xにするとmotionが見えることを確認した。同時にmap pan/dragが重くなり、通常Androidアプリのanimationも復活した。

利用者にOS全体を1xへ変更させる運用は採用しない。アプリ内`system / always / off`設定と、5個程度・約160px/sの軽量moving cueへ再設計する。gesture中はmap操作を優先する。

### 独立「地図」画面

第二回確認画面では上部・左右の余白に対してmapが小さい。card非重複とleader lineは改善したが、お品書きが横一列stripのため5件でも水平slideが必要で、画像aspectも一律に見える。`お品書きを見る`のdetailはnearby mapの背面へ入り、一度mapを閉じないと見られない。

地図をfull-height workspaceの主役にし、narrow/mediumでは折り返しgrid、wideではright side panelを使う。cardはmap外で自然aspect ratioを保つ。既存catalog detailをnearby mapより前面へ表示し、map stateを維持する。

詳細は`docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`を正本とする。

## Phase 7.4 後続Task

| Task | 内容 | 状態 | 依存 |
|---|---|---|---|
| 1〜18 | 初期実装・第一回follow-up | 完了履歴 | 各Task参照 |
| 19〜22 | 第二回確認前の暫定案 | 置換済み・実装禁止 | - |
| 23 | 経路アニメーション設定をアプリ内へ追加 | **完了（6935717）** | Task 18 |
| 24 | 軽量な複数経路cueへ置換 | **完了（b76be21）** | Task 23 |
| 25 | 独立地図をレスポンシブなworkspaceへ再設計 | **完了** | Task 24後推奨 |
| 26 | お品書き詳細を地図より前面に表示 | **完了** | Task 25 |
| 27 | 経路motion・地図workspaceの最終人間受入 | 未着手 | Task 23〜26 |

## 既存の外部確認残件

- 実GASで同一space再送が既存行更新になる明示証拠。
- GAS更新時に対象外の既存Sheet列が保持される明示証拠。

これらは今回のanimation/map workspace follow-upとは独立しており、Task 23〜27の実装範囲へ混ぜない。資格情報がないことを理由にTask 23〜26を止めない。

## 進行規則

- 一度に一Taskだけ実装・review・commitする。
- 各Taskはfocused REDを先に作る。
- Task 23〜24でOS Animator設定を変更する処理を作らない。
- Task 24はframeごとのroute再計算、SVG再生成、cue DOM再生成を禁止する。
- Task 25はcardをmap上へ戻したり水平一列stripへ戻したりしない。
- Task 26はcatalog viewerを二重実装しない。
- Task 27はheadless自動テストだけで完了判定しない。Motorola実機のAnimator=0とmap操作、実画面workspace/detailを人間が確認する。
- snapshotは人間visual確認なしに一括更新しない。
- 未完了WIPを破棄、resetして過去Taskから再出発しない。

## Task 23完了記録

- `system / always / off`の三値設定、local state永続化、`prefers-reduced-motion`連動を実装。
- 既存route motionの描画方式はTask 24まで維持。OS Animator設定の変更処理は追加していない。
- focused verification: route motion/settings/contract tests passed、`npm run check:webapp` passed、`npm run test:webapp` 118 files / 804 tests passed、`npm run build:webapp` passed。

## Task 24完了記録

- current routeのfull-path dash animationを廃止し、5個の白いcueを単一rAF controllerで更新する方式へ置換。
- gesture drag/pinch/慣性中はcue更新を停止し、`system/always/off`とdocument visibilityへ接続。
- focused verification: 5 files / 111 tests passed、`npm run check:webapp` passed、`npm run test:webapp` 119 files / 807 tests passed、`npm run build:webapp` passed。
- gesture開始前から動作中の経路がgesture終了後に自動resumeする回帰testを追加し、focused testで確認済み。
- targeted Playwrightは機能assertionを通過。map表示変更に伴う既存snapshot 2件は人間visual確認待ちで更新していない。

## Task 25完了記録

- 独立地図をfull-height workspaceへ再構成し、narrow/mediumは上下grid、wideは右catalog panelへ配置。
- カードをmap外の折り返しgridへ移し、横一列stripを廃止。画像は自然aspect ratioを基本にし、leader SVGはworkspace全体を基準に更新。
- narrow/medium/wideとbounded-cover判定を純粋なgeometry helperへ分離し、pan/zoom時は既存card DOMを再生成せずleader端点だけ更新。
- CSSのwide/medium切替をJSの`data-mode`へ統一し、panel geometry用custom propertyをworkspaceへ設定。920px/1024pxの実DOM geometry testをDesktop Chromeで追加。
- focused verification: workspace/view/aspect/catalog tests passed、`npm run check:webapp` passed、`npm run build:webapp` passed、対象E2Eの機能assertion passed。既存snapshot 1件は人間visual確認待ちで更新していない。

## Task 26完了記録

- 既存`DomCircleGalleryView.showPdfModal()`を再利用し、nearby mapから押下buttonをreturn focus先として渡すdetail layerを実装。
- `catalog detail > nearby map`のnamed layerをCSS custom propertyで固定し、detail表示中のEscapeはdetailだけを閉じ、次のEscapeでnearby mapを閉じる契約を追加。
- detail開閉後もnearby map、selected card、zoom stateを保持し、閉じた後は元の「お品書きを見る」buttonへfocusを返す。
- focused verification: circle/detail/dialog/view tests 11件 passed、対象E2E passed、`npm run check:webapp` passed、`npm run test:webapp` passed、`npm run build:webapp` passed。
