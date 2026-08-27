import { formatMsToSrt } from "./subtitleParsing";
import type { SubtitleFileType } from "./subtitleTypes";

const basename = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName || "subtitle";
};

export const buildProcessedFileName = (fileName: string, fileType: SubtitleFileType) =>
  `${basename(fileName)}_preprocessed.${fileType}`;

export const buildBilingualFileName = (translatedFileName: string, outputFormat: "srt" | "ass") =>
  `${basename(translatedFileName)}_bilingual.${outputFormat}`;

export const formatSubtitleLogTime = (ms: number) => formatMsToSrt(ms);
