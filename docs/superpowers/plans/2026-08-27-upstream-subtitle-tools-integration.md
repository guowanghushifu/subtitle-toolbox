# Upstream Subtitle Tools Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild this fork's option-rich subtitle preprocessor and standalone bilingual subtitle composer on the latest upstream subtitle-translator UI while keeping all fork-owned code behind one integration seam.

**Architecture:** Start an isolated branch at upstream commit `b4a8e73`, add a self-contained `src/features/subtitle-tools` feature directory, and modify only the upstream route client to mount that workspace around the unchanged translator. Pure local parsing, preprocessing, and composition modules are developed first with Node tests; the React surfaces then reuse upstream visual primitives without importing the upstream translation engine.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, Ant Design 6, next-intl, Node test runner with tsx, Yarn 1.

**Spec:** `docs/superpowers/specs/2026-08-27-upstream-subtitle-tools-integration-design.md`

## Global Constraints

- Use `upstream/main` commit `b4a8e73` as the implementation baseline unless the user explicitly approves a newer upstream commit.
- Preserve the option-rich behavior committed on fork `main`; do not use the simplified preprocessing implementation reachable through `stash@{0}`.
- Do not apply, pop, drop, or rewrite the existing stash.
- Keep all fork-owned feature code under `src/features/subtitle-tools/`.
- Do not import `src/app/lib/translation`, `src/app/[locale]/subtitleCues.ts`, or `SubtitleTranslator` from the feature directory.
- Keep `SubtitleTranslator`, `ApiSettingsDrawer`, the translation hooks, the translation engine, `TOOL_REGISTRY`, and upstream locale catalogs unchanged.
- Modify `src/app/[locale]/client.tsx` as the single integration seam.
- Use Chinese copy for `zh` and `zh-hant`, English for `en`, and English fallback for every other locale.
- Do not port the preprocessing version/build-time display or its `next.config.ts` environment variables.
- Keep processing browser-local; do not add API routes.
- Preserve every existing localStorage key listed in the spec.
- Do not copy the large Project Hail Mary subtitle fixtures from the stash; tests use short inline fixtures.

## Execution Preflight

Before Task 1, use `superpowers:using-git-worktrees` to create an isolated worktree and branch named `feature/upstream-subtitle-tools` at `upstream/main`. Verify that `git rev-parse HEAD` prints `b4a8e73d12563a9858f153298bcbfcca29db8ae4`. Bring the approved spec and this plan into that branch using their documentation commits from the original worktree; do not merge the original `main` branch.

At implementation time, use `superpowers:test-driven-development` for Tasks 1–4, `frontend-design` for Tasks 5–7, and `superpowers:verification-before-completion` for Task 8.

## File Map

**Create**

- `src/features/subtitle-tools/lib/subtitleTypes.ts` — all feature-owned formats, cue models, result types, and option types.
- `src/features/subtitle-tools/lib/subtitleParsing.ts` — local format detection, timed-cue parsing, time conversion, and shared normalization.
- `src/features/subtitle-tools/lib/preprocessSubtitle.ts` — option-rich SRT/VTT/ASS/LRC preprocessing pipeline.
- `src/features/subtitle-tools/lib/composeBilingualSubtitle.ts` — independent cue matching plus SRT/ASS output builders.
- `src/features/subtitle-tools/lib/assTemplates.ts` — default HDR/SDR templates and ASS event-header normalization.
- `src/features/subtitle-tools/copy.ts` — typed Chinese/English feature copy and locale fallback.
- `src/features/subtitle-tools/hooks/useSubtitleFileInput.ts` — local single-file reading state with stale-read protection.
- `src/features/subtitle-tools/SubtitleToolsWorkspace.tsx` — three-mode switch and persistent mounted panels.
- `src/features/subtitle-tools/SubtitlePreprocessor.tsx` — preprocessing UI.
- `src/features/subtitle-tools/SubtitleBilingualComposer.tsx` — standalone composition UI.
- `src/features/subtitle-tools/AssTemplateDrawer.tsx` — saved HDR/SDR template editor.
- `tests/subtitle-tools/subtitleParsing.test.ts` — local parser tests.
- `tests/subtitle-tools/preprocessSubtitle.test.ts` — preprocessing regression tests.
- `tests/subtitle-tools/composeBilingualSubtitle.test.ts` — alignment and output tests.
- `tests/subtitle-tools/copy.test.ts` — locale fallback and critical copy tests.

**Modify**

- `package.json` — add a focused `test:subtitle-tools` command using the already-installed `tsx` package.
- `src/app/[locale]/client.tsx` — mount `SubtitleToolsWorkspace` around the unchanged translator node.

---

### Task 1: Independent Subtitle Model and Parser

**Files:**

- Create: `src/features/subtitle-tools/lib/subtitleTypes.ts`
- Create: `src/features/subtitle-tools/lib/subtitleParsing.ts`
- Create: `tests/subtitle-tools/subtitleParsing.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: `SubtitleFileType`, `TimelineCue`, `ParsedTimelineSubtitle`, `detectSubtitleFormat(text)`, `parseTimelineSubtitle(text)`, `formatMsToSrt(ms)`, `formatMsToAss(ms)`, and `normalizeCueText(text)`.
- Consumes: only generic `normalizeNewlines` from `@/app/utils`; it consumes no upstream translation types.

- [ ] **Step 1: Add the focused test command and failing parser tests**

Add this script to `package.json`:

```json
"test:subtitle-tools": "node --import tsx --test tests/subtitle-tools/*.test.ts"
```

Create `tests/subtitle-tools/subtitleParsing.test.ts` with direct relative imports so the test does not depend on the `@` alias:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSubtitleFormat,
  formatMsToAss,
  formatMsToSrt,
  parseTimelineSubtitle,
} from "../../src/features/subtitle-tools/lib/subtitleParsing";

test("detects supported local subtitle formats", () => {
  assert.equal(detectSubtitleFormat("1\n00:00:01,000 --> 00:00:02,000\nHi"), "srt");
  assert.equal(detectSubtitleFormat("WEBVTT\n\n00:01.000 --> 00:02.000\nHi"), "vtt");
  assert.equal(detectSubtitleFormat("[Script Info]\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi"), "ass");
  assert.equal(detectSubtitleFormat("[00:01.00]Hi"), "lrc");
  assert.equal(detectSubtitleFormat("plain text"), null);
});

test("parses timed SRT, VTT, and ASS cues without formatting tags", () => {
  const srt = parseTimelineSubtitle("1\n00:00:01,000 --> 00:00:02,250\n<i>Hello</i>\nworld");
  assert.equal(srt?.fileType, "srt");
  assert.deepEqual(srt?.cues, [{ startMs: 1000, endMs: 2250, text: "Hello world" }]);

  const vtt = parseTimelineSubtitle("WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<c.blue>Hello</c>");
  assert.deepEqual(vtt?.cues, [{ startMs: 1000, endMs: 2000, text: "Hello" }]);

  const ass = parseTimelineSubtitle("[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:02.50,Default,,0,0,0,,{\\i1}Hello\\Nworld");
  assert.deepEqual(ass?.cues, [{ startMs: 1200, endMs: 2500, text: "Hello world" }]);
});

test("formats millisecond values for SRT and ASS", () => {
  assert.equal(formatMsToSrt(3723456), "01:02:03,456");
  assert.equal(formatMsToAss(3723456), "1:02:03.45");
});

test("does not treat LRC as an end-timed composition format", () => {
  assert.equal(parseTimelineSubtitle("[00:01.00]Hello"), null);
});
```

