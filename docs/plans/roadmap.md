# ComiPath Roadmap

## 現在の順序

```text
Phase 5A: Cloudflare Pages公開             完了
  ↓
Phase 5B: C108実地図bundle統合・検証       次
  ↓
Phase 5C: 状態・ナビゲーション・最適化     5B完了後
  ↓
Phase 5D: 広範な視覚調整                   将来
```

Phase 5BとPhase 5Cを同じbranchまたは同じPRへ混ぜない。
各Phaseは、Phase branch、Task別commit、Phaseにつき原則1本のDraft PRで進める。

## Phase 5B

### 目的

C108の4地図を、著作権上公開可能なSVG・points・grid成果物としてWebappへ統合し、
`day1`と`day2`から共通利用できる状態にする。

### 含む

- `/maps/C108/`に置かれた成果物の棚卸し
- 正式な`areaId`、表示名、公開ファイル名の確定
- public map bundleの配置
- C108 event registryとday1/day2の設定
- day共通map manifest
- SVG、points、grid-meta、gridのruntime/build検証
- ブラウザ上の座標・ピン・経路線の整合確認
- production registryをC108だけにする変更
- `demo-v1`を自動テスト・開発fixtureとして維持
- 実地図でのDijkstra距離計算ベンチマーク
- Phase 5Cへ渡す性能記録

### 含まない

- Python地図生成環境
- 元地図、OCR入力、中間画像
- 距離行列の永続実装
- TOPTW
- Web Worker最適化
- サークル状態・案内UIの再設計
- 外部情報連携
- 広範な見た目の再設計

## Phase 5C

### 目的

C108の各地図を独立して巡回できるようにし、任意始点、距離行列、TOPTW、
到着前後の操作、復帰、保留、対象外を一貫した状態モデルで提供する。

### 含む

- schema migration
- 排他的サークル状態
- ナビゲーション状態の分離
- 到着確認
- 到着前と到着後の保留
- 対象外
- 共通サークル詳細
- 未購入・全サークル一覧
- 任意始点
- 地図ごとの独立セッション
- 距離行列のWorker生成
- LocalStorage保存
- TOPTW TypeScript移植
- time-boxed anytime最適化
- warm start
- 進捗・残り時間・キャンセル
- 永続復帰スナップショット
- 保留一括復帰ダイアログ
- mobile E2E、accessibility、公開境界検証

### 含まない

- Python参照実装の追跡
- 地図間の移動コストや全地図一括最適化
- 自動現在地推定
- 外部情報provider連携
- server-side state
- multi-device merge
- Phase 5D相当の広範なvisual polish

## 共通gate

- Task文書にない外部挙動を実装しない。
- TaskごとにTDDとfocused verificationを行う。
- commit、push、PR、mergeは各承認境界を守る。
- 実地図、元地図、個人データ、外部本文、credentialをtest artifactへ含めない。
- Phaseのexit gateが完了するまで次Phaseを開始しない。
