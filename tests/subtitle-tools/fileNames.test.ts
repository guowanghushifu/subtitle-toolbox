import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBilingualFileName,
  buildProcessedFileName,
  formatBilingualLogLine,
  formatSubtitleLogTime,
} from "../../src/features/subtitle-tools/lib/fileNames";
import type { BilingualComposeLogEntry } from "../../src/features/subtitle-tools/lib/subtitleTypes";

test("builds a processed filename from the original basename", () => {
  assert.equal(buildProcessedFileName("movie.en.srt", "srt"), "movie.en_preprocessed.srt");
  assert.equal(buildProcessedFileName("", "ass"), "subtitle_preprocessed.ass");
});

test("builds bilingual filenames from the translated subtitle", () => {
  assert.equal(buildBilingualFileName("movie.zh-Hans.srt", "ass"), "movie.zh-Hans_bilingual.ass");
  assert.equal(buildBilingualFileName("", "srt"), "subtitle_bilingual.srt");
});

test("formats unmatched cue timestamps as SRT time", () => {
  assert.equal(formatSubtitleLogTime(3723456), "01:02:03,456");
  assert.equal(formatSubtitleLogTime(-20), "00:00:00,000");
});

test("formats a bilingual unmatched log with the selected localized labels", () => {
  const entry: BilingualComposeLogEntry = {
    type: "translated_unmatched",
    startMs: 5000,
    endMs: 6120,
    text: "未匹配字幕",
  };

  assert.equal(
    formatBilingualLogLine(entry, {
      translatedUnmatched: "译文未匹配",
      originalUnmatched: "原文未匹配",
    }),
    "[译文未匹配] 00:00:05,000 --> 00:00:06,120 未匹配字幕",
  );
});
