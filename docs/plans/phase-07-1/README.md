# Phase 7.1: ナビゲーション・地図操作・管理画面UX改善

> **実装担当向け:** 各Taskは順番に実装する。各Task開始直前に最新の`origin/main`を取得して開始SHAを記録し、そのTaskのRED test → 最小実装 → focused verification → commitの順に進める。計画作成時のSHAを実装基準へ固定しない。

**目的:** Phase 7本番利用で確認されたroute flow、案内情報の重複、map pan、management遮蔽、操作を補助するmotion、managementの情報階層を、既存のDomain/Application責務と外部挙動を不要に広げず修正する。

**基本方針:** 既存実装を優先して再利用する。新しいmodule/component/interfaceは、既存所有者へ追加すると責務が不明瞭になる場合だけ導入する。特にpan physics、scroll lock、management detailは「新しい抽象を作ること」自体を完了条件にしない。

## 正本

設計:
`docs/specs/2026-08-11-phase-07-1-navigation-motion-and-management-ux-design.md`

現在状態:
`docs/status/progress.md`

## 共通制約

- 計画作成時に確認した`main`は`c812de4ae68bf720781c8a498a2664990d3546b0`だが、これは履歴上の参照点にすぎない。各Taskの実装基準は実装開始直前の最新`origin/main`とする。
- routing、ALNS、circle data source、offline cache、GAS outbox、local deletionの既存契約をPhase 7.1の都合で変更しない。
- MapLibre/Leaflet等の地図library、motion library、physics engine、追加UI frameworkを導入しない。
- route animationのためにJavaScriptの常駐timer、毎frameのroute再計算、Dijkstra/ALNS再実行、毎frameのSVG再生成を追加しない。
- map pointermove hot pathで`getBoundingClientRect()`等のlayout readを毎event実行しない。
- bounds内panへ常時抵抗を掛けない。既存の約32px rubber-band上限を、根拠なく別値へ変更しない。
- managementは別URL/routerへ分割しない。既存full-screen surfaceとapplication sessionを維持する。
- management open中は下層mainを見せず、background scroll/scroll chainingを止める。ただし現行`#settings-area`がすでに`position: fixed; inset: 0`かつopaqueであることを前提に、再現した不足だけを修正する。
- 非必須motionは操作理解・状態遷移の補助に限定し、`apps/webapp/css/motion.css`へ分離する。観測されていない箇所へ演出を増やさない。
- animationは原則`transform`/`opacity`またはSVG `stroke-dashoffset`を使い、重要情報をmotionだけで伝えない。
- `prefers-reduced-motion: reduce`では非必須motionを停止または縮小する。
- 44px touch target、keyboard focus、safe-area、200% zoomを維持する。
- snapshotは意図した差分だけを個別更新し、一括更新しない。
- Task単位のcommitでは、そのTaskで実際に変更したfileだけをstageする。
- 既存E2E helperが実UI操作を迂回する場合は、Phase 7.1の新しいlist/detailや候補選択の証明に流用しない。

## タスク順序

| Task | 内容 | 主な依存 |
|---|---|---|
| 1 | current route flowの実動検証と最小修正 | なし |
| 2 | navigation summaryの情報重複解消 | Task 1のroute表示契約 |
| 3 | map pan bounds・release velocity・inertia改善 | Task 1〜2と独立 |
| 4 | management surfaceの遮蔽とbackground scroll isolation | Task 3と独立 |
| 5 | 必要なmotion feedbackの分離実装 | Task 4のsurface構造 |
| 6 | management list-detail redesign | Task 4、Task 5のCSS分離方針 |
| 7 | Phase 7.1総合検証・snapshot・進捗確定 | Task 1〜6 |

Task 3はgesture regressionを他のvisual変更と混ぜないため単独reviewする。Task 5はGallery swipe hintとmanagementの短いtransitionに範囲を限定し、Task 6が変更するDOMへ過度に依存させない。Task 7は新機能実装を行わず、総合検証と文書上の完了確定を担当する。

## 重要な状態契約

### 通常案内と候補選択

- 通常案内中は、current target、start、current route distanceを地図上部summaryの正本とする。
- bottom sheetへ同じcurrent target/distanceを重複表示しない。
- map pinで別targetを選んだ「候補preview/loading/ready」状態では、上部summaryはcurrent routeを維持しつつ、候補spaceと候補distance/statusを候補操作領域で明示する。候補identityをDOM整理の副作用で消さない。
- comparison中だけ`route-change-*`でcurrent/candidateを並べる。

### management detail selectionとactive day

- rowのdetailを見るだけではmainのactive event/dayを変更しない。
- 一方、現行`BrowserApplication`では`再読込`、`オフライン準備`、`編集`、`削除`が対象refへ`eventDayTransition.execute(ref)`してから既存Use Caseを実行する。この既存action semanticsをPhase 7.1で独断変更しない。
- 「この日程を開く」は従来どおり対象dayへ切り替え、managementを閉じてmainへ戻る。
- 上記action semanticsを変えたい場合は別の製品仕様判断として扱う。

## Phase受入条件

- no-preference環境でcurrent route flowのcomputed dash offsetが実時間で変化し、実画面でも方向を認識できる。
- reduced motionではflow loopを止めてもsolid routeとS/Gで方向が分かる。
- 通常案内中のcurrent target/distanceが上下で重複しない。
- candidate preview時に候補spaceと候補distance/statusが文字で確認できる。
- C108各areaで必要なpan軸の両端へ到達できる。
- bounds内dragが1:1で追従し、release velocityが最後の1 eventだけへ依存せず、慣性が時間基準で収束する。
- bounds外dragは既存rubber-band契約を維持し、release後はboundsへ戻る。
- idle時にgesture RAFが残らない。
- management open中にmainが見えず、background scrollが動かない。
- Gallery初回hintが実際のswipe方向を短いmotionで示し、二回目以降は自動表示しない。
- managementの非必須motionは`motion.css`へ分離され、reduced motionへ対応する。
- mobile managementがevent/day一覧→detail、desktopが同じmodelの2-paneになる。
- event/day rowに5個のaction buttonを常設しない。
- detailを見るだけではactive dayを変えず、既存の開く/再読込/offline準備/編集/削除の本番接続を維持する。
- `npm run verify`
- `npm run test:e2e:ci`
- `node scripts/audit-public-tree.mjs`
- `git diff --check`

全体検証失敗がある場合は、Task開始SHAでも再現する既存失敗・環境失敗・今回の回帰を区別し、retry成功だけで無条件にGREEN扱いしない。
