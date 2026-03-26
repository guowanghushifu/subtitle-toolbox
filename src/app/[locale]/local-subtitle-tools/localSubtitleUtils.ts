import { normalizeNewlines, splitTextIntoLines } from "@/app/utils";
import { detectSubtitleFormat, filterSubLines, VTT_SRT_TIME } from "../subtitleUtils";

const LRC_METADATA_REGEX = /^\[(ar|ti|al|by|offset|re|ve):/i;
const LRC_TIME_TAG_REGEX = /\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g;
const LATIN_SDH_KEYWORD_REGEX =
  /\b(sdh|caption|notice|music|applause|laughter|laughs?|giggles?|chuckles?|sighs?|gasps?|whispers?|shouts?|yells?|screams?|crying|sobbing|sniffles?|coughs?|panting|breathing|inaudible|murmurs?|narrator|speaker|speaking|phone|ringing|beeping|buzzing|door|knock(?:ing)?|footsteps|engine|static|silence|radio|tv|television|offscreen|off-screen|voice[ -]?over|vo|os|o\.s\.|v\.o\.|man|woman|boy|girl|crowd|all)\b/i;
const CJK_SDH_KEYWORD_REGEX =
  /(音乐|音樂|音效|效果音|环境音|環境音|旁白|画外音|畫外音|内心独白|內心獨白|内心|內心|独白|獨白|笑声|笑聲|笑|哭声|哭聲|哭|抽泣|啜泣|叹气|嘆氣|喘息|喘气|喘氣|咳嗽|脚步声|腳步聲|脚步|腳步|敲门|敲門|门铃|門鈴|电话铃|電話鈴|电话|電話|铃声|鈴聲|枪声|槍聲|爆炸|沉默|静默|靜默|风声|風聲|雨声|雨聲|掌声|掌聲|拍手|口哨|低语|低語|耳语|耳語|尖叫|惊呼|驚呼|广播|廣播|电视|電視|收音机|收音機|人群|众人|眾人|齐声|齊聲|合唱|无声|無聲|听不清|聽不清|男声|女声|男聲|女聲|小声|小聲|轻声|輕聲|哼唱|吟唱|唱歌|歌声|歌聲|琴声|琴聲|鼓声|鼓聲|雷声|雷聲|海浪|发动机|發動機|引擎|字幕组|注)\b/;
const JAPANESE_SDH_KEYWORD_REGEX =
  /(音楽|拍手|笑い|笑|泣き声|泣き|すすり泣き|ため息|咳|息遣い|足音|ドア|ノック|電話|ベル|着信|呼び出し|ナレーション|モノローグ|心の声|ささやき|叫び|悲鳴|無線|テレビ|ラジオ|ざわめき|物音|効果音|無言|沈黙|歌声|風の音|雨音|銃声|爆発音|鼻歌|口笛)/;
const KOREAN_SDH_KEYWORD_REGEX =
  /(음악|박수|웃음|한숨|울음소리|울음|흐느낌|기침|숨소리|발소리|문소리|문|노크|전화벨|벨소리|전화|내레이션|독백|속삭임|비명|고함|라디오|텔레비전|소음|효과음|침묵|노랫소리|빗소리|바람 소리|총성|폭발음|콧노래|휘파람)/;
const CJK_TEXT_REGEX = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
const ROUND_BRACKET_SDH_REGEX = /(\([^()]+\)|（[^（）]+）)/g;
const SQUARE_BRACKET_SDH_REGEX = /(\[[^[\]]+\]|［[^［］]+］)/g;
const CORNER_BRACKET_SDH_REGEX = /(【[^【】]+】)/g;
const SPEAKER_LABEL_REGEX = /^\s*[-–—]?\s*([A-Z][A-Z0-9'".-]*(?:\s+[A-Z][A-Z0-9'".-]*){0,5}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\s*:\s*(.+)$/;
const TIME_REGEX = /^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})$/;
const ASS_ALL_TAGS_REGEX = /\{[^}]*\}/g;
const ASS_NEWLINE_REGEX = /\\[Nn]/g;
const ASS_DIALOGUE_REGEX = /^Dialogue:/i;
const VTT_SRT_TIMELINE_REGEX = /^((?:\d+:)?\d{2}:\d{2}[,.]\d{1,3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[,.]\d{1,3})/;
const ASS_EVENTS_HEADER = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
const TRAILING_DIALOGUE_PUNCTUATION_REGEX = /[!?.,;:。？！：；，]$/;
const ELLIPSIS_REGEX_SOURCE = String.raw`(?:\.{3,}|…{1,}|⋯{1,})`;
const COMMA_PAUSE_REGEX_SOURCE = String.raw`(?:,|，)`;
const CHINESE_HESITATION_FILLERS = ["额", "呃", "嗯", "啊", "哎", "这", "那", "那个", "这个", "就是", "我是说", "怎么说", "那么", "那麼", "好吧", "那什么", "那个什么"] as const;
const CHINESE_COMMA_HESITATION_FILLERS = ["额", "呃", "嗯", "啊", "哎"] as const;
const ENGLISH_HESITATION_FILLERS = ["erm", "hm", "uh", "um", "er", "ah", "well", "so", "like", "hmm", "mm", "mmm", "i mean", "you know", "you see"] as const;
const ENGLISH_COMMA_HESITATION_FILLERS = ["erm", "hm", "uh", "um", "er", "ah", "hmm", "mm", "mmm"] as const;
const COMPOSE_MIN_OVERLAP_MS = 400;
const COMPOSE_DURATION_TOLERANCE_MS = 600;
const COMPOSE_SHORT_CUE_COVERAGE_RATIO = 0.75;
const COMPOSE_LONG_CUE_COVERAGE_RATIO = 0.6;

export type SubtitleFileType = "ass" | "vtt" | "srt" | "lrc";

export interface SubtitlePreprocessOptions {
  removeRoundBracketSdh: boolean;
  removeSquareBracketSdh: boolean;
  removeCornerBracketSdh: boolean;
  removeBracketedSdhWithoutKeywordCheck: boolean;
  removeHesitationEllipses: boolean;
  removeInlineFormattingTags: boolean;
  removeSpeakerLabels: boolean;
  removeUppercaseSdh: boolean;
  mergeSameTimestamps: boolean;
  mergeLinesWithinCue: boolean;
}

export type SubtitlePreprocessLogType = "round_bracket_sdh" | "square_bracket_sdh" | "corner_bracket_sdh" | "uppercase_sdh";

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

interface StructuredCue {
  key: string;
  textLines: string[];
}

interface TimedCueBlock extends StructuredCue {
  type: "cue";
  timeLine: string;
  headerLines: string[];
}

interface RawBlock {
  type: "raw";
  lines: string[];
}

interface AssCueLine extends StructuredCue {
  type: "cue";
  prefix: string;
}

interface RawLine {
  type: "raw";
  line: string;
}

interface TimelineCue {
  startMs: number;
  endMs: number;
  text: string;
}

interface ParsedTimelineSubtitle {
  fileType: "srt" | "vtt" | "ass";
  cues: TimelineCue[];
}

interface BilingualOutputCue {
  startMs: number;
  endMs: number;
  translatedText: string;
  originalText: string;
  kind: "merged" | "translated_only" | "original_only";
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

const normalizeCueText = (text: string) => text.replace(/\s+/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyRepeatedEllipsisCleanup = (text: string) => {
  let nextText = text;
  for (let i = 0; i < 4; i++) {
    const previousText = nextText;
    nextText = nextText
      .replace(new RegExp(`([\\u3400-\\u9fff]{1,4})\\s*${ELLIPSIS_REGEX_SOURCE}\\s*\\1`, "g"), "$1")
      .replace(new RegExp(`\\b([A-Za-z]+(?:'[A-Za-z]+)?)\\b\\s*${ELLIPSIS_REGEX_SOURCE}\\s*\\1\\b`, "gi"), "$1");

    if (nextText === previousText) {
      break;
    }
  }
  return nextText;
};

const applyFillerPauseCleanup = (text: string, fillers: readonly string[], flags: string, removeFiller: boolean, pauseRegexSource: string) =>
  fillers.reduce(
    (currentText, filler) =>
      currentText.replace(
        new RegExp(`(^|[\\s"'“”‘’「」『』()（）\\-—])(${escapeRegex(filler)})\\s*${pauseRegexSource}(?=$|[\\s"'“”‘’「」『』()（）,.!?;:，。？！：；\\-—])`, flags),
        removeFiller ? "$1" : "$1$2",
      ),
    text,
  );

const applyHesitationEllipsisCleanup = (text: string) =>
  normalizeCueText(
    applyFillerPauseCleanup(
      applyFillerPauseCleanup(
        applyFillerPauseCleanup(
          applyFillerPauseCleanup(applyRepeatedEllipsisCleanup(text), CHINESE_HESITATION_FILLERS, "g", true, ELLIPSIS_REGEX_SOURCE),
          ENGLISH_HESITATION_FILLERS,
          "gi",
          true,
          ELLIPSIS_REGEX_SOURCE,
        ),
        CHINESE_COMMA_HESITATION_FILLERS,
        "g",
        true,
        COMMA_PAUSE_REGEX_SOURCE,
      ),
      ENGLISH_COMMA_HESITATION_FILLERS,
      "gi",
      true,
      COMMA_PAUSE_REGEX_SOURCE,
    ),
  );

const applyFinalPunctuationReplacements = (text: string) =>
  text
    .replace(/……/g, "…")
    .replace(/“/g, "「")
    .replace(/”/g, "」")
    .replace(/？/g, "?")
    .replace(/！/g, "!")
    .replace(/：/g, ":")
    .replace(/[，。](?=\s*$)/g, "")
    .replace(/[，。]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isLikelyBracketedSdh = (text: string) => {
  const normalized = text.replace(/[♪♫]/g, " ").replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return true;
  }

  const words = normalized.split(/\s+/);
  const lettersOnly = normalized.replace(/[^A-Za-z]/g, "");
  const uppercaseLetters = lettersOnly.replace(/[^A-Z]/g, "").length;
  const uppercaseRatio = lettersOnly.length > 0 ? uppercaseLetters / lettersOnly.length : 0;

  return (
    LATIN_SDH_KEYWORD_REGEX.test(normalized) ||
    CJK_SDH_KEYWORD_REGEX.test(text) ||
    JAPANESE_SDH_KEYWORD_REGEX.test(text) ||
    KOREAN_SDH_KEYWORD_REGEX.test(text) ||
    (words.length <= 6 && uppercaseRatio >= 0.7)
  );
};

const stripBracketedSdh = (line: string, regex: RegExp, skipKeywordCheck: boolean) => {
  const removedTexts: string[] = [];
  const activeRegex = new RegExp(regex.source, regex.flags);
  const strippedLine = line.replace(activeRegex, (match) => {
    if (skipKeywordCheck || isLikelyBracketedSdh(match.slice(1, -1).trim())) {
      removedTexts.push(match.trim());
      return " ";
    }

    return match;
  });

  return {
    line: normalizeCueText(strippedLine),
    removedTexts,
  };
};

const stripSpeakerLabel = (line: string) => {
  const match = line.match(SPEAKER_LABEL_REGEX);
  if (!match) {
    return line.trim();
  }

  const [, speaker, content] = match;
  const words = speaker.trim().split(/\s+/);
  const isAllUppercaseSpeaker = speaker === speaker.toUpperCase();
  const isTitleCaseSpeaker = words.every((word) => /^[A-Z][a-z'".-]*$/.test(word));

  if (!isAllUppercaseSpeaker && !isTitleCaseSpeaker) {
    return line.trim();
  }

  return normalizeCueText(content);
};

const isLikelyUppercaseSdhLine = (line: string) => {
  const normalized = line.replace(/[♪♫]/g, " ").replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || CJK_TEXT_REGEX.test(line)) {
    return false;
  }

  // Preserve emphatic dialogue such as "GOAT!" or "RUN?", even if the text is fully uppercase.
  if (TRAILING_DIALOGUE_PUNCTUATION_REGEX.test(line.trim())) {
    return false;
  }

  const words = normalized.split(/\s+/);
  const lettersOnly = normalized.replace(/[^A-Za-z]/g, "");
  if (lettersOnly.length < 3) {
    return false;
  }

  const uppercaseLetters = lettersOnly.replace(/[^A-Z]/g, "").length;
  const uppercaseRatio = lettersOnly.length > 0 ? uppercaseLetters / lettersOnly.length : 0;

  return (LATIN_SDH_KEYWORD_REGEX.test(normalized) || words.length <= 6) && uppercaseRatio >= 0.85;
};

const stripInlineFormattingTags = (line: string) => line.replace(/<\/?[A-Za-z][^>]*>/g, " ").replace(/\{\\[^}]+\}/g, " ");

const processCueLines = (textLines: string[], options: SubtitlePreprocessOptions, cueKey: string, fileType?: SubtitleFileType) => {
  const logs: SubtitlePreprocessLogEntry[] = [];
  const cleanedLines = textLines
    .map((line) => {
      let nextLine = line.trim();

      if (!nextLine) {
        return "";
      }

      if (options.removeInlineFormattingTags && (fileType === "srt" || fileType === "vtt")) {
        nextLine = stripInlineFormattingTags(nextLine);
      }

      if (options.removeRoundBracketSdh) {
        const result = stripBracketedSdh(nextLine, ROUND_BRACKET_SDH_REGEX, options.removeBracketedSdhWithoutKeywordCheck);
        nextLine = result.line;
        logs.push(...result.removedTexts.map((text) => ({ type: "round_bracket_sdh" as const, key: cueKey, text })));
      }

      if (options.removeSquareBracketSdh) {
        const result = stripBracketedSdh(nextLine, SQUARE_BRACKET_SDH_REGEX, options.removeBracketedSdhWithoutKeywordCheck);
        nextLine = result.line;
        logs.push(...result.removedTexts.map((text) => ({ type: "square_bracket_sdh" as const, key: cueKey, text })));
      }

      if (options.removeCornerBracketSdh) {
        const result = stripBracketedSdh(nextLine, CORNER_BRACKET_SDH_REGEX, options.removeBracketedSdhWithoutKeywordCheck);
        nextLine = result.line;
        logs.push(...result.removedTexts.map((text) => ({ type: "corner_bracket_sdh" as const, key: cueKey, text })));
      }

      if (options.removeSpeakerLabels) {
        nextLine = stripSpeakerLabel(nextLine);
      }

      nextLine = normalizeCueText(nextLine);

      if (options.removeUppercaseSdh && isLikelyUppercaseSdhLine(nextLine)) {
        logs.push({ type: "uppercase_sdh", key: cueKey, text: nextLine });
        return "";
      }

      if (options.removeHesitationEllipses && (fileType === "srt" || fileType === "vtt")) {
        nextLine = applyHesitationEllipsisCleanup(nextLine);
      }

      return nextLine;
    })
    .filter(Boolean);

  if (cleanedLines.length === 0) {
    return { cleanedLines: [], logs };
  }

  if (options.mergeLinesWithinCue) {
    const mergedLine = applyFinalPunctuationReplacements(normalizeCueText(cleanedLines.join(" ")));
    return { cleanedLines: mergedLine ? [mergedLine] : [], logs };
  }

  return { cleanedLines: cleanedLines.map((line) => applyFinalPunctuationReplacements(line)).filter(Boolean), logs };
};

const mergeCueTextLines = (existingLines: string[], incomingLines: string[]) => {
  const mergedLine = applyFinalPunctuationReplacements(normalizeCueText([...existingLines, ...incomingLines].join(" ")));
  return mergedLine ? [mergedLine] : [];
};

const parseTimedCueBlocks = (text: string) => {
  const lines = splitTextIntoLines(normalizeNewlines(text));
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  lines.forEach((line) => {
    if (line.trim() === "") {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      return;
    }

    currentBlock.push(line);
  });

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks.map<TimedCueBlock | RawBlock>((block) => {
    const timeIndex = block.findIndex((line) => VTT_SRT_TIME.test(line.trim()));

    if (timeIndex === -1) {
      return { type: "raw", lines: block };
    }

    return {
      type: "cue",
      key: block[timeIndex].trim(),
      headerLines: block.slice(0, timeIndex),
      timeLine: block[timeIndex],
      textLines: block.slice(timeIndex + 1),
    };
  });
};

const rebuildTimedCueBlocks = (blocks: Array<TimedCueBlock | RawBlock>, fileType: "srt" | "vtt") => {
  let cueIndex = 1;

  return blocks
    .map((block) => {
      if (block.type === "raw") {
        return block.lines.join("\n");
      }

      if (fileType === "srt") {
        return [String(cueIndex++), block.timeLine, ...block.textLines].join("\n");
      }

      cueIndex++;
      return [...block.headerLines, block.timeLine, ...block.textLines].join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
};

const preprocessTimedCueBlocks = (text: string, fileType: "srt" | "vtt", options: SubtitlePreprocessOptions) => {
  const parsedBlocks = parseTimedCueBlocks(text);
  const outputBlocks: Array<TimedCueBlock | RawBlock> = [];
  const mergedCueMap = new Map<string, TimedCueBlock>();
  const logs: SubtitlePreprocessLogEntry[] = [];
  let originalCueCount = 0;
  let outputCueCount = 0;
  let removedCueCount = 0;
  let mergedCueCount = 0;

  parsedBlocks.forEach((block) => {
    if (block.type === "raw") {
      outputBlocks.push(block);
      return;
    }

    originalCueCount++;
    const { cleanedLines: processedTextLines, logs: cueLogs } = processCueLines(block.textLines, options, block.key, fileType);
    logs.push(...cueLogs);

    if (processedTextLines.length === 0) {
      removedCueCount++;
      return;
    }

    if (options.mergeSameTimestamps) {
      const existingCue = mergedCueMap.get(block.key);
      if (existingCue) {
        existingCue.textLines = mergeCueTextLines(existingCue.textLines, processedTextLines);
        mergedCueCount++;
        return;
      }
    }

    const nextBlock: TimedCueBlock = { ...block, textLines: processedTextLines };
    outputBlocks.push(nextBlock);
    mergedCueMap.set(block.key, nextBlock);
    outputCueCount++;
  });

  return {
    content: rebuildTimedCueBlocks(outputBlocks, fileType),
    stats: {
      originalCueCount,
      outputCueCount,
      removedCueCount,
      mergedCueCount,
    },
    logs,
  };
};

const preprocessAssContent = (text: string, options: SubtitlePreprocessOptions) => {
  const lines = splitTextIntoLines(normalizeNewlines(text));
  const { assContentStartIndex } = filterSubLines(lines, "ass");
  const outputLines: Array<AssCueLine | RawLine> = [];
  const mergedCueMap = new Map<string, AssCueLine>();
  const logs: SubtitlePreprocessLogEntry[] = [];
  let originalCueCount = 0;
  let outputCueCount = 0;
  let removedCueCount = 0;
  let mergedCueCount = 0;

  lines.forEach((line) => {
    if (!line.startsWith("Dialogue:")) {
      outputLines.push({ type: "raw", line });
      return;
    }

    const parts = line.split(",");
    if (parts.length <= assContentStartIndex) {
      outputLines.push({ type: "raw", line });
      return;
    }

    originalCueCount++;
    const key = `${parts[1]?.trim() ?? ""} --> ${parts[2]?.trim() ?? ""}`;
    const prefix = `${parts.slice(0, assContentStartIndex).join(",")},`;
    const textLines = parts
      .slice(assContentStartIndex)
      .join(",")
      .trim()
      .replace(ASS_NEWLINE_REGEX, "\n")
      .split("\n");
    const { cleanedLines: processedTextLines, logs: cueLogs } = processCueLines(textLines, options, key, "ass");
    logs.push(...cueLogs);

    if (processedTextLines.length === 0) {
      removedCueCount++;
      return;
    }

    if (options.mergeSameTimestamps) {
      const existingCue = mergedCueMap.get(key);
      if (existingCue) {
        existingCue.textLines = mergeCueTextLines(existingCue.textLines, processedTextLines);
        mergedCueCount++;
        return;
      }
    }

    const nextCue: AssCueLine = {
      type: "cue",
      key,
      prefix,
      textLines: processedTextLines,
    };

    outputLines.push(nextCue);
    mergedCueMap.set(key, nextCue);
    outputCueCount++;
  });

  return {
    content: outputLines
      .map((line) => (line.type === "raw" ? line.line : `${line.prefix}${line.textLines.join("\\N")}`))
      .join("\n")
      .trim(),
    stats: {
      originalCueCount,
      outputCueCount,
      removedCueCount,
      mergedCueCount,
    },
    logs,
  };
};

const preprocessLrcContent = (text: string, options: SubtitlePreprocessOptions) => {
  const lines = splitTextIntoLines(normalizeNewlines(text));
  const outputLines: Array<StructuredCue | RawLine> = [];
  const mergedCueMap = new Map<string, StructuredCue>();
  const logs: SubtitlePreprocessLogEntry[] = [];
  let originalCueCount = 0;
  let outputCueCount = 0;
  let removedCueCount = 0;
  let mergedCueCount = 0;

  lines.forEach((line) => {
    const timeTags = line.match(LRC_TIME_TAG_REGEX) || [];
    if (timeTags.length === 0 || LRC_METADATA_REGEX.test(line.trim())) {
      outputLines.push({ type: "raw", line } as RawLine);
      return;
    }

    originalCueCount++;
    const key = timeTags.join("");
    const { cleanedLines: processedTextLines, logs: cueLogs } = processCueLines([line.replace(LRC_TIME_TAG_REGEX, "").trim()], options, key, "lrc");
    logs.push(...cueLogs);

    if (processedTextLines.length === 0) {
      removedCueCount++;
      return;
    }

    if (options.mergeSameTimestamps) {
      const existingCue = mergedCueMap.get(key);
      if (existingCue) {
        existingCue.textLines = mergeCueTextLines(existingCue.textLines, processedTextLines);
        mergedCueCount++;
        return;
      }
    }

    const nextCue: StructuredCue = {
      key,
      textLines: processedTextLines,
    };

    outputLines.push(nextCue);
    mergedCueMap.set(key, nextCue);
    outputCueCount++;
  });

  return {
    content: outputLines
      .map((line) => {
        if ("type" in line) {
          return line.line;
        }

        return `${line.key}${line.textLines[0] ? ` ${line.textLines[0]}` : ""}`.trimEnd();
      })
      .join("\n")
      .trim(),
    stats: {
      originalCueCount,
      outputCueCount,
      removedCueCount,
      mergedCueCount,
    },
    logs,
  };
};

export const preprocessSubtitleContent = (text: string, options: SubtitlePreprocessOptions): SubtitlePreprocessResult | null => {
  const normalizedText = normalizeNewlines(text);
  const fileType = detectSubtitleFormat(splitTextIntoLines(normalizedText));

  if (fileType === "error") {
    return null;
  }

  switch (fileType) {
    case "srt":
    case "vtt": {
      const result = preprocessTimedCueBlocks(normalizedText, fileType, options);
      return { ...result, fileType };
    }
    case "ass": {
      const result = preprocessAssContent(normalizedText, options);
      return { ...result, fileType };
    }
    case "lrc": {
      const result = preprocessLrcContent(normalizedText, options);
      return { ...result, fileType };
    }
  }
};

export const bilingualAssHdrTemplate = `[Script Info]
Title: Converted Subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080
Timer: 100

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Chs,Source Han Sans SC ST Medium,62,&H00878787,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,8,134
Style: Eng,Source Han Sans SC ST Medium,36,&H00527782,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,10,134
Style: Tip,Source Han Sans SC ST Medium,50,&H00878787,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,8,5,5,0,134`;

export const bilingualAssSdrTemplate = `[Script Info]
; SRT to ASS Converter
Title: Converted Subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080
Timer: 100

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Chs,Source Han Sans SC ST Medium,62,&H00A5A5A5,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,8,134
Style: Eng,Source Han Sans SC ST Medium,36,&H005C859F,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,10,134
Style: Tip,Source Han Sans SC ST Medium,50,&H00A5A5A5,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,8,5,5,0,134`;

const parseVttSrtTimeToMs = (time: string) => {
  const match = time.trim().match(TIME_REGEX);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds, ms] = match;
  const normalizedMs = ms.length === 1 ? `${ms}00` : ms.length === 2 ? `${ms}0` : ms.slice(0, 3);
  return (parseInt(hours || "0", 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(seconds, 10)) * 1000 + parseInt(normalizedMs, 10);
};

const parseAssTimeToMs = (time: string) => {
  const match = time.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds, centiseconds] = match;
  return (parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(seconds, 10)) * 1000 + parseInt(centiseconds.padEnd(2, "0"), 10) * 10;
};

const formatMsToSrt = (ms: number) => {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = safeMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
};

const formatMsToAss = (ms: number) => {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const centiseconds = Math.floor((safeMs % 1000) / 10);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
};

const normalizeSubtitleCueText = (text: string) =>
  text
    .replace(/<\/?c>/g, " ")
    .replace(/<[\d:.]+>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(ASS_ALL_TAGS_REGEX, " ")
    .replace(ASS_NEWLINE_REGEX, "\n")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseTimedTimelineCues = (text: string): TimelineCue[] => {
  const blocks = parseTimedCueBlocks(text);

  return blocks
    .filter((block): block is TimedCueBlock => block.type === "cue")
    .map((block) => {
      const match = block.timeLine.trim().match(VTT_SRT_TIMELINE_REGEX);
      if (!match) {
        return null;
      }

      const startMs = parseVttSrtTimeToMs(match[1]);
      const endMs = parseVttSrtTimeToMs(match[2]);
      if (startMs === null || endMs === null) {
        return null;
      }

      return {
        startMs,
        endMs: Math.max(endMs, startMs + 1),
        text: normalizeSubtitleCueText(block.textLines.join("\n")),
      };
    })
    .filter((cue): cue is TimelineCue => Boolean(cue && cue.text));
};

const parseAssTimelineCues = (text: string): TimelineCue[] => {
  const lines = splitTextIntoLines(normalizeNewlines(text));
  const { assContentStartIndex } = filterSubLines(lines, "ass");

  return lines
    .map((line) => {
      if (!ASS_DIALOGUE_REGEX.test(line)) {
        return null;
      }

      const parts = line.split(",");
      if (parts.length <= assContentStartIndex) {
        return null;
      }

      const startMs = parseAssTimeToMs(parts[1] || "");
      const endMs = parseAssTimeToMs(parts[2] || "");
      if (startMs === null || endMs === null) {
        return null;
      }

      return {
        startMs,
        endMs: Math.max(endMs, startMs + 1),
        text: normalizeSubtitleCueText(parts.slice(assContentStartIndex).join(",")),
      };
    })
    .filter((cue): cue is TimelineCue => Boolean(cue && cue.text));
};

const parseTimelineSubtitle = (text: string): ParsedTimelineSubtitle | null => {
  const normalizedText = normalizeNewlines(text);
  const fileType = detectSubtitleFormat(splitTextIntoLines(normalizedText));

  if (fileType === "error" || fileType === "lrc") {
    return null;
  }

  const cues = fileType === "ass" ? parseAssTimelineCues(normalizedText) : parseTimedTimelineCues(normalizedText);
  return {
    fileType,
    cues,
  };
};

const calculateOverlapMs = (first: TimelineCue, second: TimelineCue) => Math.max(0, Math.min(first.endMs, second.endMs) - Math.max(first.startMs, second.startMs));
const getCueDurationMs = (cue: TimelineCue) => cue.endMs - cue.startMs;
const areIndicesConsecutive = (indices: number[]) => indices.every((value, index) => index === 0 || value === indices[index - 1] + 1);
const calculateCoverageRatio = (baseDurationMs: number, coveredDurationMs: number) => (baseDurationMs <= 0 ? 0 : coveredDurationMs / baseDurationMs);

const calculateCoveredDurationWithinCue = (baseCue: TimelineCue, candidateCues: TimelineCue[]) => {
  const overlapSegments = candidateCues
    .map((candidateCue) => ({
      startMs: Math.max(baseCue.startMs, candidateCue.startMs),
      endMs: Math.min(baseCue.endMs, candidateCue.endMs),
    }))
    .filter((segment) => segment.endMs > segment.startMs)
    .sort((left, right) => left.startMs - right.startMs);

  if (overlapSegments.length === 0) {
    return 0;
  }

  let coveredDurationMs = 0;
  let currentStart = overlapSegments[0].startMs;
  let currentEnd = overlapSegments[0].endMs;

  for (let index = 1; index < overlapSegments.length; index++) {
    const segment = overlapSegments[index];

    if (segment.startMs <= currentEnd) {
      currentEnd = Math.max(currentEnd, segment.endMs);
      continue;
    }

    coveredDurationMs += currentEnd - currentStart;
    currentStart = segment.startMs;
    currentEnd = segment.endMs;
  }

  coveredDurationMs += currentEnd - currentStart;
  return coveredDurationMs;
};

const isLongCueAbsorptionMatch = (
  baseCue: TimelineCue,
  candidateIndices: number[],
  candidateCues: TimelineCue[],
  thresholdMs: number,
  toleranceMs: number,
) => {
  if (candidateIndices.length <= 1 || !areIndicesConsecutive(candidateIndices)) {
    return false;
  }

  const baseDurationMs = getCueDurationMs(baseCue);
  const selectedCandidates = candidateIndices.map((index) => candidateCues[index]);

  if (
    !selectedCandidates.every((candidateCue) => {
      const candidateDurationMs = getCueDurationMs(candidateCue);
      const overlapMs = calculateOverlapMs(baseCue, candidateCue);
      return (
        baseDurationMs - candidateDurationMs > toleranceMs &&
        overlapMs >= thresholdMs &&
        calculateCoverageRatio(candidateDurationMs, overlapMs) >= COMPOSE_SHORT_CUE_COVERAGE_RATIO
      );
    })
  ) {
    return false;
  }

  const coveredDurationMs = calculateCoveredDurationWithinCue(baseCue, selectedCandidates);
  return calculateCoverageRatio(baseDurationMs, coveredDurationMs) >= COMPOSE_LONG_CUE_COVERAGE_RATIO;
};

const buildSrtBilingualSubtitle = (cues: BilingualOutputCue[]) =>
  cues
    .map((cue, index) => {
      const text = cue.translatedText && cue.originalText ? `${cue.translatedText}\n${cue.originalText}` : cue.translatedText || cue.originalText;
      return `${index + 1}\n${formatMsToSrt(cue.startMs)} --> ${formatMsToSrt(cue.endMs)}\n${text}`;
    })
    .join("\n\n");

const ensureAssTemplateHasEvents = (template: string) => {
  const normalized = normalizeNewlines(template).trim();

  if (!/\[Events\]/i.test(normalized)) {
    return `${normalized}\n\n${ASS_EVENTS_HEADER}`;
  }

  if (!/^Format:\s*Layer,\s*Start,\s*End,\s*Style,\s*Name,\s*MarginL,\s*MarginR,\s*MarginV,\s*Effect,\s*Text\s*$/im.test(normalized)) {
    return normalized.replace(/\[Events\]/i, ASS_EVENTS_HEADER);
  }

  return normalized;
};

const escapeAssDialogueText = (text: string) => text.replace(/\r?\n/g, "\\N").trim();

const buildAssBilingualSubtitle = (cues: BilingualOutputCue[], template: string) => {
  const header = ensureAssTemplateHasEvents(template);
  const dialogueLines = cues.map((cue) => {
    let styleName = "Chs";
    let text = "";

    if (cue.translatedText && cue.originalText) {
      text = `${escapeAssDialogueText(cue.translatedText)}\\N{\\rEng}${escapeAssDialogueText(cue.originalText)}`;
    } else if (cue.translatedText) {
      text = escapeAssDialogueText(cue.translatedText);
    } else {
      styleName = "Eng";
      text = escapeAssDialogueText(cue.originalText);
    }

    return `Dialogue: 0,${formatMsToAss(cue.startMs)},${formatMsToAss(cue.endMs)},${styleName},,0,0,0,,${text}`;
  });

  return `${header}\n${dialogueLines.join("\n")}`.trim();
};

export const composeBilingualSubtitle = (originalText: string, translatedText: string, options: BilingualComposeOptions): BilingualComposeResult | null => {
  const parsedOriginal = parseTimelineSubtitle(originalText);
  const parsedTranslated = parseTimelineSubtitle(translatedText);

  if (!parsedOriginal || !parsedTranslated) {
    return null;
  }

  const threshold = options.overlapThresholdMs ?? COMPOSE_MIN_OVERLAP_MS;
  const tolerance = COMPOSE_DURATION_TOLERANCE_MS;
  const translatedAssignments = new Map<number, number[]>();
  const matchedOriginalIndices = new Set<number>();
  const groupedOriginalIndices = new Set<number>();
  const groupedTranslatedIndices = new Set<number>();
  const outputCues: BilingualOutputCue[] = [];

  parsedTranslated.cues.forEach((translatedCue, translatedIndex) => {
    const overlappingOriginalIndices = parsedOriginal.cues
      .map((originalCue, originalIndex) => ({
        originalIndex,
        overlap: calculateOverlapMs(translatedCue, originalCue),
      }))
      .filter(({ overlap, originalIndex }) => overlap >= threshold && !groupedOriginalIndices.has(originalIndex))
      .map(({ originalIndex }) => originalIndex);

    if (!groupedTranslatedIndices.has(translatedIndex) && isLongCueAbsorptionMatch(translatedCue, overlappingOriginalIndices, parsedOriginal.cues, threshold, tolerance)) {
      outputCues.push({
        startMs: translatedCue.startMs,
        endMs: translatedCue.endMs,
        translatedText: translatedCue.text,
        originalText: normalizeCueText(overlappingOriginalIndices.map((index) => parsedOriginal.cues[index].text).join(" ")),
        kind: "merged",
      });
      groupedTranslatedIndices.add(translatedIndex);
      overlappingOriginalIndices.forEach((originalIndex) => groupedOriginalIndices.add(originalIndex));
    }
  });

  parsedOriginal.cues.forEach((originalCue, originalIndex) => {
    const overlappingTranslatedIndices = parsedTranslated.cues
      .map((translatedCue, translatedIndex) => ({
        translatedIndex,
        overlap: calculateOverlapMs(originalCue, translatedCue),
      }))
      .filter(({ overlap, translatedIndex }) => overlap >= threshold && !groupedTranslatedIndices.has(translatedIndex))
      .map(({ translatedIndex }) => translatedIndex);

    if (
      !groupedOriginalIndices.has(originalIndex) &&
      isLongCueAbsorptionMatch(originalCue, overlappingTranslatedIndices, parsedTranslated.cues, threshold, tolerance)
    ) {
      outputCues.push({
        startMs: originalCue.startMs,
        endMs: originalCue.endMs,
        translatedText: normalizeCueText(overlappingTranslatedIndices.map((index) => parsedTranslated.cues[index].text).join(" ")),
        originalText: originalCue.text,
        kind: "merged",
      });
      groupedOriginalIndices.add(originalIndex);
      overlappingTranslatedIndices.forEach((translatedIndex) => groupedTranslatedIndices.add(translatedIndex));
    }
  });

  parsedOriginal.cues.forEach((originalCue, originalIndex) => {
    if (groupedOriginalIndices.has(originalIndex)) {
      return;
    }

    let bestTranslatedIndex = -1;
    let bestOverlap = 0;
    let bestStartDistance = Number.POSITIVE_INFINITY;

    parsedTranslated.cues.forEach((translatedCue, translatedIndex) => {
      if (groupedTranslatedIndices.has(translatedIndex)) {
        return;
      }

      const overlap = calculateOverlapMs(originalCue, translatedCue);
      if (overlap < threshold) {
        return;
      }

      const startDistance = Math.abs(originalCue.startMs - translatedCue.startMs);
      if (overlap > bestOverlap || (overlap === bestOverlap && startDistance < bestStartDistance)) {
        bestTranslatedIndex = translatedIndex;
        bestOverlap = overlap;
        bestStartDistance = startDistance;
      }
    });

    if (bestTranslatedIndex !== -1) {
      const existing = translatedAssignments.get(bestTranslatedIndex) || [];
      existing.push(originalIndex);
      translatedAssignments.set(bestTranslatedIndex, existing);
      matchedOriginalIndices.add(originalIndex);
    }
  });

  const logs: BilingualComposeLogEntry[] = [];
  let matchedCount = outputCues.length;
  let translatedOnlyCount = 0;
  let originalOnlyCount = 0;

  parsedTranslated.cues.forEach((translatedCue, translatedIndex) => {
    if (groupedTranslatedIndices.has(translatedIndex)) {
      return;
    }

    const assignedOriginalIndices = (translatedAssignments.get(translatedIndex) || []).sort(
      (left, right) => parsedOriginal.cues[left].startMs - parsedOriginal.cues[right].startMs,
    );
    const mergedOriginalText = assignedOriginalIndices.map((index) => parsedOriginal.cues[index].text).join(" ").trim();

    if (mergedOriginalText) {
      matchedCount++;
      outputCues.push({
        startMs: translatedCue.startMs,
        endMs: translatedCue.endMs,
        translatedText: translatedCue.text,
        originalText: normalizeCueText(mergedOriginalText),
        kind: "merged",
      });
      return;
    }

    translatedOnlyCount++;
    outputCues.push({
      startMs: translatedCue.startMs,
      endMs: translatedCue.endMs,
      translatedText: translatedCue.text,
      originalText: "",
      kind: "translated_only",
    });
    logs.push({
      type: "translated_unmatched",
      startMs: translatedCue.startMs,
      endMs: translatedCue.endMs,
      text: translatedCue.text,
    });
  });

  parsedOriginal.cues.forEach((originalCue, originalIndex) => {
    if (matchedOriginalIndices.has(originalIndex) || groupedOriginalIndices.has(originalIndex)) {
      return;
    }

    originalOnlyCount++;
    outputCues.push({
      startMs: originalCue.startMs,
      endMs: originalCue.endMs,
      translatedText: "",
      originalText: originalCue.text,
      kind: "original_only",
    });
    logs.push({
      type: "original_unmatched",
      startMs: originalCue.startMs,
      endMs: originalCue.endMs,
      text: originalCue.text,
    });
  });

  outputCues.sort((left, right) => {
    if (left.startMs !== right.startMs) {
      return left.startMs - right.startMs;
    }
    if (left.kind === "original_only" && right.kind !== "original_only") {
      return 1;
    }
    if (right.kind === "original_only" && left.kind !== "original_only") {
      return -1;
    }
    return left.endMs - right.endMs;
  });

  const content =
    options.outputFormat === "ass"
      ? buildAssBilingualSubtitle(outputCues, options.assTemplate || bilingualAssSdrTemplate)
      : buildSrtBilingualSubtitle(outputCues);

  return {
    content,
    logs,
    matchedCount,
    translatedOnlyCount,
    originalOnlyCount,
    outputCueCount: outputCues.length,
  };
};
