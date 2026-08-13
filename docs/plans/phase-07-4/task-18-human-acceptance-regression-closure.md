# Phase 7.4 タスク18: 人間受入と回帰検証でPhaseを再終了

## 目的

Task 10〜17を自動検証だけでなく実画面で確認し、2026-08-13の人間受入FAILがすべて解消したことを確認してからPhase 7.4を再終了する。

## 対象外

- FAILした機能をこのTask内で場当たり的に実装すること。FAIL時は原因に対応するTaskまたは追加Taskへ戻す。
- visual snapshotの無条件一括更新。
- 実GAS credentialのrepository保存。

## 前提と依存関係

Task 10〜17完了。

## 読むべき文書と既存実装

- `docs/reviews/phase-07-4-human-acceptance-failures.md`
- `docs/reviews/phase-07-4-field-verification.md`
- `docs/specs/2026-08-13-phase-07-4-human-acceptance-followups-design.md`
- Task 10〜17
- `package.json`
- `.github/workflows/webapp-ci.yml`

## 対象ファイル

### 作成または変更

- `docs/reviews/phase-07-4-field-verification.md`
- `docs/status/progress.md`
- 意図が人間確認できたvisual snapshotだけ

### 削除

なし。

## 実装手順

1. Task 10〜17のfocused testsを再実行する。
2. `npm run verify`、`npm run test:e2e:ci`、public tree audit、`git diff --check`を実行する。
3. C108で近接2pinを用意し、双方を狙って別々に選べることをheadedで確認する。
4. candidate routeを表示し、青線が連続して目的地まで見えることを確認する。
5. `prefers-reduced-motion: no-preference`でcurrent moving cueを人間が視認できることを確認する。`reduce`では停止することも確認する。
6. scale=1と高倍率を比較し、拡大時に赤/青線が細くなり通路を覆わないことを確認する。
7. 周辺地図でpriority、5/10/15/20、holdを実操作する。
8. 近接5件のお品書きカードが通常viewportで重ならず、card選択・前面化・お品書き表示・「目的地にする」が動くことを確認する。
9. leader lineを目視でanchorまで追えることを確認する。
10. 横長と縦長のmap bundleを開き、初期状態で地図全体がaspect ratioを保って見えることを確認する。
11. 通常購入とGallery購入でUndoし、現在地フォーム、status、route、GAS outboxが購入前契約へ戻ることを確認する。
12. 通常route mapとnearby mapをpan/zoomし、「表示中心: ...付近」が妥当な配置へ更新されることを確認する。
13. 実GAS環境が利用できる場合は、Phase 7.3から残る同一space更新・既存列保持も確認する。利用不能なら理由付き未確認として残す。
14. 人間確認に合格したvisual snapshotだけを個別更新する。
15. 結果をfield verificationへ追記し、progressを終了状態へ更新する。

## テスト方針

自動テストのPASS、headedでの機械的assertion、人間のvisual/interaction受入を別欄で記録する。どれかがFAILなら総合PASSにしない。

## 検証コマンド

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

## ユーザー判断が必要な事項

このTaskのvisual終了判定だけは、実画面を見た人間の確認が必要である。実装担当自身のheadless screenshot判定だけで「人間受入済み」と記録しない。

## 2026-08-14 人間受入結果

Task 18の人間確認は**FAIL**。Phase 7.4を終了しない。

残件は次の3件。

1. Android Chrome実機でcurrent route animationをまだ視認できない。`prefers-reduced-motion`等の端末設定原因かproduction描画原因か未分離。
2. 通常route mapと独立「地図」画面の双方で、横長mapの初期表示が小さく操作しづらい。
3. 独立「地図」画面のお品書きcardがmap上へ重なり、地図を隠す。leader line自体の視認性は良好。

修正はTask 18内で場当たり的に行わず、Task 19〜21へ分離する。修正後の最終人間受入はTask 22で行う。

## 受入条件

- `docs/reviews/phase-07-4-human-acceptance-failures.md`の10項目がすべて解消または明示的に再分類されている。
- 人間がcurrent animation、route線幅、card/leader、map aspect、center表示を受入済み。
- 自動回帰が通る。
- 外部GAS等の実施不能項目だけが理由付き未確認として残る。
- progressとfield verificationが同じ終了状態を示す。

2026-08-14の人間確認で上記条件を満たさなかったため、Task 18は「受入実施済み・FAIL」として履歴化し、Phase終了ゲートをTask 22へ移す。

## 予定コミットメッセージ

```text
docs(phase-07-4): record human acceptance failure
```
