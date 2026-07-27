# Phase 5C Task 9: Mobile E2E and Accessibility Verification

**Status:** Review修正・検証完了（mobile/keyboard E2E・accessibility。navigation runtime接続は未確認）
**Depends on:** Phase 5C Tasks 1-8  
**Commit candidate:** `test(e2e): cover mobile navigation lifecycle`

## Goal

fictional fixtureを使って主要navigation flowをmobile ChromiumでE2E検証し、keyboard、focus、dialog、進捗、200% text zoom、safe-areaを確認する。

## Required E2E cases

1. 始点tapから暫定target表示。
2. matrix progress中もlist/detail操作可能。
3. cancel後もcurrent route維持。
4. 到着→購入→次目的地。
5. 到着→後でまた来る→次目的地。
6. 到着前→この目的地を後回し。
7. 手動目的地変更。
8. excluded→全サークル→巡回対象へ戻す。
9. pending完了→保留一括復帰確認。
10. area切替→戻る→始点再設定。
11. reload→案内再開。
12. reload→始点再設定。
13. 巡回状態初期化でmatrix保持。
14. 日程削除でmatrix削除。
15. no unexpected external network。
16. console/page errorなし。

## Accessibility checks

- 主要buttonが44×44 CSS px以上。
- dialogがfocus trap、Escape close、focus returnを持つ。
- stateをcolorだけで示さない。
- progressの`aria-live`が過剰更新しない。
- 200% text zoomで主操作へ到達できる。
- portrait幅でhorizontal overflowがない。
- keyboardだけでlist/detailと始点代替選択を操作できる。
- current targetとarrival stateがaccessible nameで分かる。

## Procedure

- [x] navigation UIの基礎状態を既存のfictional E2E fixtureとTask 9 specで検証する。
- [ ] Workerはtest modeで決定的な進捗を返すfixtureを使うが、production code pathを迂回しない（現行AppのE2E経路では未接続）。
- [x] Pixel 5相当projectでREDを確認する。

```bash
npx playwright test tests/e2e/navigation-mobile.spec.ts --project=mobile-chromium
```

- [x] 必要なARIA、focus、layout修正を最小限行う。
- [x] desktop keyboard E2Eを追加する。
- [x] 200% zoom testを追加する。
- [x] same-origin以外の通信を遮断・記録し、既存のicon/widget URL以外を検出する。
- [x] screenshot/traceへraw private dataが出ないfixtureを使う。
- [x] GREENを確認する。

```bash
npx playwright test tests/e2e/navigation-mobile.spec.ts --project=mobile-chromium
npx playwright test tests/e2e/navigation-keyboard.spec.ts --project=chromium
npm run test:e2e
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## Acceptance criteria

- 16 flowをE2Eで確認する。
- mobile UIが計算中も操作できる。
- 主要tap targetが44px以上。
- dialog focus挙動が正しい。
- 200% zoomとportraitで主操作を失わない。
- external network requestがない。
- 実地図をE2E fixtureへコピーしていない。

## 実績と未確認事項

- `navigation-mobile.spec.ts`で、Pixel 5相当の可視button 44px、portrait overflow、same-origin外部通信、console/page errorを検証した。
- `navigation-keyboard.spec.ts`をdesktop Chromium projectへ登録し、focus ring、設定画面のEnter/Escape、focus returnを検証した。
- 200% text zoomで主操作が可視であることと横スクロールが発生しないことを検証した。
- map pinは4pxの視認性を保ったまま44pxのhit areaへ拡張し、主要操作buttonとmodal操作buttonのtouch targetを修正した。
- 既存のmobile visual snapshotをUI変更に合わせて更新した。全Playwright実行は34 passed、8 skipped。
- `NavigationSnapshotRepository`を実際のApp reload/resume dialogへ接続する処理、route geometry再構築、warm-startのE2E接続は、この差分では確認できない。Task 10のPhase exit gateで未接続のままならBLOCKERとして扱う。
