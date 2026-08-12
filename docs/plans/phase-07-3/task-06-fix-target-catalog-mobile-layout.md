# Phase 7.3 Task 6: 目的地カタログのモバイルレイアウト修正

## 目標

Phase 7.2で導入したportrait画像の横2列配置を狭いスマートフォンでは使わず、390px前後や200% zoomでもカタログと操作ボタンを読める一列表示へ戻す。

## レイアウト契約

- narrow mobileではportrait/landscapeに関係なく一列。
- portrait画像はviewportを占有しすぎない範囲で大きく表示し、目安として `55〜60vh` 程度までを上限候補にする。
- metadataとactionは画像の下へ置く。
- 横2列はtablet/desktop相当の幅だけで有効にする。breakpointは既存CSSと実機確認に合わせ、概ね640〜700px帯から選ぶ。
- 主要操作のtouch targetは44px相当を維持する。
- 200% zoomでもhorizontal overflowを発生させない。
- portrait/landscapeで別DOM treeを作らない。

Task 3でcandidate表示をfloating cardへ分離した前提で、main target detailにcandidate専用情報を再度混ぜない。

## 対象ファイル

**変更候補:**

- `apps/webapp/css/target.css`
- 構造変更が必要な場合のみ `apps/webapp/index.html`
- 構造変更が必要な場合のみ `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `tests/catalog-orientation.test.ts`
- `tests/e2e/navigation-mobile.spec.ts`
- `tests/e2e/webapp.spec.ts`

Task 7.2で作成済みのorientation判定は再利用し、breakpoint判定用の新しいJS状態を作らない。

## テスト方針

最初に次のREDを作る。

- 360px/390pxのportrait catalogで一列になる。
- 360px/390pxでhorizontal overflowがない。
- 200% zoom相当でも操作がviewport外へはみ出さない。
- 十分広いviewportでは既定のdesktop/tablet layoutへ移行できる。
- orientationごとにDOMが複製されない。

可能な範囲でcomputed style / bounding boxをassertし、snapshotだけに依存しない。visual snapshotはTask 8のheaded確認用の補助とする。

## やってはいけないこと

- 390px前後で横2列を強制しない。
- catalog画像を固定heightでcropしない。
- orientationごとに別HTMLを生成しない。
- mobile用の新しい画面stateを作らない。
- snapshot更新だけで回帰を隠さない。

## 完了条件

- narrow mobileと200% zoomで一列・無横スクロールになる。
- tablet/desktopの既存利用性を壊さない。
- catalog画像、metadata、購入/保留操作が同一DOMの自然な読み順を維持する。