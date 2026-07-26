# Phase 5B Task 1: Documentation Structure and C108 Input Inventory

**Status:** Completed
**Depends on:** Phase 5B entry gate  
**Commit candidate:** `docs: prepare phase 5b map integration`

## Goal

完了済み文書を内容変更なしでarchiveへ整理し、今後の正本を一意にする。続いて`/maps/C108/`の4地図を読み取り、後続Taskが使う正式なarea一覧と入力ファイル対応表を作る。

## User-visible result

このTaskではWebappの表示や動作を変えない。以後、ユーザーが「AGENTS.mdを読んで、Phase 5B Task Nを実装して」と指示するだけで対象文書を一意に特定できる。

## Required reads

- `AGENTS.md`
- `docs/README.md`
- `docs/reorganization-manifest.md`
- `docs/specs/2026-07-26-phase-05bc-real-map-routing-design.md`
- `docs/plans/phase-05b/README.md`
- 現在の`docs/`全ファイル一覧
- `.gitignore`
- `/maps/C108/`全ファイル一覧

## Required human input

- `/maps/C108/`へ4地図分の完成済み成果物が配置されていること。
- 各地図について、公開してよい完成済みSVG、points JSON、grid metadata、grid binaryを区別できること。

## Files allowed to change

- `AGENTS.md`
- `docs/**`
- `.gitignore`

## Files forbidden to change

- `apps/**`
- `tests/**`
- `scripts/**`
- `package.json`
- `package-lock.json`
- `/maps/**`の内容
- 公開asset

## Procedure

- [x] **Step 1: 作業状態を確認する**

```bash
git status --short --branch
git log -1 --oneline
find docs -type f -maxdepth 5 | sort
find maps/C108 -type f -maxdepth 3 | sort
```

Expected:

- Phase 5B branch上である。
- Task外の未コミット差分がない。
- `maps/C108`に4地図分の入力がある。

停止条件:

- 4地図を識別できない。
- 同じ地図に複数の候補ファイルがあり、完成版を判断できない。
- 元地図と公開可能なSVGを区別できない。

- [x] **Step 2: 完了済み文書を分類する**

既存`docs/`の各ファイルについて、次のいずれかを記録する。

```text
archive/phase-01
archive/phase-02
archive/phase-03
archive/phase-04
archive/phase-05a
architecture
status
plans
specs
reviews
```

Phase 1から5Aに固有の完了文書は本文を変更せず移動する。
現在も有効な横断契約だけを`docs/architecture/`へ残す。
分類結果を`docs/reorganization-manifest.md`の実施記録へ追記する。

- [x] **Step 3: 文書を移動する**

`git mv`を使い、内容を変更せずPhase別archiveへ移す。

```bash
git diff --no-ext-diff --word-diff=porcelain -- docs/archive
```

Expected:

- 移動した過去文書の本文差分がない。
- 現行文書のリンク先が新しい構成を指す。

- [x] **Step 4: AGENTSと索引を配置する**

承認済み候補の`AGENTS.md`、`docs/README.md`、`docs/status/progress.md`、`docs/plans/roadmap.md`、archive policy、共有設計を正式位置へ配置する。

`docs/README.md`の読む順序とPhase 5B Task表から、このTask文書へ到達できることを確認する。

- [x] **Step 5: C108入力一覧を生成する**

次の形式で`docs/plans/phase-05b/c108-input-inventory.md`を作る。

```markdown
# C108 Input Inventory

| order | areaId | displayName | privateSvg | privatePoints | privateGridMeta | privateGrid | publicDirectory |
|---:|---|---|---|---|---|---|---|
| 1 | ... | ... | maps/C108/... | maps/C108/... | maps/C108/... | maps/C108/... | apps/webapp/map-bundles/C108/<areaId>/ |
```

規則:

