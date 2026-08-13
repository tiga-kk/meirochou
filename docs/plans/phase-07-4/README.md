# Phase 7.4: 経路表示信頼性・周辺地図・優先度フィルター

## 目的

Phase 7.3の残件を閉じながら、優先度で巡回対象を限定できる経路案内と、任意地点を基準に近いサークルを確認できる独立地図モードを整備する。

Task 1〜9後の2026-08-13人間確認でPhase終了判定を失効し、Task 10〜17で修正した。Task 18の2026-08-14人間再確認でも3件が残ったため、Task 19〜21で追加修正し、Task 22で最終受入する。

## 正本

- 現在状態: `docs/status/progress.md`
- 初期設計: `docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md`
- follow-up設計: `docs/specs/2026-08-13-phase-07-4-human-acceptance-followups-design.md`
- 人間受入FAIL: `docs/reviews/phase-07-4-human-acceptance-failures.md`
- 自動/外部検証: `docs/reviews/phase-07-4-field-verification.md`

過去設計と最新の人間受入結果が競合する場合は、最新の人間受入結果とTask 19〜21を優先する。

## 共通制約

- 新しい地図・motion・state management・UI framework依存を追加しない。
- Dijkstra / ALNS / snapshot契約をUI都合で別実装へ置換しない。
- animationのための`setInterval`、毎frameのroute再計算、毎frameのSVG再生成を追加しない。
- `prefers-reduced-motion: reduce`を無視してanimationを強制しない。
- priorityはGallery・周辺地図・経路案内で同じ完全一致・複数選択規則を使う。
- 周辺距離はwalkable grid距離を使う。
- 周辺地図の検索基準地点はRoute Guidanceの現在地を変更しない。
- 390px、200% text zoom、keyboard focus、44px主要touch target、safe-areaを維持する。
- visual snapshotは人間確認なしに一括更新しない。

## タスク順序

| Task | 内容 | 状態/依存 |
|---|---|---|
| 1〜9 | 初期実装・検証 | 履歴上完了、Phase終了判定は失効 |
| 10 | 近接pin選択曖昧性の解消 | 完了 |
| 11 | candidate連続線・zoom連動線幅 | 完了 |
| 12 | current animation再診断 | 完了、Android実機FAIL継続 |
| 13 | 周辺filter/card action | 完了 |
| 14 | standalone map aspect ratio | 完了、Task 20でwide-map方針を補正 |
| 15 | 周辺card/leader配置 | 完了、Task 21でcard位置を変更 |
| 16 | 購入Undo現在地復元 | 完了 |
| 17 | viewport中心表示 | 完了 |
| 18 | 自動回帰 + 人間受入 | 人間受入FAIL |
| 19 | Android実機current animation診断・修正 | Task 18後 |
| 20 | 横長mapの初期表示拡大 | Task 18後 |
| 21 | 周辺cardを地図外へ移動 | Task 20後 |
| 22 | Android実機を含む最終人間受入 | Task 19〜21後 |

Task 18はFAILした検証履歴として保持し、修正をTask 19〜21へ分離する。Phase終了ゲートはTask 22へ移す。

## Task 19〜21の確定方針

Task 19では、Android実機で`prefers-reduced-motion`、production `CSSAnimation`の存在・進行、実際の可視性を順番に確認する。`reduce`が原因ならWeb側で強制せず、`no-preference`でも見えない場合だけproduction描画を修正する。

Task 20では横長mapの「初期状態で全体を必ずcontainする」条件を緩和する。aspect ratioは維持し、390px程度のphoneでは約280pxの地図高さを目安に、必要なら左右crop + panを許可する。通常route mapと独立「地図」画面へ同じ方針を適用する。

Task 21ではお品書きcardをmap viewport外の下部stripへ移す。leader lineは地図上anchorから外側cardまで維持し、pan/zoom/strip scroll時にcard DOMを再生成しない。

## Phase 7.4最終受入条件

- 近接pinを個別に選択できる。
- candidate routeは青い連続実線である。
- zoom時にroute線幅が通路を覆わない。
- Android Chromeを含む`no-preference`環境でcurrent moving cueとstart→goal方向を人間が視認できる。
- `reduce`ではmotionを抑制しつつ静的方向情報が残る。
- 横長mapが通常route/独立mapの双方で指操作しやすい大きさになる。
- 周辺cardがmapを覆わず、地図外stripで操作できる。
- leader lineでmap anchorと外側cardの対応を追える。
- priority / 件数 / hold / card action / Undo / 表示中心に回帰がない。
- `npm run verify`、`npm run test:e2e:ci`、public tree audit、`git diff --check`を確認する。
- Task 22の人間visual/interaction受入に合格する。

実GAS資格情報が利用できない外部事項だけは理由付き未確認として残せる。今回Android実機で既にFAILしたvisual/interaction項目は、desktop headlessのPASSだけを理由に未確認へ戻して終了してはならない。
