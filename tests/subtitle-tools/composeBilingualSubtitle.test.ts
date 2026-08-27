import assert from "node:assert/strict";
import test from "node:test";
import { bilingualAssSdrTemplate } from "../../src/features/subtitle-tools/lib/assTemplates";
import { composeBilingualSubtitle } from "../../src/features/subtitle-tools/lib/composeBilingualSubtitle";

const cue = (index: number, start: string, end: string, text: string) => `${index}\n${start} --> ${end}\n${text}`;

test("matches an exactly aligned short cue below the absolute overlap threshold", () => {
  const result = composeBilingualSubtitle(
    cue(1, "00:00:01,000", "00:00:01,200", "Hello?"),
    cue(1, "00:00:01,000", "00:00:01,200", "你好？"),
    { outputFormat: "srt" },
  );

  assert.ok(result);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.translatedOnlyCount, 0);
  assert.equal(result.originalOnlyCount, 0);
  assert.match(result.content, /你好？\nHello\?/);
});

test("matches cues with a small start and end offset", () => {
  const result = composeBilingualSubtitle(
    cue(1, "00:00:01,000", "00:00:02,000", "Hello"),
    cue(1, "00:00:01,020", "00:00:02,030", "你好"),
    { outputFormat: "srt" },
  );

  assert.ok(result);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.logs.length, 0);
});

test("groups consecutive original cues into one longer translated cue", () => {
  const original = `${cue(1, "00:00:01,000", "00:00:01,800", "One")}\n\n${cue(2, "00:00:01,800", "00:00:03,000", "Two")}`;
  const translated = cue(1, "00:00:01,000", "00:00:03,000", "一，二");
  const result = composeBilingualSubtitle(original, translated, { outputFormat: "srt" });

  assert.ok(result);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.outputCueCount, 1);
  assert.match(result.content, /一，二\nOne Two/);
});

test("groups consecutive translated cues under one longer original cue", () => {
  const original = cue(1, "00:00:01,000", "00:00:03,000", "One complete thought");
  const translated = `${cue(1, "00:00:01,000", "00:00:01,800", "第一句")}\n\n${cue(2, "00:00:01,800", "00:00:03,000", "第二句")}`;
  const result = composeBilingualSubtitle(original, translated, { outputFormat: "srt" });

  assert.ok(result);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.outputCueCount, 1);
  assert.match(result.content, /第一句 第二句\nOne complete thought/);
});

test("retains and logs translated-only and original-only cues", () => {
  const result = composeBilingualSubtitle(
    cue(1, "00:00:01,000", "00:00:02,000", "Original only"),
    cue(1, "00:00:05,000", "00:00:06,000", "仅译文"),
    { outputFormat: "srt" },
  );

  assert.ok(result);
  assert.equal(result.translatedOnlyCount, 1);
  assert.equal(result.originalOnlyCount, 1);
  assert.deepEqual(result.logs.map((entry) => entry.type), ["translated_unmatched", "original_unmatched"]);
  assert.match(result.content, /仅译文/);
  assert.match(result.content, /Original only/);
});

test("keeps output cues in chronological order", () => {
  const original = `${cue(1, "00:00:05,000", "00:00:06,000", "Later")}\n\n${cue(2, "00:00:01,000", "00:00:02,000", "Earlier")}`;
  const translated = `${cue(1, "00:00:05,000", "00:00:06,000", "后")}\n\n${cue(2, "00:00:01,000", "00:00:02,000", "前")}`;
  const result = composeBilingualSubtitle(original, translated, { outputFormat: "srt" });

  assert.ok(result);
  assert.ok(result.content.indexOf("前") < result.content.indexOf("后"));
});

test("builds ASS output and repairs a missing Events section", () => {
  const templateWithoutEvents = bilingualAssSdrTemplate.replace(/\[Events\][\s\S]*$/, "");
  const result = composeBilingualSubtitle(
    cue(1, "00:00:01,000", "00:00:02,000", "Hello"),
    cue(1, "00:00:01,000", "00:00:02,000", "你好"),
    { outputFormat: "ass", assTemplate: templateWithoutEvents },
  );

  assert.ok(result);
  assert.match(result.content, /\[Events\]/);
  assert.match(result.content, /Dialogue: 0,0:00:01\.00,0:00:02\.00,Chs/);
  assert.match(result.content, /你好\\N\{\\rEng\}Hello/);
});

test("preserves custom ASS template text", () => {
  const customTemplate = `${bilingualAssSdrTemplate}\n; custom marker`;
  const result = composeBilingualSubtitle(
    cue(1, "00:00:01,000", "00:00:02,000", "Hello"),
    cue(1, "00:00:01,000", "00:00:02,000", "你好"),
    { outputFormat: "ass", assTemplate: customTemplate },
  );

  assert.ok(result);
  assert.match(result.content, /; custom marker/);
});

test("returns null when either input is not a timed supported subtitle", () => {
  assert.equal(
    composeBilingualSubtitle("[00:01.00]Hello", cue(1, "00:00:01,000", "00:00:02,000", "你好"), { outputFormat: "srt" }),
    null,
  );
  assert.equal(composeBilingualSubtitle("plain text", "plain text", { outputFormat: "srt" }), null);
});
