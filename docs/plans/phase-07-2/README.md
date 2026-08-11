# Phase 7.2: 実機UX修正・カタログ取込

## 目的

Phase 7.1統合後の実機確認で判明した経路表示、地図操作、Gallery、目的地詳細の残件を修正し、カタログページからGASへお品書き画像URLを登録するChrome拡張を正式にリポジトリへ取り込む。

設計の正本は`docs/specs/2026-08-12-phase-07-2-field-followups-and-catalog-ingestion-design.md`とする。現在のフェーズ、次に着手するTask、完了状況は`docs/status/progress.md`だけを正本とし、このREADMEへ重複して固定しない。

## 開始基準

- 実装先の基準ブランチは`main`とする。
- 計画作成時に確認した`main`は`a1393060d16868b7b14507590aa8df2c5d3f30aa`だった。これは履歴参照用であり、各Taskの実装開始SHAとして固定しない。
- 各Taskは着手直前に最新remote `main`を取得し、その時点のHEADを開始基準として記録する。
- Phase 7.1は`main`へmerge済みだが、実機受入上は経路表示、情報階層、地図操作、操作説明に残件があるためPhase 7.2で再受入する。
- 本番コード、テスト、package、CIの変更はこの文書ブランチでは行わない。

## 共通制約

- 既存のrouting/ALNS objectiveを変更しない。
- current routeとcandidate routeを同じ色・同じ表示状態にしない。
- route animationのために毎frameのroute再計算やDOM再生成を追加しない。
- SVG sourceを画質問題の原因と決めつけてPNGへ置換しない。描画経路を先に診断する。
- map pointermoveの高頻度経路でlayout readを増やさない。
- Gallery header「一覧」は全エリアの未訪問を表示する。
- priority値を7〜10へ固定しない。
- extensionへGAS endpointや個人情報をhardcodeしない。
- catalog POSTは既存sale mutationと明示的な`action`で分離する。
- GASのコピー用artifactは`integrations/gas-spreadsheet/Code.gs`を正本とし、手作業の二重コピーを作らない。
- 候補目的地を表示している間、購入・保留操作が表示中の候補へ暗黙に切り替わらないようにする。
- management、offline cache、GAS sale syncの既存contractを維持する。
- 44px touch target、keyboard focus、safe-area、200% zoom、`prefers-reduced-motion`を維持する。
- visual snapshotは意図した変更だけ更新し、既存flakyを無条件でbaseline化しない。

## タスク順序

| Task | 内容 | 主な依存 |
|---|---|---|
| 1 | GASコードコピーUIとcatalog upsert API | 既存GAS build/test |
| 2 | catalog page用Chrome拡張をrepoへ追加し、検証をCIへ接続 | Task 1のPOST contract |
| 3 | 別目的地の青candidate route、preview強調、購入・保留guard | 既存route selection |
| 4 | current routeを知覚可能なStart→Goal animationへ修正 | Task 3と独立 |
| 5 | map画質原因を特定し、elastic overscrollを弱める | 既存gesture physics |
| 6 | global Gallery、dynamic priority、tutorial replay | 既存Gallery |
| 7 | target/catalog responsive layoutと情報重複解消 | Task 3/4の最終UI契約 |
| 8 | Phase 7.1/7.2の実機受入と回帰を最終確認 | Task 1〜7 |

Task 1→2、Task 3→7、Task 1〜7→8以外は、同じファイルを同時変更しない限り依存関係から並行可否を判断してよい。番号だけを理由に不要な待機を入れない。

## CI契約

Phase 7.2ではGASとChrome拡張が新しい本番成果物になるため、ローカルだけのテストで完了扱いにしない。

- Task 2完了時点で`npm run verify`がwebapp、GAS、Chrome拡張の自動検証をすべて含む状態にする。
- `.github/workflows/webapp-ci.yml`も`npm run verify`を実行し、その後に既存Playwright E2Eを実行する。
- docs-only変更ではCI設定を変更しない。上記はTask 2実装時の変更対象である。

## Phase受入条件

- 管理画面から現行GASコードをコピーできる。
- catalog extensionがspaceとcatalog image URLを取得し、指定sheetへ`upsertCatalog`できる。
- `upsertCatalog`と既存`sale`が同じ`doPost`入口で一度だけJSON解析され、既存sale挙動を壊さない。
- 別pin tap後、候補経路の計算が完了した時点からcandidate routeが青線で見える。
- 候補表示中に購入・保留が候補へ誤適用されない。
- current routeはStart→Goal方向が実機で認識できるanimationになる。
- map SVGはauto-fit/zoom後のぼやけ原因が再現可能な診断へ落ち、根拠なくasset形式を変更しない。
- map overscrollは現行より弱く、release後は必ずboundsへ戻る。
- header「一覧」で全areaの未訪問catalogが見える。
- priority filterは実データから動的生成され、priorityなしと数値`0`を混同しない。
- swipe tutorialは初回表示され、後から再生できる。
- 「次の目的地」情報は一箇所を正本とし、portrait/landscape catalogで読みやすいlayoutになる。
- `npm run verify`、関連Playwright、`git diff --check`が成功するか、失敗が今回の変更外であることを証拠付きで分類できる。

## 実装担当への注意

Task文書に書かれたテストが未実装の要求に対して意味のある失敗になることを確認してから本番コードを変更する。import失敗、fixture準備失敗、環境不足だけをRED証拠として扱わない。既にPASSする場合は、実機報告を再現できていない可能性があるためassertionを弱めて先へ進めない。