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
