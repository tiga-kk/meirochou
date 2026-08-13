# 実装進捗

更新日: 2026-08-14

この文書を現在フェーズ・現在Task・次Task・未完了外部確認の正本とする。各Taskの詳細は`docs/plans/phase-07-4/`とreview文書を参照する。

## 現在状態

- 現在フェーズ: **Phase 7.4（Task 18人間受入FAIL・follow-up中）**
- 現在Task: **Task 19: Android実機でcurrent route animationを診断・修正**
- 次に着手するTask: **Task 19**
- canonical plan: `docs/plans/phase-07-4/README.md`
- 人間受入FAIL: `docs/reviews/phase-07-4-human-acceptance-failures.md`
- 自動/外部検証: `docs/reviews/phase-07-4-field-verification.md`

Task 1〜17の実装履歴は保持する。Task 18の自動再検証では新規回帰を修正した後、`npm run test:e2e:ci`が60 passed / 7既存snapshot failed / 8 skippedとなった。その後の2026-08-14 Android実画面確認で3件が残ったため、Phase終了判定はFAILした。

## 未解決事項

| 問題 | 対応Task |
|---|---|
| Android Chrome実機でcurrent route animationが見えない。`prefers-reduced-motion`かproduction描画か未分離 | Task 19 |
| 通常route map / 独立「地図」で横長mapが小さく操作しづらい | Task 20 |
| 独立「地図」でお品書きcardがmapを覆う。leader line自体は良好 | Task 21 |

Task 19ではAndroid実機の`prefers-reduced-motion`、production `CSSAnimation`の存在・進行・可視性を順に確認する。`reduce`ならanimationを強制せず、`no-preference`でも再現する場合だけproduction描画を修正する。

Task 20では横長mapの全体containを絶対条件にせず、390px程度のphoneで約280pxの地図高さを目安にし、必要なら左右crop + panを許可する。通常route mapと独立mapへ同じ方針を適用する。

Task 21では周辺cardをmap外の下部stripへ移し、leader lineを地図上anchorから外側cardへ維持する。pan/zoom/strip scrollでcard DOMを再生成しない。

## Task状態

- Task 1〜17: 完了。Task 12はAndroid実機FAILをTask 19へ、Task 14はwide-map補正をTask 20へ、Task 15はcard外部配置をTask 21へ引き継ぐ。
- Task 18: **完了（人間受入FAIL）**。
- Task 19: 未着手。
- Task 20: 未着手。
- Task 21: 未着手。
- Task 22: 未着手。Task 19〜21後の最終人間受入。

## 外部確認残件

- 実GASの同一space更新・既存Sheet列保持。
- Phase 7.3からのmap drag体感遅延はphysical inputで再現できる場合のみ再調査する。

## 進行規則

- 一度に一Taskずつ実装・review・commitする。
- Task 19で`prefers-reduced-motion: reduce`を無視しない。
- Task 21でtransformごとのcard DOM再生成を再導入しない。
- Task 22はheadless自動検証だけで人間受入済みにしない。
- snapshotは人間visual確認なしに一括更新しない。