- [ ] **Step 2: Run the parser tests and confirm the expected failure**

Run:

```bash
yarn test:subtitle-tools
```

Expected: FAIL because `subtitleParsing.ts` does not exist.

- [ ] **Step 3: Define local types**

Create `src/features/subtitle-tools/lib/subtitleTypes.ts`:

```ts
export type SubtitleFileType = "ass" | "vtt" | "srt" | "lrc";
export type TimedSubtitleFileType = Exclude<SubtitleFileType, "lrc">;

export interface TimelineCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ParsedTimelineSubtitle {
  fileType: TimedSubtitleFileType;
  cues: TimelineCue[];
}

export interface SubtitlePreprocessOptions {
  removeRoundBracketSdh: boolean;
  removeSquareBracketSdh: boolean;
  removeCornerBracketSdh: boolean;
  removeBracketedSdhWithoutKeywordCheck: boolean;
  removeHesitationEllipses: boolean;
  removeInlineFormattingTags: boolean;
  removeSpeakerLabels: boolean;
  removeUppercaseSdh: boolean;
  removeRepeatedQuoteMarks: boolean;
  mergeSameTimestamps: boolean;
  mergeLinesWithinCue: boolean;
}

export type SubtitlePreprocessLogType =
  | "round_bracket_sdh"
  | "square_bracket_sdh"
  | "corner_bracket_sdh"
  | "uppercase_sdh"
  | "speaker_label";

export interface SubtitlePreprocessLogEntry {
  type: SubtitlePreprocessLogType;
  key: string;
  text: string;
}

export interface SubtitlePreprocessResult {
  content: string;
  fileType: SubtitleFileType;
  stats: {
    originalCueCount: number;
    outputCueCount: number;
    removedCueCount: number;
    mergedCueCount: number;
  };
  logs: SubtitlePreprocessLogEntry[];
}

export interface BilingualComposeLogEntry {
  type: "translated_unmatched" | "original_unmatched";
  startMs: number;
  endMs: number;
  text: string;
}

export interface BilingualComposeOptions {
  outputFormat: "srt" | "ass";
  assTemplate?: string;
  overlapThresholdMs?: number;
}

export interface BilingualComposeResult {
  content: string;
  logs: BilingualComposeLogEntry[];
  matchedCount: number;
  translatedOnlyCount: number;
  originalOnlyCount: number;
  outputCueCount: number;
}
```

- [ ] **Step 4: Implement the self-contained timed parser**

Create `src/features/subtitle-tools/lib/subtitleParsing.ts`. Port only format detection and timed parsing behavior from the current fork and use these public signatures:

```ts
import { normalizeNewlines } from "@/app/utils";
import type {
  ParsedTimelineSubtitle,
  SubtitleFileType,
  TimelineCue,
} from "./subtitleTypes";

const VTT_SRT_TIMELINE = /^((?:\d+:)?\d{2}:\d{2}[,.]\d{1,3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[,.]\d{1,3})/;
const LRC_TIME_TAG = /^\[\d{2}:\d{2}(?:\.\d{2,3})?\]/;
const ASS_TAGS = /\{[^}]*\}/g;
const HTML_TAGS = /<[^>]+>/g;
const SRT_VTT_TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/;
const ASS_TIME = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,2})$/;

export const normalizeCueText = (text: string): string =>
  text
    .replace(ASS_TAGS, "")
    .replace(HTML_TAGS, "")
    .replace(/\\[Nn]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();

export const detectSubtitleFormat = (text: string): SubtitleFileType | null => {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split("\n");
  if (lines.some((line) => /^Dialogue:/i.test(line.trim())) && lines.some((line) => /^\[Events\]/i.test(line.trim()))) return "ass";
  if (/^WEBVTT(?:\s|$)/i.test(normalized.trimStart())) return "vtt";
  if (lines.some((line) => VTT_SRT_TIMELINE.test(line.trim()))) return "srt";
  if (lines.some((line) => LRC_TIME_TAG.test(line.trim()))) return "lrc";
  return null;
};

const parseSrtVttTimeToMs = (value: string): number | null => {
  const match = value.trim().match(SRT_VTT_TIME);
  if (!match) return null;
  const [, hours = "0", minutes, seconds, fraction] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000
    + Number(fraction.padEnd(3, "0").slice(0, 3));
};

const parseAssTimeToMs = (value: string): number | null => {
  const match = value.trim().match(ASS_TIME);
  if (!match) return null;
  const [, hours, minutes, seconds, centiseconds] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000
    + Number(centiseconds.padEnd(2, "0").slice(0, 2)) * 10;
};

const parseTimedBlocks = (text: string): TimelineCue[] =>
  text
    .split(/\n{2,}/)
    .filter((block) => !/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/i.test(block.trim()))
    .flatMap((block) => {
      const lines = block.split("\n");
      const timeIndex = lines.findIndex((line) => VTT_SRT_TIMELINE.test(line.trim()));
      if (timeIndex === -1) return [];
      const match = lines[timeIndex].trim().match(VTT_SRT_TIMELINE);
      if (!match) return [];
      const startMs = parseSrtVttTimeToMs(match[1]);
      const endMs = parseSrtVttTimeToMs(match[2]);
      const cueText = normalizeCueText(lines.slice(timeIndex + 1).join("\n"));
      if (startMs === null || endMs === null || !cueText) return [];
      return [{ startMs, endMs, text: cueText }];
    });

const parseAssDialogue = (text: string): TimelineCue[] => {
  let textFieldIndex = 9;
  const cues: TimelineCue[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (/^Format:/i.test(line)) {
      const fields = line.slice(line.indexOf(":") + 1).split(",").map((field) => field.trim().toLowerCase());
      const found = fields.indexOf("text");
      if (found !== -1) textFieldIndex = found;
      continue;
    }
    if (!/^Dialogue:/i.test(line)) continue;
    const fields = line.slice(line.indexOf(":") + 1).split(",");
    if (fields.length <= textFieldIndex) continue;
    const startMs = parseAssTimeToMs(fields[1] ?? "");
    const endMs = parseAssTimeToMs(fields[2] ?? "");
    const cueText = normalizeCueText(fields.slice(textFieldIndex).join(","));
    if (startMs === null || endMs === null || !cueText) continue;
    cues.push({ startMs, endMs, text: cueText });
  }
  return cues;
};

export const parseTimelineSubtitle = (text: string): ParsedTimelineSubtitle | null => {
  const fileType = detectSubtitleFormat(text);
  if (fileType === "srt" || fileType === "vtt") {
    return { fileType, cues: parseTimedBlocks(normalizeNewlines(text)) };
  }
  if (fileType === "ass") {
    return { fileType, cues: parseAssDialogue(normalizeNewlines(text)) };
  }
  return null;
};

export const formatMsToSrt = (ms: number): string => {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const milliseconds = safeMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
};

export const formatMsToAss = (ms: number): string => {
  const totalCentiseconds = Math.max(0, Math.round(ms / 10));
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
};
```

