import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREPROCESS_OPTIONS,
  preprocessSubtitleContent,
} from "../../src/features/subtitle-tools/lib/preprocessSubtitle";

const preprocess = (input: string, overrides = {}) =>
  preprocessSubtitleContent(input, { ...DEFAULT_PREPROCESS_OPTIONS, ...overrides });

test("removes fully uppercase sound cues even with punctuation", () => {
  const result = preprocess(`10
00:00:31,400 --> 00:00:32,879
INDISTINCT RUSSIAN,
LAUGHTER

11
00:00:33,000 --> 00:00:34,000
RUN?`);

  assert.ok(result);
  assert.equal(result.content, "");
  assert.equal(result.stats.removedCueCount, 2);
  assert.deepEqual(result.logs.map((log) => log.text), ["INDISTINCT RUSSIAN,", "LAUGHTER", "RUN?"]);
});

test("removes round-bracket SDH split across cue lines", () => {
  const result = preprocess(`1
00:00:01,398 --> 00:00:05,334
(grand orchestral fanfare
playing)`);

  assert.ok(result);
  assert.equal(result.content, "");
  assert.deepEqual(result.logs.map((log) => log.text), ["(grand orchestral fanfare playing)"]);
});

test("removes an orphaned speaker colon after bracketed SDH", () => {
  const result = preprocess(`1
00:00:31,560 --> 00:00:33,693
(muffled):
Illumination!`);

  assert.ok(result);
  assert.equal(result.content, "1\n00:00:31,560 --> 00:00:33,693\nIllumination!");
  assert.deepEqual(result.logs.map((log) => log.text), ["(muffled)"]);
});

test("removes music-note SDH lines with dialogue markers", () => {
  const result = preprocess(`1
00:05:28,021 --> 00:05:31,121
- (hissing)
- ♪ ♪`);

  assert.ok(result);
  assert.equal(result.content, "");
  assert.deepEqual(result.logs.map((log) => log.text), ["(hissing)", "- ♪ ♪"]);
});

test("removes repeated outer quotes across consecutive cues", () => {
  const result = preprocess(`1
00:00:01,000 --> 00:00:02,000
'Hello

2
00:00:02,000 --> 00:00:03,000
'there.'`);

  assert.ok(result);
  assert.equal(result.content, "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:03,000\nthere.");
});

test("preserves isolated apostrophes in contractions and decade forms", () => {
  const result = preprocess(`1
00:00:01,000 --> 00:00:02,000
You're into '90s music.

2
00:00:03,000 --> 00:00:04,000
'cause I said so.`);

  assert.ok(result);
  assert.match(result.content, /You're into '90s music/);
  assert.match(result.content, /'cause I said so/);
});

test("keeps repeated outer quotes when quote removal is disabled", () => {
  const result = preprocess(
    `1
00:00:01,000 --> 00:00:02,000
'Hello

2
00:00:02,000 --> 00:00:03,000
'there.'`,
    { removeRepeatedQuoteMarks: false },
  );

  assert.ok(result);
  assert.match(result.content, /'Hello/);
  assert.match(result.content, /'there\.'/);
});

test("keeps non-SDH bracketed dialogue when aggressive removal is disabled", () => {
  const result = preprocess("1\n00:00:01,000 --> 00:00:02,000\n(quietly considering) Hello", {
    removeBracketedSdhWithoutKeywordCheck: false,
  });

  assert.ok(result);
  assert.match(result.content, /\(quietly considering\) Hello/);
});

test("aggressively removes round, square, and corner bracket text", () => {
  const result = preprocess("1\n00:00:01,000 --> 00:00:02,000\n(sighs) [door closes] 【旁白】 Hello");

  assert.ok(result);
  assert.match(result.content, /\nHello$/);
  assert.deepEqual(result.logs.map((log) => log.type), ["round_bracket_sdh", "square_bracket_sdh", "corner_bracket_sdh"]);
});

test("removes speaker labels while retaining dialogue", () => {
  const result = preprocess("1\n00:00:01,000 --> 00:00:02,000\nJOHN: Hello there.");

  assert.ok(result);
  assert.match(result.content, /\nHello there\.$/);
  assert.equal(result.logs[0]?.type, "speaker_label");
});

test("cleans repeated-word hesitation and filler pauses", () => {
  const result = preprocess("1\n00:00:01,000 --> 00:00:02,000\n我……我不知道。\n\n2\n00:00:03,000 --> 00:00:04,000\nUh... hello.");

  assert.ok(result);
  assert.match(result.content, /我不知道/);
  assert.match(result.content, /\nhello\.$/);
});

test("removes inline HTML and ASS override tags from SRT text", () => {
  const result = preprocess("1\n00:00:01,000 --> 00:00:02,000\n<i>Hello</i> {\\an8}world");

  assert.ok(result);
  assert.match(result.content, /\nHello world$/);
});

test("merges cues with identical timestamps", () => {
  const result = preprocess(`1
00:00:01,000 --> 00:00:02,000
Hello

2
00:00:01,000 --> 00:00:02,000
world`);

  assert.ok(result);
  assert.equal(result.content, "1\n00:00:01,000 --> 00:00:02,000\nHello world");
  assert.deepEqual(result.stats, { originalCueCount: 2, outputCueCount: 1, removedCueCount: 0, mergedCueCount: 1 });
});

test("keeps duplicate timestamps separate when timestamp merging is disabled", () => {
  const result = preprocess(
    `1
00:00:01,000 --> 00:00:02,000
Hello

2
00:00:01,000 --> 00:00:02,000
world`,
    { mergeSameTimestamps: false },
  );

  assert.ok(result);
  assert.equal(result.stats.outputCueCount, 2);
  assert.match(result.content, /\n\n2\n/);
});

test("keeps cue line breaks when within-cue merging is disabled", () => {
  const result = preprocess("1\n00:00:01,000 --> 00:00:02,000\nHello\nworld", { mergeLinesWithinCue: false });

  assert.ok(result);
  assert.equal(result.content, "1\n00:00:01,000 --> 00:00:02,000\nHello\nworld");
});

test("preserves WebVTT header and metadata blocks while cleaning cues", () => {
  const result = preprocess(`WEBVTT

NOTE generated by test
keep metadata

00:01.000 --> 00:02.000
[MUSIC] Hello`);

  assert.ok(result);
  assert.match(result.content, /^WEBVTT/);
  assert.match(result.content, /NOTE generated by test\nkeep metadata/);
  assert.match(result.content, /00:01\.000 --> 00:02\.000\nHello/);
});

test("rebuilds ASS dialogue while preserving the header and ASS override tag", () => {
  const result = preprocess(`[Script Info]
Title: Demo

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}(sighs) Hello\\Nworld`);

  assert.ok(result);
  assert.match(result.content, /^\[Script Info\]\nTitle: Demo/);
  assert.match(result.content, /Dialogue: 0,0:00:01\.00,0:00:02\.00,Default,,0,0,0,,\{\\i1\} Hello world/);
});

test("preserves LRC metadata while cleaning timed lyrics", () => {
  const result = preprocess("[ar:Example]\n[00:01.00](music) Hello\n[00:03.00]World");

  assert.ok(result);
  assert.equal(result.content, "[ar:Example]\n[00:01.00] Hello\n[00:03.00] World");
});

test("returns null for unsupported plain text", () => {
  assert.equal(preprocess("plain text without timestamps"), null);
});