- `areaId`はASCII小文字、数字、ハイフンだけを使う。
- 4件すべて異なる。
- 表示名はユーザーが地図を識別できる既存名称を使う。
- private pathはrepo rootからの相対pathで記録する。
- public directoryは`apps/webapp/map-bundles/C108/<areaId>/`とする。
- 元地図、Python、中間画像を公開対象列へ記載しない。
- 日程ごとの複製pathを作らない。

- [x] **Step 6: 各入力の最低限の形式を検査する**

```bash
file maps/C108/**
python3 -m json.tool maps/C108/<points-file> >/dev/null
python3 -m json.tool maps/C108/<grid-meta-file> >/dev/null
```

4地図すべてについて確認する。

Expected:

- SVGはtext/XMLとして読める。
- pointsとgrid-metaはJSONとしてparseできる。
- grid.binは空ではない。

- [x] **Step 7: .gitignore境界を確認する**

`.gitignore`にroot `/maps/`が存在することを維持する。
不足している場合だけ、次を追加する。

```gitignore
/maps/
```

Python cacheやprivate map pipelineの新規規則は、このWebリポジトリへPython pipelineを追加しない方針のため追加しない。

- [x] **Step 8: 文書リンクを検査する**

```bash
grep -RInE --exclude='task-01-documentation-and-input-inventory.md' '未確定|要確認|仮置き' AGENTS.md docs/plans/phase-05b docs/specs docs/status docs/README.md
git diff --check
git status --short
```

Expected:

- 未解決placeholderがない。
- archive移動以外で過去文書本文を変更していない。
- C108 input inventoryが4行ある。

## Acceptance criteria

- `AGENTS.md`からPhase 5B Task 1を一意に解決できる。
- Phase 1から5Aの完了文書は内容変更なしでPhase別archiveへ移動している。
- 現行の正本とarchiveの優先順位が明記されている。
- 4つのareaId、表示名、private input path、public directoryが確定している。
- `/maps/`はGit管理外である。
- Webappコード、test、public assetを変更していない。

## Review checklist

- `git diff --summary`で文書移動がrenameとして認識されているか。
- `git diff --word-diff=porcelain`で過去文書本文が変わっていないか。
- areaIdに空白、日本語、underscore、大文字がないか。
- 4地図がday1/day2で共通利用される構成か。
- private inputに元地図やPythonを公開対象として含めていないか。
- Task 2以降の文書がinventoryを参照しているか。

## Completion record

実態を記録：

```text
Branch: feature/phase-05b-task-01
Base commit: b463cd6 Merge pull request #4 from tiga-kk/docs/phase-5bc-implementation-plan
Changed files:
- docs/architecture/* (current cross-phase contracts)
- docs/reorganization-manifest.md
- docs/plans/phase-05b/c108-input-inventory.md
- docs/plans/phase-05b/task-01-documentation-and-input-inventory.md
- docs/status/progress.md
- docs/archive/* (reorganized legacy docs without text modification)
Four area IDs:
- e456 (東456ホール)
- e7 (東7ホール)
- s12 (南12ホール)
- w12 (西12ホール)
Validation commands:
- file maps/C108/*/*
- python3 -m json.tool maps/C108/<area>/points.corrected.json
- python3 -m json.tool maps/C108/<area>/grid-meta.json
- grep -RInE --exclude='task-01-documentation-and-input-inventory.md' '未確定|要確認|仮置き' AGENTS.md docs/plans/phase-05b docs/specs docs/status docs/README.md
- git diff --check
- git status --short
Validation results:
- All 4 areas passed format check (SVG, JSON, bin).
- All 4 area IDs, display names, private inputs, and public directories registered in c108-input-inventory.md.
- Legacy docs reorganized into archive/ directory structure without text changes.
- Placeholder scan passed after excluding this command's own search expression.
- Current architecture links were checked against the reorganized document paths.
Known limitations: `npx biome check` remains non-zero because of pre-existing formatting/import-order issues in `scripts/verify-webapp-build.mjs` and three test files outside this Task's allowed changes.
Proposed commit message: docs: prepare phase 5b map integration
```