Use the existing fork implementation at `031f609:src/app/[locale]/local-subtitle-tools/localSubtitleUtils.ts` to confirm format edge cases; do not import an upstream translation module.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
yarn test:subtitle-tools
yarn tsc --noEmit
```

Expected: all parser tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the independent parser**

```bash
git add package.json src/features/subtitle-tools/lib/subtitleTypes.ts src/features/subtitle-tools/lib/subtitleParsing.ts tests/subtitle-tools/subtitleParsing.test.ts
git commit -m "feat: add independent subtitle parser"
```

---

### Task 2: Option-Rich Subtitle Preprocessing

**Files:**

- Create: `src/features/subtitle-tools/lib/preprocessSubtitle.ts`
- Create: `tests/subtitle-tools/preprocessSubtitle.test.ts`

**Interfaces:**

- Consumes: `SubtitlePreprocessOptions`, `SubtitlePreprocessResult`, and `detectSubtitleFormat(text)`.
- Produces: `DEFAULT_PREPROCESS_OPTIONS` and `preprocessSubtitleContent(text, options)`.

- [ ] **Step 1: Write failing preprocessing regression tests**

Create `tests/subtitle-tools/preprocessSubtitle.test.ts`. Import `preprocessSubtitleContent` and `DEFAULT_PREPROCESS_OPTIONS`, then port all assertions from the fork's committed `tests/preprocessSubtitleContent.test.mjs` at `031f609`. Convert them to TypeScript direct imports and keep these named cases explicit:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREPROCESS_OPTIONS,
  preprocessSubtitleContent,
} from "../../src/features/subtitle-tools/lib/preprocessSubtitle";

test("removes uppercase sound cues with punctuation", () => {
  const input = "1\n00:00:01,000 --> 00:00:02,000\nINDISTINCT RUSSIAN,\nLAUGHTER";
  const result = preprocessSubtitleContent(input, DEFAULT_PREPROCESS_OPTIONS);
  assert.ok(result);
  assert.equal(result.content, "");
  assert.equal(result.stats.removedCueCount, 1);
});

test("removes bracketed SDH split across cue lines", () => {
  const input = "1\n00:00:01,000 --> 00:00:02,000\n(grand orchestral fanfare\nplaying)";
  const result = preprocessSubtitleContent(input, DEFAULT_PREPROCESS_OPTIONS);
  assert.ok(result);
  assert.equal(result.content, "");
  assert.deepEqual(result.logs.map((entry) => entry.text), ["(grand orchestral fanfare playing)"]);
});

test("keeps bracketed dialogue when aggressive removal is disabled", () => {
  const input = "1\n00:00:01,000 --> 00:00:02,000\n(quietly considering) Hello";
  const result = preprocessSubtitleContent(input, {
    ...DEFAULT_PREPROCESS_OPTIONS,
    removeBracketedSdhWithoutKeywordCheck: false,
  });
  assert.ok(result);
  assert.match(result.content, /\(quietly considering\) Hello/);
});

test("removes repeated outer quotes but preserves contractions and decade forms", () => {
  const input = "1\n00:00:01,000 --> 00:00:02,000\n'Hello\n\n2\n00:00:02,000 --> 00:00:03,000\n'there.'\n\n3\n00:00:03,000 --> 00:00:04,000\nYou're into '90s music.";
  const result = preprocessSubtitleContent(input, DEFAULT_PREPROCESS_OPTIONS);
  assert.ok(result);
  assert.match(result.content, /Hello/);
  assert.match(result.content, /there\./);
  assert.match(result.content, /You're into '90s music/);
});
```

Also include explicit tests for round/square/corner brackets, orphaned colons,
speaker labels, standalone music markers, hesitation ellipses and comma fillers,
inline tags, identical timestamps, disabled options, VTT headers/meta blocks,
ASS dialogue reconstruction, LRC metadata preservation, and within-cue line
merging. Use the expected strings already committed in the fork test file; do
not reference stash-only fixtures.

- [ ] **Step 2: Run tests and confirm preprocessing imports fail**

Run:

```bash
yarn test:subtitle-tools
```

Expected: parser tests PASS; preprocessing test file FAILS because the module does not exist.

- [ ] **Step 3: Port the committed preprocessing behavior into its own module**

