import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SUBTITLE_TOOL_MODE,
  SUBTITLE_TOOL_MODES,
} from "../../src/features/subtitle-tools/lib/workspaceModes";

test("keeps translation as the default in the ordered three-mode workspace", () => {
  assert.equal(DEFAULT_SUBTITLE_TOOL_MODE, "translate");
  assert.deepEqual(SUBTITLE_TOOL_MODES, [
    "preprocess",
    "translate",
    "bilingual",
  ]);
});
