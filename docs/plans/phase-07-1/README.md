# Phase 7.1: ナビゲーション・モーション・管理画面UX改善

> **実装担当向け:** 各Taskは独立したreview gateとして順番に実装する。各Task文書のRED test→最小実装→focused verification→commitの順序を崩さない。

**Goal:** Phase 7本番利用で判明したroute flow、情報重複、map pan、management遮蔽、motion不足、management layoutの問題を、既存business contractを維持したまま修正する。

**Architecture:** Domain/Application層は原則変更せず、route overlay、gesture utility、DOM/Lit UI、CSSを中心に改善する。pan physicsはpure moduleへ分離し、非必須motionは`motion.css`へ集約する。managementは既存full-screen surfaceを維持しながらmobile list-detail / desktop 2-paneへ整理する。

**Tech Stack:** TypeScript、既存JavaScript gesture utility、Lit、CSS/SVG animation、Vitest、Playwright Chromium。

## 正本

設計:
`docs/specs/2026-08-11-phase-07-1-navigation-motion-and-management-ux-design.md`

## Global Constraints

- 基準はremote `main`の`c812de4ae68bf720781c8a498a2664990d3546b0`以降。実装開始時にfresh `origin/main`を取得してbaseを再確認する。
- routing、ALNS、circle data source、offline cache、GAS outbox、local deletionのbusiness contractをPhase 7.1の都合で変更しない。
- MapLibre/Leaflet等の地図library、motion library、physics engine、UI frameworkを追加しない。
- route animationのためにJavaScript per-frame route再計算、Dijkstra/ALNS再実行、毎frame SVG再生成を追加しない。
- map pointermove hot pathで`getBoundingClientRect()`等のlayout readを毎event実行しない。
- bounds内panへ常時抵抗を掛けない。抵抗はbounds外dragだけに限定する。
- managementを別URL/routerへ分割しない。既存full-screen surfaceとapplication sessionを維持する。
- management open中は下層mainを完全に遮蔽し、background scroll/scroll chainingを止める。
- motionは操作理解、状態遷移、feedbackのためだけに追加し、装飾目的の常時loopを増やさない。
- 非必須motionは`apps/webapp/css/motion.css`へ集約し、個別削除しやすくする。
- animationは原則`transform`/`opacity`またはSVG `stroke-dashoffset`を使用し、毎frame layout/paint負荷を増やすpropertyを避ける。
- `prefers-reduced-motion: reduce`で非必須motionを停止またはfadeへ縮小する。重要情報をmotionだけで伝えない。
- 44px touch target、keyboard focus、safe-area、200% zoomを維持する。
- snapshotは意図した差分だけを個別更新し、一括updateしない。
- Task単位のcommitでは、そのTaskで実際に変更したfileだけをstageする。

---

## タスク順序

| Task | 内容 | 主な依存 |
|---|---|---|
| 1 | current route flow animationの実動検証と修正 | なし |
| 2 | navigation summaryの情報重複解消 | Task 1のroute表示contract |
| 3 | map pan physics・bounds・inertia再設計 | Task 1〜2と独立 |
| 4 | management surfaceの完全遮蔽とbackground scroll lock | Task 3と独立 |
| 5 | 分離可能なmotion experiment群 | Task 2・4の最終DOM |
| 6 | management list-detail redesign + Phase 7.1総合検証 | Task 4〜5 |

Task 3はgesture regressionを他のvisual変更と混ぜないため、Task 1〜2完了後に単独reviewする。Task 5のmotion experimentはTask 6のlayoutと分離可能なclass/CSSとして実装する。

## Phase受入条件

- no-preference環境でcurrent routeのflowがcomputed style上も視覚上も時間変化する。
- reduced motionではflow loopを止めてもsolid routeとS/Gで方向が分かる。
- 通常案内中の`次の目的地`と`距離`が上下で重複しない。
- C108 `e456/e7/s12/w12`でmap四辺へ到達できる。
- bounds内dragが1:1で追従し、release後は直近sampleから求めた速度で自然に慣性移動する。
- bounds外dragは最大約24pxのelastic overscrollだけを許し、release後は必ずboundsへ戻る。
- idle時にgesture RAFが残らない。
- management open中にmainが見えず、body/backgroundがscrollしない。
- Gallery初回hintが実際のswipe方向を短いmotionで示し、二回目以降は自動表示しない。
- experimental motionは`motion.css`中心に分離され、reduced motionへ対応する。
- mobile managementがevent/day一覧→detail、desktopが同じmodelの2-paneになる。
- event/day rowに5個のaction buttonを常設しない。
- 既存の開く/再読込/offline準備/編集/削除Use Case接続を維持する。
- `npm run verify`
- `npm run test:e2e:ci`
- `node scripts/audit-public-tree.mjs`
- `git diff --check`

上記が成功し、意図しないvisual snapshot差分が残らない。