Create `src/features/subtitle-tools/lib/preprocessSubtitle.ts`. Port the preprocessing half of `031f609:src/app/[locale]/local-subtitle-tools/localSubtitleUtils.ts` through the existing `preprocessSubtitleContent` export. Replace the old imports with local types and parser detection:

```ts
import { normalizeNewlines } from "@/app/utils";
import { detectSubtitleFormat } from "./subtitleParsing";
import type {
  SubtitleFileType,
  SubtitlePreprocessLogEntry,
  SubtitlePreprocessOptions,
  SubtitlePreprocessResult,
} from "./subtitleTypes";

export const DEFAULT_PREPROCESS_OPTIONS: Readonly<SubtitlePreprocessOptions> = {
  removeRoundBracketSdh: true,
  removeSquareBracketSdh: true,
  removeCornerBracketSdh: true,
  removeBracketedSdhWithoutKeywordCheck: true,
  removeHesitationEllipses: true,
  removeInlineFormattingTags: true,
  removeSpeakerLabels: true,
  removeUppercaseSdh: true,
  removeRepeatedQuoteMarks: true,
  mergeSameTimestamps: true,
  mergeLinesWithinCue: true,
};

export const preprocessSubtitleContent = (
  text: string,
  options: SubtitlePreprocessOptions,
): SubtitlePreprocessResult | null => {
  const normalized = normalizeNewlines(text);
  const fileType = detectSubtitleFormat(normalized);
  if (!fileType) return null;
  if (fileType === "srt" || fileType === "vtt") return preprocessTimedCueBlocks(normalized, fileType, options);
  if (fileType === "ass") return preprocessAssContent(normalized, options);
  return preprocessLrcContent(normalized, options);
};
```

Keep all keyword tables, bracket regexes, quote-run handling, hesitation cleanup,
format-specific reconstruction, logging, and stats inside this file. Preserve
current `main` behavior exactly; do not use the simplified stash implementation.

- [ ] **Step 4: Run preprocessing tests and compare the full committed suite**

Run:

```bash
yarn test:subtitle-tools
```

Expected: parser and preprocessing tests PASS. The number of preprocessing test
cases must be at least 16, including all seven regressions in
`031f609:tests/preprocessSubtitleContent.test.mjs`.

- [ ] **Step 5: Run lint and type checking for the pure modules**

```bash
yarn eslint src/features/subtitle-tools/lib tests/subtitle-tools
yarn tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit preprocessing**

```bash
git add src/features/subtitle-tools/lib/preprocessSubtitle.ts tests/subtitle-tools/preprocessSubtitle.test.ts
git commit -m "feat: port subtitle preprocessing"
```

---

### Task 3: Standalone Bilingual Composition

**Files:**

- Create: `src/features/subtitle-tools/lib/assTemplates.ts`
- Create: `src/features/subtitle-tools/lib/composeBilingualSubtitle.ts`
- Create: `tests/subtitle-tools/composeBilingualSubtitle.test.ts`

**Interfaces:**

- Consumes: `parseTimelineSubtitle`, `formatMsToSrt`, `formatMsToAss`, `TimelineCue`, and `BilingualComposeOptions`.
- Produces: `bilingualAssHdrTemplate`, `bilingualAssSdrTemplate`, `ensureAssTemplateHasEvents(template)`, and `composeBilingualSubtitle(original, translated, options)`.

- [ ] **Step 1: Write failing alignment and output tests**

Create `tests/subtitle-tools/composeBilingualSubtitle.test.ts` with short inline fixtures:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { composeBilingualSubtitle } from "../../src/features/subtitle-tools/lib/composeBilingualSubtitle";
import { bilingualAssSdrTemplate } from "../../src/features/subtitle-tools/lib/assTemplates";

const srt = (start: string, end: string, text: string) => `1\n${start} --> ${end}\n${text}`;

test("matches an exactly aligned short cue below the absolute overlap threshold", () => {
  const result = composeBilingualSubtitle(
    srt("00:00:01,000", "00:00:01,200", "Hello?"),
    srt("00:00:01,000", "00:00:01,200", "你好？"),
    { outputFormat: "srt" },
  );
  assert.ok(result);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.translatedOnlyCount, 0);
  assert.equal(result.originalOnlyCount, 0);
  assert.match(result.content, /你好？\nHello\?/);
});

test("groups consecutive short original cues into one longer translated cue", () => {
  const original = "1\n00:00:01,000 --> 00:00:01,800\nOne\n\n2\n00:00:01,800 --> 00:00:03,000\nTwo";
  const translated = srt("00:00:01,000", "00:00:03,000", "一，二");
  const result = composeBilingualSubtitle(original, translated, { outputFormat: "srt" });
  assert.ok(result);
  assert.equal(result.matchedCount, 1);
  assert.match(result.content, /一，二\nOne Two/);
});

test("retains and logs unmatched cues", () => {
  const original = srt("00:00:01,000", "00:00:02,000", "Original only");
  const translated = srt("00:00:05,000", "00:00:06,000", "仅译文");
  const result = composeBilingualSubtitle(original, translated, { outputFormat: "srt" });
  assert.ok(result);
  assert.equal(result.translatedOnlyCount, 1);
  assert.equal(result.originalOnlyCount, 1);
  assert.deepEqual(result.logs.map((entry) => entry.type), ["translated_unmatched", "original_unmatched"]);
  assert.match(result.content, /仅译文/);
  assert.match(result.content, /Original only/);
});

test("builds ASS and repairs a missing Events section", () => {
  const result = composeBilingualSubtitle(
    srt("00:00:01,000", "00:00:02,000", "Hello"),
    srt("00:00:01,000", "00:00:02,000", "你好"),
    { outputFormat: "ass", assTemplate: bilingualAssSdrTemplate.replace(/\[Events\][\s\S]*$/, "") },
  );
  assert.ok(result);
  assert.match(result.content, /\[Events\]/);
  assert.match(result.content, /Dialogue: 0,0:00:01\.00,0:00:02\.00,Chs/);
  assert.match(result.content, /你好\\N\{\\rEng\}Hello/);
});
```

Add threshold-boundary, slight-offset, translated-one-to-many, original-one-to-many,
input format rejection, deterministic chronological ordering, and custom-template
preservation tests. Replace the current fixture-dependent Project Hail Mary test
with small inline cue groups that reproduce its many-to-one alignment pattern.

