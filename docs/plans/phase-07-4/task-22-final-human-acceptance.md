# Phase 7.4 タスク22: 最終人間受入

## 目的

Task 19〜21の修正後、Android実機を含む実画面でPhase 7.4を再確認し、全項目に合格した場合だけ終了する。

## 前提

Task 19、20、21完了。

## 対象ファイル

- `docs/reviews/phase-07-4-field-verification.md`
- `docs/reviews/phase-07-4-human-acceptance-failures.md`
- `docs/status/progress.md`
- 人間確認済みのvisual snapshotだけ

## 確認手順

1. Task 19〜21のfocused testsを再実行する。
2. `npm run verify`、`npm run test:e2e:ci`、`node scripts/audit-public-tree.mjs`、`git diff --check`を実行する。
3. Android Chrome実機の`prefers-reduced-motion: no-preference`でcurrent route animationとstart→goal方向を人間が視認できることを確認する。
4. motion低減設定ではmoving cueが停止しても静的route/方向情報が残ることを確認する。
5. 横長mapが通常route mapと独立「地図」画面の双方で十分大きく、pan/zoomしやすいことを確認する。
6. 横長mapの左右crop部分へpanで到達でき、pin・route・表示中心がずれないことを確認する。
7. 独立「地図」でお品書きcardがmapを覆わず、外側cardへleader lineが追従することを確認する。
8. priority、件数、hold、card選択、お品書き表示、目的地変更を再確認する。
9. 近接pin、candidate青実線、zoom線幅、Undo、表示中心も回帰確認する。
10. 全項目に合格した場合だけprogressとfield verificationを終了状態へ更新する。

## 受入条件

- Task 18で残った3件がすべて解消している。
- Android実機でcurrent animationが見える。
- 横長mapの操作性が改善している。
- 周辺cardがmap外へ移動している。
- Task 10〜17に新しい回帰がない。
- 自動検証に新規FAILがない。

## 予定コミットメッセージ

```text
docs(phase-07-4): close final human acceptance
```
