import assert from "node:assert/strict";
import test from "node:test";
import { getSubtitleToolsCopy } from "../../src/features/subtitle-tools/copy";

test("selects Chinese copy for simplified and traditional Chinese routes", () => {
  assert.equal(getSubtitleToolsCopy("zh").workspace.translate, "字幕翻译");
  assert.equal(getSubtitleToolsCopy("zh-hant").workspace.preprocess, "字幕预处理");
});

test("selects English copy and falls back to English for other locales", () => {
  assert.equal(getSubtitleToolsCopy("en").workspace.bilingual, "Bilingual Composer");
  assert.equal(getSubtitleToolsCopy("de").workspace.bilingual, "Bilingual Composer");
});

test("contains the option-rich preprocessing labels", () => {
  const copy = getSubtitleToolsCopy("en");
  assert.match(copy.preprocessor.removeBracketedSdhWithoutKeywordCheck, /without keyword/i);
  assert.match(copy.preprocessor.removeRepeatedQuoteMarks, /quote/i);
});

test("contains separate unmatched labels for bilingual composition", () => {
  const copy = getSubtitleToolsCopy("en");
  assert.equal(copy.composer.translatedUnmatched, "Translated unmatched");
  assert.equal(copy.composer.originalUnmatched, "Original unmatched");
});