- [ ] **Step 2: Run tests and confirm the missing composition modules fail**

```bash
yarn test:subtitle-tools
```

Expected: existing parser/preprocessor tests PASS; composition tests FAIL on missing modules.

- [ ] **Step 3: Extract the two committed ASS templates**

Create `src/features/subtitle-tools/lib/assTemplates.ts` and copy the complete
`bilingualAssHdrTemplate` and `bilingualAssSdrTemplate` string values from
`031f609:src/app/[locale]/local-subtitle-tools/localSubtitleUtils.ts`.

Add the current non-destructive event normalization:

```ts
import { normalizeNewlines } from "@/app/utils";

const ASS_EVENTS_HEADER = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

export const ensureAssTemplateHasEvents = (template: string): string => {
  const normalized = normalizeNewlines(template).trim();
  if (!/\[Events\]/i.test(normalized)) return `${normalized}\n\n${ASS_EVENTS_HEADER}`;
  if (!/^Format:\s*Layer,\s*Start,\s*End,\s*Style,\s*Name,\s*MarginL,\s*MarginR,\s*MarginV,\s*Effect,\s*Text\s*$/im.test(normalized)) {
    return normalized.replace(/\[Events\]/i, ASS_EVENTS_HEADER);
  }
  return normalized;
};
```

- [ ] **Step 4: Port the current matching algorithm against the local parser**

Create `src/features/subtitle-tools/lib/composeBilingualSubtitle.ts`. Port the
composition constants and helpers from the current fork, but import all parsing
and time formatting locally:

```ts
import {
  formatMsToAss,
  formatMsToSrt,
  normalizeCueText,
  parseTimelineSubtitle,
} from "./subtitleParsing";
import { ensureAssTemplateHasEvents, bilingualAssSdrTemplate } from "./assTemplates";
import type {
  BilingualComposeOptions,
  BilingualComposeResult,
  TimelineCue,
} from "./subtitleTypes";

const COMPOSE_MIN_OVERLAP_MS = 400;
const COMPOSE_DURATION_TOLERANCE_MS = 600;
const COMPOSE_SHORT_CUE_COVERAGE_RATIO = 0.75;
const COMPOSE_LONG_CUE_COVERAGE_RATIO = 0.6;
const COMPOSE_SHORT_CUE_ALIGNMENT_TOLERANCE_MS = 50;
```

From `031f609:src/app/[locale]/local-subtitle-tools/localSubtitleUtils.ts`, copy
the implementation beginning at `calculateOverlapMs` through the end of
`composeBilingualSubtitle`. Make these mechanical changes only:

1. Delete the old private time parsers, formatters, and
   `parseTimelineSubtitle`; use the imports above.
2. Import `ensureAssTemplateHasEvents` from `assTemplates.ts` instead of keeping
   a second copy.
3. Use `bilingualAssSdrTemplate` when `options.assTemplate` is undefined.
4. Import all result, option, and cue types from `subtitleTypes.ts`.

Retain `calculateOverlapMs`, duration/coverage helpers, nearly-identical timing,
long-cue absorption, translated/original assignment maps, unmatched logs,
chronological sort, `buildSrtBilingualSubtitle`, and
`buildAssBilingualSubtitle` byte-for-byte apart from import/type renames. Do not
change thresholds or ordering.

- [ ] **Step 5: Run all pure tests, lint, and type checking**

```bash
yarn test:subtitle-tools
yarn eslint src/features/subtitle-tools/lib tests/subtitle-tools
yarn tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit bilingual composition**

```bash
git add src/features/subtitle-tools/lib/assTemplates.ts src/features/subtitle-tools/lib/composeBilingualSubtitle.ts tests/subtitle-tools/composeBilingualSubtitle.test.ts
git commit -m "feat: port bilingual subtitle composition"
```

---

### Task 4: Local Copy and File Input Boundary

**Files:**

- Create: `src/features/subtitle-tools/copy.ts`
- Create: `src/features/subtitle-tools/hooks/useSubtitleFileInput.ts`
- Create: `tests/subtitle-tools/copy.test.ts`

**Interfaces:**

- Produces: `getSubtitleToolsCopy(locale)` and `useSubtitleFileInput({ onError })`.
- Consumes: generic `decodeFileBytes`, `normalizeNewlines`, React state, and Ant Design `UploadFile` types.

- [ ] **Step 1: Write failing copy-selection tests**

Create `tests/subtitle-tools/copy.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getSubtitleToolsCopy } from "../../src/features/subtitle-tools/copy";

test("selects Chinese for both Chinese routes", () => {
  assert.equal(getSubtitleToolsCopy("zh").workspace.translate, "字幕翻译");
  assert.equal(getSubtitleToolsCopy("zh-hant").workspace.preprocess, "字幕预处理");
});

test("selects English and falls back to English", () => {
  assert.equal(getSubtitleToolsCopy("en").workspace.bilingual, "Bilingual Composer");
  assert.equal(getSubtitleToolsCopy("de").workspace.bilingual, "Bilingual Composer");
});

test("contains option-rich preprocessing and unmatched-log labels", () => {
  const copy = getSubtitleToolsCopy("en");
  assert.match(copy.preprocessor.removeBracketedSdhWithoutKeywordCheck, /without keyword/i);
  assert.equal(copy.composer.originalUnmatched, "Original unmatched");
});
```

- [ ] **Step 2: Run tests and confirm the missing copy module fails**

```bash
yarn test:subtitle-tools
```

Expected: pure feature tests PASS except `copy.test.ts`, which fails on the missing module.

- [ ] **Step 3: Add the typed Chinese/English dictionary**

Create `src/features/subtitle-tools/copy.ts` by copying the complete `zh` and
`en` objects from `PREPROCESSOR_TEXT` in
`031f609:src/app/[locale]/SubtitlePreprocessor.tsx` and `BILINGUAL_TEXT` in
`031f609:src/app/[locale]/SubtitleBilingualComposer.tsx`. Rename them
`PREPROCESSOR_COPY` and `COMPOSER_COPY`. Remove only these unused keys:

- `tabLabel` from both objects;
- `sendToTranslate` and `sentToTranslate` from preprocessing;
- `buildInfoTitle`, `versionLabel`, `buildTimeLabel`, and `unknownBuildTime`
  from preprocessing.

Add this exact workspace dictionary and selector:

```ts
const WORKSPACE_COPY = {
  zh: {
    modeLabel: "字幕工具模式",
    preprocess: "字幕预处理",
    translate: "字幕翻译",
    bilingual: "双语合成",
  },
  en: {
    modeLabel: "Subtitle tool mode",
    preprocess: "Subtitle Preprocessor",
    translate: "Subtitle Translation",
    bilingual: "Bilingual Composer",
  },
} as const;

