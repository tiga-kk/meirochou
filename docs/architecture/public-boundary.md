# Public Repository Boundary

このリポジトリは公開候補のWebappだけを扱う。通常の開発・ビルド・テストでは `apps/webapp/map-bundles/demo-v1` の架空地図だけを使う。

## Repositoryに入れてはいけないもの

- Python、OCR入力・中間成果物、実地図、カタログ拡張、Pebbleアプリ。
- 個人用URL、スプレッドシートID、トークン、`.clasp.json`、個人設定。
- 旧Git履歴、リモート設定、実地図を自動検出する仕組み。

## 地図と配信物

- public bundle (`apps/webapp/map-bundles/*`) はすべてプロダクションビルドへコピーされ source と `dist` のバイト一致を検証する。UI選択肢は `apps/webapp/events/manifest.json` で分離管理する。
- private mapはリポジトリ外の絶対パスをprivateコマンドで明示指定する。通常コマンドはprivate mapを読まない。
- 画像、points、grid metadata、gridは同一原画像ピクセル座標系を共有する。ピンと経路は地図画像と同じtransform層へ置く。

詳細な対象・監査手順は [ロードマップ](../plans/roadmap.md) と、履歴として保存した [Phase 1記録](../archive/phase-01/phase-01-baseline.md) を参照する。
