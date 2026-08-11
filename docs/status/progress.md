# 進捗

更新日: 2026-08-12

## 現在の状態

- リポジトリ: `tiga-kk/meirochou`
- 本番ブランチ: `main`
- Phase 7.2計画作成時に確認した`main`: `a1393060d16868b7b14507590aa8df2c5d3f30aa`（履歴参照用。実装開始SHAとして固定しない）
- Phase 7.2計画文書ブランチ: `docs/phase-07-2-field-followup-plan`
- Phase 5D: 完了
- Phase 6: 完了・`main`へmerge済み
- Phase 6.1: 完了・`main`へmerge済み
- Phase 7: 完了・`main`へmerge済み
- Phase 7.1: 完了・`main`へmerge済み
- 現在のフェーズ: Phase 7.2 実装計画レビュー完了・本番実装未着手
- 次のTask: Phase 7.2 Task 1「GASコードコピーUIとcatalog upsert API」
- Phase 7.2の本番コード/テスト/package/CI変更: 未着手
- 未完了WIPコード: この計画ブランチ上にはなし

この文書を、現在のフェーズ、次Task、完了状況の正本とする。Task文書やPhase READMEへ同じ変動状態を重複して固定しない。

## Phase 7.2

Phase 7.1統合後の実機確認で残った経路表示、地図操作、Gallery、目的地詳細の問題を修正し、カタログページ用Chrome拡張とGAS catalog upsertを正式に追加する。

設計:
`docs/specs/2026-08-12-phase-07-2-field-followups-and-catalog-ingestion-design.md`

Phase計画:
`docs/plans/phase-07-2/README.md`

実装順:

1. Task 1: GASコードコピーUIとcatalog upsert API
2. Task 2: カタログページ用Chrome拡張とCI接続
3. Task 3: candidate route previewと購入・保留guard
4. Task 4: current routeのStart→Goal方向animation
5. Task 5: map画質診断とelastic overscroll調整
6. Task 6: global Gallery、dynamic priority、tutorial replay
7. Task 7: target/catalog adaptive layoutと情報重複解消
8. Task 8: Phase 7.1/7.2の実機受入と回帰検証

### Phase 7.2で固定した重要事項

- 各Taskの開始SHAは、着手直前の最新remote `main`から取得する。計画作成時SHAへ固定しない。
- 現行GAS `doPost(e)`はraw JSONを一度だけ解析し、解析済みrequest objectをhandlerへ渡す構造を維持する。
- `upsertCatalog`は明示`action`で既存`sale`と分離し、存在しないlegacy handlerや二重JSON parseを追加しない。
- Chrome extensionのcontent scriptはclassic scriptとして動作する構成にし、ES module構文を直接`content_scripts`へ読み込ませない。background service workerはmodule化してよい。
- Task 2完了時点で`npm run verify`がwebapp、GAS、extension testを含み、GitHub Actionsも`npm run verify`へ到達する。
- candidate routeは`ready`でも青線を表示するが、candidate選択だけでは購入・保留対象を切り替えない。UI disabledと`BrowserApplication.handleAction()`のdefensive guardの両方で証明する。
- current route direction cueはCSS/SVG中心とし、毎frameのroute再計算やDOM再生成を追加しない。
- map画質はSVG形式を原因と決めつけず、sourceとcompositor/render pathを診断する。persistent `will-change`除去の最小比較を先に行い、共有controllerの新APIは必要性が実証された場合だけ追加する。
- map overscroll 18pxはmap instanceだけへ適用し、PDF/Galleryの既存zoom挙動を変えない。
- header「一覧」は全areaのunvisitedを表示する。priority filterは実データから生成し、missing priorityと明示値`0`を混同しない。
- target detailは単一DOMを維持し、catalog orientationと狭幅/200% zoomへCSS layoutで適応する。
- Task 8で新機能を追加しない。失敗は今回の回帰、既存失敗、flaky、fixture/外部環境不足に分類し、既存失敗だけを理由に独立して確認できる項目まで止めない。

## Phase 7.1 完了記録

設計:
`docs/specs/2026-08-11-phase-07-1-navigation-motion-and-management-ux-design.md`

Phase計画:
`docs/plans/phase-07-1/README.md`

実装はTask 1〜7まで完了し、`main`へ統合済み。最終確認ではVitest 103 files / 700 tests、route guidance 38 tests、Phase 5D回帰4 tests、GAS 27 tests、CI相当E2E 55 passed / 8 skipped、architecture/typecheck/build/public audit/diff check成功を記録している。

Phase 7.2はPhase 7.1を未完了へ戻すものではない。Phase 7.1の実装後に実機で判明した受入不足を追加修正する。

## 既知の既存・環境要因

- C108 private smokeはfixture unavailableでskipになる環境がある。SKIPをPASSへ数えない。
- 過去のmap/management visual E2Eにはretryで成功したflaky履歴がある。Phase 7.2変更との因果を確認せずbaseline更新しない。
- `npx biome check .`はリポジトリ既存のlint/format/a11y指摘を含むため、Phase 7.2と無関係な広範自動整形を行わない。
- CI用環境の`npm ci`でaudit warningが出る場合がある。test failureとは区別する。

## 確定済みmap scale values

- `e456`: `0.06591796875 m/px`
- `e7`: `0.06493506493506493 m/px`
- `s12`: `0.07692307692307693 m/px`
- `w12`: `0.06198347107438017 m/px`

根拠と計算詳細はPhase 6.1文書・Git履歴を参照する。Phase 7.2ではscale値自体を変更しない。

## 実装開始時の確認

Phase 7.2本番実装は、Task着手時点の最新remote `main`から開始する。`docs/phase-07-2-field-followup-plan`へ本番コード、テスト、package、CI変更を追加しない。

各Task開始直前に最新remoteを取得し、Task文書で列挙したfile名、公開contract、test commandが現在コードと一致するか確認する。private implementationの安全な移動には追従してよいが、ユーザー向けcontractや既存Use Case semanticsが変わっている場合はTaskを勝手に読み替えず再評価する。

Task 1→2、Task 3→7、Task 1〜7→8の依存を優先し、番号だけを理由に不要な停止を入れない。同じファイルを変更する並行Taskは競合を避ける。

## 完了済みPhaseの参照

- Phase 7.1: `docs/specs/2026-08-11-phase-07-1-navigation-motion-and-management-ux-design.md`, `docs/plans/phase-07-1/`
- Phase 7: `docs/specs/2026-08-10-phase-07-offline-event-management-and-visual-system-design.md`, `docs/plans/phase-07/`
- Phase 6.1: `docs/specs/2026-08-10-phase-06-1-field-ux-followups-design.md`, `docs/plans/phase-06-1/`
- Phase 6: `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`, `docs/plans/phase-06/`
- Phase 5D: `docs/plans/phase-05d/`

過去の詳細なWIP/診断記録は各Phase文書とGit履歴を正本とし、このprogress文書には現在の実装判断に必要な状態だけを保持する。