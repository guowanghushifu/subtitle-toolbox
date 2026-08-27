import { formatMsToSrt } from "./subtitleParsing";
import type { BilingualComposeLogEntry, SubtitleFileType } from "./subtitleTypes";

const basename = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName || "subtitle";
};

export const buildProcessedFileName = (fileName: string, fileType: SubtitleFileType) =>
  `${basename(fileName)}_preprocessed.${fileType}`;

export const buildBilingualFileName = (translatedFileName: string, outputFormat: "srt" | "ass") =>
  `${basename(translatedFileName)}_bilingual.${outputFormat}`;

export const formatSubtitleLogTime = (ms: number) => formatMsToSrt(ms);

interface BilingualLogLabels {
  translatedUnmatched: string;
  originalUnmatched: string;
}

export const formatBilingualLogLine = (
  entry: BilingualComposeLogEntry,
  labels: BilingualLogLabels,
) => {
  const label =
    entry.type === "translated_unmatched"
      ? labels.translatedUnmatched
      : labels.originalUnmatched;
  return `[${label}] ${formatSubtitleLogTime(entry.startMs)} --> ${formatSubtitleLogTime(entry.endMs)} ${entry.text}`;
};
