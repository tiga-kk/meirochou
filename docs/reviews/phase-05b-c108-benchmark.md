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
| `e456` | 東456ホール | 512 × 180 (92,160) | 48,210 | 2,397 | 37.15 ms / 57.60 ms | 48.30 ms / 82.95 ms | 89.05 s / 138.07 s | 115.78 s / **198.83 s** | **43.84 MB** | **26.89 MB** | 0 / 0 |
| `e7` | 東7ホール | 231 × 248 (57,288) | 26,430 | 1,014 | 34.55 ms / 67.13 ms | 32.00 ms / 43.04 ms | 35.03 s / 68.07 s | 32.45 s / 43.64 s | 7.84 MB | 4.81 MB | 0 / 0 |
| `s12` | 南12ホール | 234 × 122 (28,548) | 14,890 | 900 | 16.25 ms / 19.79 ms | 9.55 ms / 13.23 ms | 14.63 s / 17.81 s | 8.60 s / 11.91 s | 6.18 MB | 3.71 MB | 0 / 0 |
| `w12` | 西12ホール | 363 × 271 (98,373) | 41,120 | 1,500 | 54.00 ms / 72.17 ms | 73.60 ms / 106.53 ms | **81.00 s / 108.26 s** | 110.40 s / 159.80 s | 17.17 MB | 10.53 MB | 0 / 0 |

`1-Source`と`N-Matrix`の各セルは`Desktop median / Desktop p95`、`Mobile median / Mobile p95`の順である。`Unreachable`は`Desktop / Mobile`である。`matrix distance count`は各areaで`N × N`（e456: 5,745,609、e7: 1,028,196、s12: 810,000、w12: 2,250,000）となる。

---

## 2. 性能分析と設計上の重要インサイト

### 2.1. 最遅エリアと全行列計算時間
- **Desktopの最遅エリア:** `w12` (西12ホール)
  - サークル数 $N = 1,500$、1-source Dijkstra中央値 $54.00\,\text{ms}$ (p95: $72.17\,\text{ms}$)
  - $N$-source距離行列生成の推定時間は**中央値 81.00秒、p95で108.26秒**を要する。
- **Mobile-equivalentの最大p95:** `e456` (東456ホール)の198.83秒。Pixel 5 emulationは実機測定ではないため、実端末性能の保証値として扱わない。

### 2.2. UIメインスレッド同期実行が不可である根拠
- 最遅エリア `w12` において全距離行列計算をメインスレッドで同期実行した場合、Desktop測定で**約81秒〜108秒**、Mobile-equivalent測定でも**約110秒〜160秒**の処理になる。Mobile-equivalentで最大の`e456`は**約116秒〜199秒**となる。
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
