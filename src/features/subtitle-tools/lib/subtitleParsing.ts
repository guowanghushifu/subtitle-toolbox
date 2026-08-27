import { normalizeNewlines } from "@/app/utils";
import type { ParsedTimelineSubtitle, SubtitleFileType, TimelineCue } from "./subtitleTypes";

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

  if (lines.some((line) => /^Dialogue:/i.test(line.trim())) && lines.some((line) => /^\[Events\]/i.test(line.trim()))) {
    return "ass";
  }
  if (/^WEBVTT(?:\s|$)/i.test(normalized.trimStart())) {
    return "vtt";
  }
  if (lines.some((line) => VTT_SRT_TIMELINE.test(line.trim()))) {
    return "srt";
  }
  if (lines.some((line) => LRC_TIME_TAG.test(line.trim()))) {
    return "lrc";
  }
  return null;
};

const parseSrtVttTimeToMs = (value: string): number | null => {
  const match = value.trim().match(SRT_VTT_TIME);
  if (!match) {
    return null;
  }
  const [, hours = "0", minutes, seconds, fraction] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, "0").slice(0, 3));
};

const parseAssTimeToMs = (value: string): number | null => {
  const match = value.trim().match(ASS_TIME);
  if (!match) {
    return null;
  }
  const [, hours, minutes, seconds, centiseconds] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(centiseconds.padEnd(2, "0").slice(0, 2)) * 10;
};

const parseTimedBlocks = (text: string): TimelineCue[] =>
  text
    .split(/\n{2,}/)
    .filter((block) => !/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/i.test(block.trim()))
    .flatMap((block) => {
      const lines = block.split("\n");
      const timeIndex = lines.findIndex((line) => VTT_SRT_TIMELINE.test(line.trim()));
      if (timeIndex === -1) {
        return [];
      }

      const match = lines[timeIndex].trim().match(VTT_SRT_TIMELINE);
      if (!match) {
        return [];
      }

      const startMs = parseSrtVttTimeToMs(match[1]);
      const endMs = parseSrtVttTimeToMs(match[2]);
      const cueText = normalizeCueText(lines.slice(timeIndex + 1).join("\n"));
      if (startMs === null || endMs === null || !cueText) {
        return [];
      }
      return [{ startMs, endMs, text: cueText }];
    });

const parseAssDialogue = (text: string): TimelineCue[] => {
  let textFieldIndex = 9;
  const cues: TimelineCue[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (/^Format:/i.test(line)) {
      const fields = line
        .slice(line.indexOf(":") + 1)
        .split(",")
        .map((field) => field.trim().toLowerCase());
      const found = fields.indexOf("text");
      if (found !== -1) {
        textFieldIndex = found;
      }
      continue;
    }

    if (!/^Dialogue:/i.test(line)) {
      continue;
    }
    const fields = line.slice(line.indexOf(":") + 1).split(",");
    if (fields.length <= textFieldIndex) {
      continue;
    }

    const startMs = parseAssTimeToMs(fields[1] ?? "");
    const endMs = parseAssTimeToMs(fields[2] ?? "");
    const cueText = normalizeCueText(fields.slice(textFieldIndex).join(","));
    if (startMs === null || endMs === null || !cueText) {
      continue;
    }
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
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const centiseconds = Math.floor((safeMs % 1000) / 10);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
};
