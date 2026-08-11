# Phase 7.2: 実機UX修正・カタログ取込

## 目的

Phase 7.1統合後の実機確認で判明した経路表示、map操作、Gallery、目的地detailの残件を修正し、以前別セッションで設計したcatalog page→GASのChrome拡張を正式にリポジトリへ取り込む。

設計の正本は`docs/specs/2026-08-12-phase-07-2-field-followups-and-catalog-ingestion-design.md`とする。

## 開始基準

- 基準branch: `main`
- 基準commit: `a1393060d16868b7b14507590aa8df2c5d3f30aa`
- Phase 7.1はmainへmerge済みだが、field acceptance上はTask 1/2/3/5に残件があるため、Phase 7.2で再受入する。
- production実装はこのdocs branchでは行わない。

## 共通制約

- 既存のrouting/ALNS objectiveを変更しない。
- current routeとcandidate routeを同じ色・同じvisual stateにしない。
- route animationのためにper-frame route再計算やDOM再生成を追加しない。
- SVG sourceを画質問題の原因と決めつけてPNGへ置換しない。render pathを先に診断する。
- map pointermove hot pathでlayout readを増やさない。
- Gallery header「一覧」はglobal unvisitedを表示する。
- priority値を7〜10へ固定しない。
- extensionへGAS endpointや個人情報をhardcodeしない。
- catalog POSTは既存sale mutationと明示actionで分離する。
- GASのcopy用artifactは`integrations/gas-spreadsheet/Code.gs`を正本とし、手作業の二重コピーを作らない。
- management/offline cache/GAS sale syncの既存contractを維持する。
- 44px touch target、keyboard focus、safe-area、200% zoom、`prefers-reduced-motion`を維持する。
- visual snapshotは意図した変更だけ更新し、既存flakyを無条件でbaseline化しない。

## タスク順序

| Task | 内容 | 主な依存 |
|---|---|---|
| 1 | GASコードcopy UIとcatalog upsert API | 既存GAS build/test |
| 2 | catalog page用Chrome拡張をrepoへ追加 | Task 1のPOST contract |
| 3 | alternate targetの青candidate routeとpreview強調 | 既存route selection |
| 4 | current routeを知覚可能なStart→Goal animationへ修正 | Task 3と独立 |
| 5 | map画質原因を特定し、elastic overscrollを弱める | 既存gesture physics |
| 6 | global Gallery、dynamic priority、tutorial replay | 既存Gallery |
| 7 | target/catalog responsive layoutと情報重複解消 | Task 3/4の最終UI契約 |
| 8 | Phase 7.1/7.2 field acceptanceを最終監査 | Task 1〜7 |

## Phase受入条件

- 管理画面から現行GASコードをワンクリックでcopyできる。
- catalog extensionがspace selectorとcatalog image URLを取得し、指定sheetへ`upsertCatalog`できる。
- 別pin tap直後からcandidate routeが青線で見える。
- current routeはStart→Goal方向が実機で一目で分かるanimationになる。
- map SVGはauto-fit/zoom後も不必要にぼやけず、原因と対策がtest/documentへ残る。
- map overscrollは現行より弱く、release後は必ずboundsへ戻る。
- header「一覧」で全areaの未訪問catalogが見える。
- priority filterは実データから動的生成される。
- swipe tutorialは初回表示され、後から再生できる。
- 「次の目的地」情報は一箇所を正本とし、portrait/landscape catalogで読みやすいlayoutになる。
- `npm run verify`、関連Playwright、extension unit/fixture tests、`git diff --check`が成功する。

## 実装担当への注意

Task文書に書かれたテストがREDになることを確認してからproduction codeを変更する。既にPASSする場合は、field reportを再現できていない可能性があるため、assertionを弱めて先へ進めない。