export const getSubtitleToolsCopy = (locale: string) => {
  const language = locale === "zh" || locale === "zh-hant" ? "zh" : "en";
  return {
    workspace: WORKSPACE_COPY[language],
    preprocessor: PREPROCESSOR_COPY[language],
    composer: COMPOSER_COPY[language],
  };
};
```

Preserve the two parameterized summary functions from the source objects. Add
`as const` to all three dictionaries so missing language/key pairs fail during
component type checking.

- [ ] **Step 4: Add an isolated single-file input hook**

Create `src/features/subtitle-tools/hooks/useSubtitleFileInput.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { UploadFile } from "antd";
import { decodeFileBytes, normalizeNewlines } from "@/app/utils";

interface Options {
  onError: (error: unknown) => void;
}

export const useSubtitleFileInput = ({ onError }: Options) => {
  const [sourceText, setSourceText] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const readSequence = useRef(0);

  const reset = useCallback(() => {
    readSequence.current += 1;
    setSourceText("");
    setFileList([]);
    setFileName("");
    setIsReading(false);
  }, []);

  const selectFile = useCallback(async (file: File) => {
    const sequence = ++readSequence.current;
    setFileName(file.name);
    setFileList([{ uid: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, status: "done", originFileObj: file as never }]);
    setIsReading(true);
    try {
      const text = normalizeNewlines(await decodeFileBytes(await file.arrayBuffer()));
      if (sequence === readSequence.current) setSourceText(text);
    } catch (error) {
      if (sequence === readSequence.current) {
        setSourceText("");
        setFileList([]);
        setFileName("");
        onError(error);
      }
    } finally {
      if (sequence === readSequence.current) setIsReading(false);
    }
    return false;
  }, [onError]);

  return { sourceText, setSourceText, fileList, fileName, isReading, selectFile, reset };
};
```

Use `UploadFile`'s accepted `originFileObj` type instead of `never` if the exact
Ant Design type permits it. Keep the sequence guard and do not import
`useFileUpload`.

- [ ] **Step 5: Verify copy, lint, and types**

```bash
yarn test:subtitle-tools
yarn eslint src/features/subtitle-tools/copy.ts src/features/subtitle-tools/hooks tests/subtitle-tools/copy.test.ts
yarn tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the local boundary**

```bash
git add src/features/subtitle-tools/copy.ts src/features/subtitle-tools/hooks/useSubtitleFileInput.ts tests/subtitle-tools/copy.test.ts
git commit -m "feat: add local subtitle tool inputs and copy"
```

---

### Task 5: Upstream-Style Preprocessor UI

**Files:**

- Create: `src/features/subtitle-tools/SubtitlePreprocessor.tsx`

**Interfaces:**

- Consumes: local preprocessing/copy/input modules; upstream generic `SourceArea`, `ResultCard`, `PageCard`, `useTextStats`, `useLocalStorage`, and `useCopyToClipboard`.
- Produces: default React component `SubtitlePreprocessor` with no props.

- [ ] **Step 1: Add the client component shell with exact persisted keys**

Create `SubtitlePreprocessor.tsx` with `"use client"`, resolve copy using
`useLocale()`, and create these exact settings through `useLocalStorage`:

```ts
const [removeRoundBracketSdh, setRemoveRoundBracketSdh] = useLocalStorage("subtitlePreprocessRemoveRoundBracketSdh", true);
const [removeSquareBracketSdh, setRemoveSquareBracketSdh] = useLocalStorage("subtitlePreprocessRemoveSquareBracketSdh", true);
const [removeCornerBracketSdh, setRemoveCornerBracketSdh] = useLocalStorage("subtitlePreprocessRemoveCornerBracketSdh", true);
const [removeBracketedSdhWithoutKeywordCheck, setRemoveBracketedSdhWithoutKeywordCheck] = useLocalStorage("subtitlePreprocessRemoveBracketedSdhWithoutKeywordCheck", true);
const [removeHesitationEllipses, setRemoveHesitationEllipses] = useLocalStorage("subtitlePreprocessRemoveHesitationEllipses", true);
const [removeInlineFormattingTags, setRemoveInlineFormattingTags] = useLocalStorage("subtitlePreprocessRemoveInlineFormattingTags", true);
const [removeSpeakerLabels, setRemoveSpeakerLabels] = useLocalStorage("subtitlePreprocessRemoveSpeakerLabels", true);
const [removeUppercaseSdh, setRemoveUppercaseSdh] = useLocalStorage("subtitlePreprocessRemoveUppercaseSdh", true);
const [removeRepeatedQuoteMarks, setRemoveRepeatedQuoteMarks] = useLocalStorage("subtitlePreprocessRemoveRepeatedQuoteMarks", true);
const [mergeSameTimestamps, setMergeSameTimestamps] = useLocalStorage("subtitlePreprocessMergeSameTimestamps", true);
const [mergeLinesWithinCue, setMergeLinesWithinCue] = useLocalStorage("subtitlePreprocessMergeLinesWithinCue", true);
```

Add local result text, result format, summary, and log state. Use
`useSubtitleFileInput` with a memoized `onError` callback that surfaces
`getErrorMessage(error)` through `App.useApp().message`.

- [ ] **Step 2: Implement the process, reset, copy, and export handlers**

Build the option object explicitly and call `preprocessSubtitleContent`. On
unsupported format show the local unsupported message. On success set all
result fields, including logs when content is empty. Export with:

```ts
const buildProcessedFileName = (name: string, fileType: SubtitleFileType) => {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name || "subtitle";
  return `${base}_preprocessed.${fileType}`;
};
```

Reset must clear both file input and all result state.
Before selecting a replacement file, clear the old result. Wrap
`SourceArea.setSourceText` so manual edits also clear the previous result,
summary, and logs before updating the source text.

- [ ] **Step 3: Build the upstream-style responsive surface**

