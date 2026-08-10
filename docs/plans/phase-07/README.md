# Phase 7: オフライン準備・イベント管理・ビジュアル再設計

## 目的

会場の不安定な通信へ備えてcatalog imageを事前保存できるようにし、event/dayのsource・data・GAS queue・offline状態を一つの管理画面から扱えるようにする。

## 構成方針

Catalog offline保存はService Worker + Cache Storageをbrowser infrastructureとして追加し、application/UIはport経由で扱う。管理UIはregistryに定義されたevent/dayを一覧modelへ投影し、既存Circle Data Source、Outbox、Local Data DeletionのUse Caseを再利用する。

使用技術はTypeScript、Lit、Service Worker、Cache Storage API、CSS、Vitest、Playwright Chromiumとする。

## 共通制約

- Phase 6.1完了後の最新remote `main`から開始する。
- full PWA化、install prompt、background sync、push notificationを追加しない。
- external catalog imageのopaque responseを許容し、bodyを読もうとしない。
- Phase 7ではcatalog URL文字列をcache identityとして扱い、同じURLのbody差し替えを自動検出する追加DBやmetadata管理を作らない。
- cache保存失敗をcircle dataやpurchase stateの失敗へ昇格させない。
- arbitrary event作成UIを追加しない。registry定義済みevent/dayだけを管理対象にする。
- GAS sourceはevent/dayあたり1 sheetの現行contractを維持する。
- pending GAS queueを別sourceへ黙って付け替えない。
- management一覧で完全GAS URLを常時露出させない。完全URLはeditor/detailでのみ扱う。
- offline status取得失敗を`0件保存済み`と同一視しない。
- 同じcatalog URLはevent/dayを跨いで共有できるため、削除cache cleanupは他event/dayからの残存参照を確認してから行う。
- main navigation画面へsource input/delete/outbox panelを縦積みしない。
- visual redesignは情報階層の整理を目的とし、装飾componentやshadowを増やすことを目的にしない。
- 44px touch target、keyboard focus、safe-area、200% zoom、reduced-motionを維持する。
- 実装手順は各Task文書を正本とし、特定のエージェント製品、sub-agent機能、実行モードを必須条件にしない。

---

## タスク順序

| Task | 内容 | 依存 |
|---|---|---|
| 1 | Service Worker + Cache Storageのcatalog offline基盤 | Phase 6.1完了 |
| 2 | event/day management overview modelと一覧UI | Task 1のoffline status port |
| 3 | 再読込・編集・offline準備・削除actionを一覧へ接続 | Task 1〜2 |
| 4 | main/managementのvisual hierarchyを再構成 | Task 2〜3の最終DOM契約 |
| 5 | offline/management/visualを最終検証 | Task 1〜4 |

Phase 7はPhase 6.1全体の完了後に開始する。Task 1が直接再利用するのはPhase 6.1 Task 2のindicatorだが、他のPhase 6.1変更を未完了のままPhase 7へ並行着手しない。

## Phase受入条件

詳細は`docs/specs/2026-08-10-phase-07-offline-event-management-and-visual-system-design.md`を正本とする。

- catalogをevent/day単位で事前保存できる。
- 保存進捗と失敗件数が分かる。
- network offlineでも保存済み画像がGallery/次のお品書きで表示される。
- event/day一覧でsource、件数、GAS queue、offline statusを確認でき、status取得失敗と0件保存済みを区別できる。
- 未設定dayを一覧から設定開始できる。
- 一覧から開く/再読込/offline準備/編集/削除へ到達できる。
- local deletion後のcatalog cache cleanupで、他event/dayから参照される共有URLを削除しない。
- mainから旧inline設定縦積みを除去し、管理画面へ分離する。
- `npm run verify`、`npm run test:e2e:ci`、public tree auditが成功する。
