export const SUBTITLE_TOOL_MODES = [
  "preprocess",
  "translate",
  "bilingual",
] as const;

export type SubtitleToolMode = (typeof SUBTITLE_TOOL_MODES)[number];

export const DEFAULT_SUBTITLE_TOOL_MODE: SubtitleToolMode = "translate";