Use `Row gutter={[24, 24]}`, input `Col xs={24} lg={14} xl={15}`, and settings
`Col xs={24} lg={10} xl={9}`. Use `PageCard`, not raw shadow classes. The input
card contains a single-file `Upload.Dragger`, `SourceArea` with `dir="auto"`,
and a block primary process button. The settings card lists all eleven options
with hints, separated into cleanup and merging groups. Do not render version or
build time.

Render non-empty output in `ResultCard` with `stats`, editable `onChange`, copy,
and export. Render summary/logs in a separate `PageCard` even when every cue was
removed and output text is empty. Use Ant Design theme tokens for secondary
text; do not add `shadow-md`, hard-coded gray text, or custom global CSS.

- [ ] **Step 4: Run focused tests, lint, and type checking**

```bash
yarn test:subtitle-tools
yarn eslint src/features/subtitle-tools/SubtitlePreprocessor.tsx
yarn tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the preprocessor UI**

```bash
git add src/features/subtitle-tools/SubtitlePreprocessor.tsx
git commit -m "feat: add upstream-style subtitle preprocessor"
```

---

### Task 6: Upstream-Style Composer and ASS Template Drawer

**Files:**

- Create: `src/features/subtitle-tools/AssTemplateDrawer.tsx`
- Create: `src/features/subtitle-tools/SubtitleBilingualComposer.tsx`

**Interfaces:**

- `AssTemplateDrawer` consumes `{ open, onClose, mode, draft, onDraftChange, onSave, onReset }`.
- `SubtitleBilingualComposer` consumes local composition/copy/input modules and produces a no-prop default component.

- [ ] **Step 1: Implement the focused ASS template drawer**

Create `AssTemplateDrawer.tsx` using `Drawer`, `Input.TextArea`, and footer
buttons. Resolve `const copy = getSubtitleToolsCopy(useLocale()).composer`
inside the drawer and match the upstream drawer sizing pattern:

```tsx
<Drawer
  title={copy.templateEditor}
  open={open}
  onClose={onClose}
  size={isMobile ? "100vw" : "min(720px, 92vw)"}
  destroyOnHidden={false}
  extra={<Tag>{mode.toUpperCase()}</Tag>}
>
  <Typography.Paragraph type="secondary">{copy.templateHint}</Typography.Paragraph>
  <Input.TextArea value={draft} onChange={(event) => onDraftChange(event.target.value)} rows={22} />
  <Flex justify="end" gap="small" className="mt-4">
    <Button onClick={onReset}>{copy.resetTemplate}</Button>
    <Button type="primary" onClick={onSave}>{copy.saveTemplate}</Button>
  </Flex>
</Drawer>
```

Use the upstream `useIsMobile` hook only for responsive presentation. The
drawer contains no subtitle parsing logic.

- [ ] **Step 2: Add composer state and exact persistence keys**

In `SubtitleBilingualComposer.tsx`, create two independent
`useSubtitleFileInput` instances and these exact stored settings:

```ts
const [outputFormat, setOutputFormat] = useLocalStorage<"srt" | "ass">("subtitleBilingualOutputFormat", "srt");
const [assTemplateMode, setAssTemplateMode] = useLocalStorage<"hdr" | "sdr">("subtitleBilingualAssTemplateMode", "sdr");
const [savedHdrTemplate, setSavedHdrTemplate] = useLocalStorage("subtitleBilingualHdrTemplate", bilingualAssHdrTemplate);
const [savedSdrTemplate, setSavedSdrTemplate] = useLocalStorage("subtitleBilingualSdrTemplate", bilingualAssSdrTemplate);
```

Keep separate HDR/SDR drafts, drawer state, result, summary, logs, and translated
source filename. Saving writes only the active template; resetting restores and
persists only the active default.

- [ ] **Step 3: Implement compose and export handlers**

Validate that both inputs are non-empty, call the local
`composeBilingualSubtitle`, and set result plus unmatched logs. Build filenames
with the translated source basename and `_bilingual.srt` or `_bilingual.ass`.
Format each log line as:

```text
[Translated unmatched] 00:00:05,000 --> 00:00:06,000 cue text
```

Use the corresponding Chinese labels when the resolved copy is Chinese.
Clear the old composition result, summary, and logs whenever either file is
replaced, removed, reset, or manually edited.

- [ ] **Step 4: Build the responsive composition surface**

Render an introductory secondary paragraph, two `PageCard` input panels in
`Col xs={24} lg={12}`, and a full-width configuration `PageCard`. Each input
uses a single-file `Upload.Dragger`, `SourceArea`, and a reset action.

The configuration card contains:

- a block `Segmented` SRT/ASS selector;
- when ASS is active, an HDR/SDR `Segmented` selector and a button opening the
  template drawer;
- a right-aligned primary compose button.

Render the editable result in `ResultCard`; render the summary and unmatched
log in a flat `PageCard`. Use `textDirection="auto"` for subtitle text. Do not
copy the old shadow or hard-coded gray classes.

- [ ] **Step 5: Run tests, lint, and type checking**

```bash
yarn test:subtitle-tools
yarn eslint src/features/subtitle-tools/AssTemplateDrawer.tsx src/features/subtitle-tools/SubtitleBilingualComposer.tsx
yarn tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the composer UI**

```bash
git add src/features/subtitle-tools/AssTemplateDrawer.tsx src/features/subtitle-tools/SubtitleBilingualComposer.tsx
git commit -m "feat: add upstream-style bilingual composer"
```

---

### Task 7: Three-Mode Workspace and Single Upstream Integration Seam

**Files:**

- Create: `src/features/subtitle-tools/SubtitleToolsWorkspace.tsx`
- Modify: `src/app/[locale]/client.tsx`

**Interfaces:**

- `SubtitleToolsWorkspace` consumes `{ translationPanel: React.ReactNode }`.
- `client.tsx` continues to own `SubtitleTranslator`, `TranslationProvider`, `ToolPage`, and `ApiSettingsDrawer`.

- [ ] **Step 1: Create the persistent three-mode workspace**

Create `SubtitleToolsWorkspace.tsx`:

