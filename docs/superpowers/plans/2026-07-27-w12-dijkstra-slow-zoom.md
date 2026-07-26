# W12 Dijkstra Slow Playback and Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W12ダイクストラ可視化へ10〜30秒の低速再生と100〜300%の地図拡大を追加する。

**Architecture:** 再生時間は既存の選択肢を拡張する。ズーム値は純粋関数で100〜300%へ制限し、地図・Canvas・開始点を含む `map-stage` の幅へ反映する。拡大した地図は固定高のスクロール領域内で閲覧する。

**Tech Stack:** TypeScript、HTML、CSS、Canvas 2D、Vitest、Vite

## Global Constraints

- ダイクストラ法と重み付けは変更しない。
- ズームは100%から300%まで25%刻み。
- 追加する低速再生は10秒、20秒、30秒。
- 拡大時も地図、Canvas、開始点マーカーは同じ座標変換対象に置く。

---

### Task 1: Playback and zoom contracts

**Files:**
- Modify: `tests/w12-dijkstra-visualizer.test.ts`
- Create: `apps/webapp/js/demos/w12-dijkstra/view-controls.ts`

**Interfaces:**
- Produces: `normalizeZoomPercent(value: number): number`

- [ ] **Step 1: Write failing tests**

```ts
assert.equal(normalizeZoomPercent(50), 100);
assert.equal(normalizeZoomPercent(175), 175);
assert.equal(normalizeZoomPercent(400), 300);
assert.match(html, /value="10000"/);
assert.match(html, /value="20000"/);
assert.match(html, /value="30000"/);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run --root . tests/w12-dijkstra-visualizer.test.ts`
Expected: FAIL because `view-controls.ts` and the new playback options do not exist.

- [ ] **Step 3: Implement zoom normalization**

```ts
export function normalizeZoomPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(100, Math.min(300, Math.round(value / 25) * 25));
}
```

### Task 2: Interactive controls and scrolling map

**Files:**
- Modify: `apps/webapp/demos/w12-dijkstra/index.html`
- Modify: `apps/webapp/demos/w12-dijkstra/style.css`
- Modify: `apps/webapp/js/demos/w12-dijkstra/app.ts`

**Interfaces:**
- Consumes: `normalizeZoomPercent(value)` from Task 1.
- Produces: 10/20/30 second playback choices and a 100〜300% zoom slider.

- [ ] **Step 1: Add playback choices and zoom control markup**

Add `10000`, `20000`, and `30000` options. Add `#zoomRange` with `min="100"`, `max="300"`, `step="25"`, and `#zoomOutput`.

- [ ] **Step 2: Apply zoom to the shared map stage**

On `input`, normalize the slider value, set `mapStage.style.width` to the percentage, and update the output text.

- [ ] **Step 3: Make the map frame scrollable**

Give the frame a fixed viewport height and `overflow: auto`; keep the stage at a minimum width of 100% and remove the previous maximum-height restriction.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run --root . tests/w12-dijkstra-visualizer.test.ts`
Expected: PASS.

### Task 3: Documentation and full verification

**Files:**
- Modify: `apps/webapp/demos/w12-dijkstra/README.md`

- [ ] **Step 1: Document slow playback and zoom**

Describe the 10/20/30 second options, 100〜300% slider, and scroll behavior.

- [ ] **Step 2: Run full verification**

Run: `npm run verify:webapp`
Expected: all unit tests, type checking, build, and asset verification pass.

- [ ] **Step 3: Inspect the branch diff**

Run: `git diff --check main...HEAD`
Expected: no whitespace errors.
