# Phase 5B C108 Routing & Dijkstra Benchmark Report

**日付:** 2026-07-26
**対象イベント:** C108 (4エリア: `e456`, `e7`, `s12`, `w12`)
**計測環境:**
- Desktop Environment: Playwright Chromium (Linux x86_64, headless browser context)
- Mobile-equivalent Environment: Playwright Chromium with Pixel 5 emulation (headless browser context)
- 実行kernel: Viteが変換した既存`apps/webapp/js/route-planner.ts`の`buildDistanceMap`
- 各環境・各areaでwarmup 3回、計測10回、`performance.now()`を使用

---

## 1. エリア別計測結果サマリー

| areaId | 表示名 | グリッドサイズ | 歩行可能セル数 | サークル数 (N) | 1-Source Median (ms) | 1-Source p95 (ms) | 推定 N-Matrix Median (s) | 推定 N-Matrix p95 (s) | Float64 メモリ (MB) | JSON 推定サイズ (MB) | 未到達サークル数 |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| `e456` | 東456ホール | 512 × 180 (92,160) | 48,210 | 2,397 | 43.25 ms / 59.53 ms | 38.55 ms / 68.27 ms | 103.67 s / 142.69 s | 92.40 s / **163.66 s** | **43.84 MB** | **26.89 MB** | 0 / 0 |
| `e7` | 東7ホール | 231 × 248 (57,288) | 26,430 | 1,014 | 18.15 ms / 27.03 ms | 31.10 ms / 52.32 ms | 18.40 s / 27.41 s | 31.54 s / 53.06 s | 7.84 MB | 4.81 MB | 0 / 0 |
| `s12` | 南12ホール | 234 × 122 (28,548) | 14,890 | 900 | 18.50 ms / 19.86 ms | 19.75 ms / 26.59 ms | 16.65 s / 17.87 s | 17.78 s / 23.94 s | 6.18 MB | 3.71 MB | 0 / 0 |
| `w12` | 西12ホール | 363 × 271 (98,373) | 41,120 | 1,500 | 51.05 ms / 66.88 ms | 52.60 ms / 71.48 ms | **76.58 s / 100.32 s** | 78.90 s / 107.21 s | 17.17 MB | 10.53 MB | 0 / 0 |

`1-Source`と`N-Matrix`の各セルは`Desktop median / Desktop p95`、`Mobile median / Mobile p95`の順である。`Unreachable`は`Desktop / Mobile`である。`matrix distance count`は各areaで`N × N`（e456: 5,745,609、e7: 1,028,196、s12: 810,000、w12: 2,250,000）となる。

---

## 2. 性能分析と設計上の重要インサイト

### 2.1. 最遅エリアと全行列計算時間
- **Desktopの最遅エリア:** `w12` (西12ホール)
  - サークル数 $N = 1,500$、1-source Dijkstra中央値 $51.05\,\text{ms}$ (p95: $66.88\,\text{ms}$)
  - $N$-source距離行列生成の推定時間は**中央値 76.58秒、p95で100.32秒**を要する。
- **Mobile-equivalentの最大p95:** `e456` (東456ホール)の163.66秒。Pixel 5 emulationは実機測定ではないため、実端末性能の保証値として扱わない。

### 2.2. UIメインスレッド同期実行が不可である根拠
- 最遅エリア `w12` において全距離行列計算をメインスレッドで同期実行した場合、Desktop測定で**約77秒〜100秒**、Mobile-equivalent測定でも**約79秒〜107秒**の処理になる。Mobile-equivalentで最大の`e456`は**約92秒〜164秒**となる。
- したがって、Phase 5C で距離行列を生成する際は、必ず **Web Worker を使用したバックグラウンド処理**として分離して実行しなければならない。

### 2.3. Phase 5C での進捗表示（Progress）の単位
- 1-source Dijkstra計算1回ごとに、進捗率 $\frac{k}{N} \times 100\%$ ($k = 1 \dots N$) を算出可能である。
- Web Worker からメインスレッドへ $k$ 回完了ごとに進捗メッセージ（例: `100 / 2397`）をポストすることで、スムーズなプログレスバー表示が実現できる。

### 2.4. 初回開始をユーザー明示操作に限定する根拠
- マップ読み込み時に自動で全行列計算を開始した場合、モバイル端末や低スペック環境で急激な CPU 負荷上昇およびメモリ消費を引き起こす。
- したがって、全行列最適化計算の初回開始は**ユーザーによる明示的な操作ボタンのタップ**に限定すべきである。

### 2.5. データ永続化およびストレージ容量の制限
- 最大行列の`e456` ($2397 \times 2397 = 5,745,609$ 要素) のメモリサイズは Float64で **43.84 MB**、JSON文字列の推定値で約 **26.89 MB** に達する。JSON値長は実測した1-source距離の有限値・未到達値の比率から推定している。
- ブラウザの **LocalStorage** の一般的な容量制限（5 MB〜10 MB）を大幅に超過するため、LocalStorage に全距離行列を直接保存することは不可能である。
- Phase 5C では IndexedDB の使用、あるいは必要な範囲のみのオンデマンド計算・セッション単位のオンメモリ保持を検討する必要がある。