```tsx
"use client";

import { useId, useState, type ReactNode } from "react";
import { Segmented, theme } from "antd";
import { useLocale } from "next-intl";
import { getSubtitleToolsCopy } from "./copy";
import SubtitlePreprocessor from "./SubtitlePreprocessor";
import SubtitleBilingualComposer from "./SubtitleBilingualComposer";

type Mode = "preprocess" | "translate" | "bilingual";

export default function SubtitleToolsWorkspace({ translationPanel }: { translationPanel: ReactNode }) {
  const locale = useLocale();
  const copy = getSubtitleToolsCopy(locale);
  const [mode, setMode] = useState<Mode>("translate");
  const baseId = useId();
  const { token } = theme.useToken();
  const panels: Array<{ key: Mode; node: ReactNode }> = [
    { key: "preprocess", node: <SubtitlePreprocessor /> },
    { key: "translate", node: translationPanel },
    { key: "bilingual", node: <SubtitleBilingualComposer /> },
  ];

  return (
    <>
      <Segmented
        block
        size="large"
        aria-label={copy.workspace.modeLabel}
        value={mode}
        onChange={(value) => setMode(value as Mode)}
        options={[
          { value: "preprocess", label: copy.workspace.preprocess },
          { value: "translate", label: copy.workspace.translate },
          { value: "bilingual", label: copy.workspace.bilingual },
        ]}
        style={{ marginBottom: token.marginLG }}
      />
      {panels.map((panel) => (
        <section
          id={`${baseId}-${panel.key}`}
          key={panel.key}
          hidden={mode !== panel.key}
          aria-label={copy.workspace[panel.key]}
        >
          {panel.node}
        </section>
      ))}
    </>
  );
}
```

Add `modeLabel` to both dictionaries. Confirm `hidden` is used rather than
conditional rendering so all panel state survives mode changes.

- [ ] **Step 2: Replace the direct translator mount with the one integration seam**

Modify `src/app/[locale]/client.tsx` only as follows:

```tsx
import SubtitleToolsWorkspace from "@/features/subtitle-tools/SubtitleToolsWorkspace";

// Inside ToolPage; keep every other upstream line unchanged.
<SubtitleToolsWorkspace translationPanel={<SubtitleTranslator />} />
```

Do not move `ApiSettingsDrawer` inside the workspace and do not change
`TranslationProvider`, `ToolPage`, or translator props.

- [ ] **Step 3: Verify the integration diff is narrow**

Run:

```bash
git diff upstream/main -- src/app/[locale]/client.tsx src/app/[locale]/SubtitleTranslator.tsx src/app/components/ApiSettingsDrawer.tsx src/app/lib/translation
```

Expected: only `client.tsx` has a diff; `SubtitleTranslator.tsx`,
`ApiSettingsDrawer.tsx`, and `src/app/lib/translation` have none.

- [ ] **Step 4: Run all automated checks and the production build**

```bash
yarn test:subtitle-tools
yarn lint
yarn tsc --noEmit
yarn build
```

Expected: all commands exit 0. The static export completes for every configured locale.

- [ ] **Step 5: Commit the workspace integration**

```bash
git add src/features/subtitle-tools/SubtitleToolsWorkspace.tsx src/features/subtitle-tools/copy.ts src/app/[locale]/client.tsx
git commit -m "feat: integrate local subtitle tools workspace"
```

---

### Task 8: Browser QA and Final Verification

**Files:**

- Modify only files needed to correct issues found during verification.

**Interfaces:**

- Consumes the completed application.
- Produces verification evidence and a clean, reviewable branch.

- [ ] **Step 1: Start the app for local QA**

Run:

```bash
yarn dev
```

Keep the dev server session running and note its local URL.

- [ ] **Step 2: Verify the Chinese desktop flow in the browser**

Using the `ego-browser` skill, open `/zh/subtitle-translator` at a desktop
viewport and verify:

1. Translation is the default active mode.
2. The existing translator and API settings drawer still open and behave normally.
3. Preprocessing accepts pasted SRT, exposes all eleven options, shows summary/logs, and exports the processed extension.
4. Bilingual composition accepts two subtitle inputs, produces translated-first SRT, and shows unmatched logs.
5. ASS mode opens a responsive template drawer and produces ASS dialogue lines.
6. Text, borders, and cards are legible in both light and dark themes.

- [ ] **Step 3: Verify persistence, English fallback, and mobile layout**

In the browser:

1. Enter content in all three modes, switch among them, and confirm each retains state.
2. Reload and confirm stored options/templates retain their existing keys.
3. Open `/en/subtitle-translator` and confirm all feature-specific text is English.
4. Open a non-Chinese/non-English route such as `/de/subtitle-translator` and confirm feature-specific text falls back to English without runtime message errors.
5. Test a mobile viewport: mode labels remain usable, columns stack, drawer fills the viewport, and primary actions remain reachable.

- [ ] **Step 4: Fix any QA defects with the smallest local change**

For every defect, add or strengthen a pure test when the issue is in parsing,
preprocessing, matching, formatting, or locale selection. Keep fixes inside
`src/features/subtitle-tools` unless the defect is the single client integration
line. Re-run the focused test before continuing.

- [ ] **Step 5: Run final verification from a clean state**

Use `superpowers:verification-before-completion`, then run:

```bash
git diff --check
yarn test:subtitle-tools
yarn lint
yarn tsc --noEmit
yarn build
git status --short
git diff --stat upstream/main...HEAD
git diff upstream/main...HEAD -- src/app/[locale]/SubtitleTranslator.tsx src/app/components/ApiSettingsDrawer.tsx src/app/lib/translation
```

Expected:

- no whitespace errors;
- all focused tests pass;
- lint, type checking, and production build pass;
- the worktree is clean after final fixes are committed;
- the final stat contains the documentation, independent feature directory,
  focused tests, package test script, and the one `client.tsx` integration;
- the final command prints no upstream translator/engine diff.

- [ ] **Step 6: Commit verification fixes if any**

If QA required changes:

Review `git status --short`, stage each reported QA file by its literal path,
then run `git commit -m "fix: polish local subtitle tools integration"`.

If QA required no changes, do not create an empty commit.

- [ ] **Step 7: Prepare completion handoff**

Report:

- integration branch and worktree path;
- upstream baseline commit;
- commits created;
- automated verification commands with fresh pass results;
- browser routes, viewports, and themes checked;
- confirmation that the original stash was untouched;
- the exact upstream-owned files changed.
