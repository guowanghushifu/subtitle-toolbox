import { normalizeNewlines, splitTextIntoLines } from "@/app/utils";
import { detectSubtitleFormat } from "./subtitleParsing";
import type {
  SubtitleFileType,
  SubtitlePreprocessLogEntry,
  SubtitlePreprocessOptions,
  SubtitlePreprocessResult,
} from "./subtitleTypes";

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
const ORPHANED_SPEAKER_SEPARATOR_REGEX = /^[:：]\s*/;
const SPEAKER_LABEL_REGEX = /^\s*[-–—]?\s*([A-Z][A-Z0-9'".-]*(?:\s+[A-Z][A-Z0-9'".-]*){0,5}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\s*:\s*(.*)$/;
const ASS_NEWLINE_REGEX = /\\[Nn]/g;
const STANDALONE_DIALOGUE_MARKER_REGEX = /^[-–—]+$/;
const STANDALONE_MUSIC_NOTE_REGEX = /^\s*[-–—]?\s*[♪♫♬♩♭♯][♪♫♬♩♭♯\s]*$/;
const REPEATED_QUOTE_MARK_PAIRS: Record<string, string> = {
  "'": "'",
  '"': '"',
  "‘": "’",
  "“": "”",
};
const DROPPED_LEADING_APOSTROPHE_REGEX = /^(?:\d|cause\b|til\b|em\b|bout\b|round\b|twas\b|tis\b)/i;
const ELLIPSIS_REGEX_SOURCE = String.raw`(?:\.{3,}|…{1,}|⋯{1,})`;
const COMMA_PAUSE_REGEX_SOURCE = String.raw`(?:,|，)`;
const CHINESE_HESITATION_FILLERS = ["额", "呃", "嗯", "啊", "哎", "这", "那", "那个", "这个", "就是", "我是说", "怎么说", "那么", "那麼", "好吧", "那什么", "那个什么"] as const;
const CHINESE_COMMA_HESITATION_FILLERS = ["额", "呃", "嗯", "啊", "哎"] as const;
const ENGLISH_HESITATION_FILLERS = ["erm", "hm", "uh", "um", "er", "ah", "well", "so", "like", "hmm", "mm", "mmm", "i mean", "you know", "you see"] as const;
const ENGLISH_COMMA_HESITATION_FILLERS = ["erm", "hm", "uh", "um", "er", "ah", "hmm", "mm", "mmm"] as const;

const LOCAL_VTT_SRT_TIME = /^(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}\s+-->\s+(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}/;

const getAssContentStartIndex = (lines: string[]) => {
  const eventIndex = lines.findIndex((line) => line.trim().toLowerCase() === "[events]");
  if (eventIndex !== -1) {
    for (let index = eventIndex; index < lines.length; index++) {
      if (/^Format:/i.test(lines[index])) {
        return lines[index].split(",").length - 1;
      }
    }
  }

  const commaCounts = lines
    .filter((line) => /^Dialogue:/i.test(line))
    .slice(0, 100)
    .map((line) => line.split(",").length - 1);
  return commaCounts.length > 0 ? Math.min(...commaCounts) : 9;
};

export const DEFAULT_PREPROCESS_OPTIONS: Readonly<SubtitlePreprocessOptions> = {
  removeRoundBracketSdh: true,
  removeSquareBracketSdh: true,
  removeCornerBracketSdh: true,
  removeBracketedSdhWithoutKeywordCheck: true,
  removeHesitationEllipses: true,
  removeInlineFormattingTags: true,
  removeSpeakerLabels: true,
  removeUppercaseSdh: true,
  removeRepeatedQuoteMarks: true,
  mergeSameTimestamps: true,
  mergeLinesWithinCue: true,
};

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
    .replace(/\s+([」』】）])/g, "$1")
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

const stripOrphanedSpeakerSeparatorAfterSdh = (line: string, removedTexts: string[]) =>
  removedTexts.length > 0 ? line.replace(ORPHANED_SPEAKER_SEPARATOR_REGEX, "").trim() : line;

const stripConfiguredBracketedSdh = (line: string, options: SubtitlePreprocessOptions, cueKey: string) => {
  const logs: SubtitlePreprocessLogEntry[] = [];
  let nextLine = line;

  if (options.removeRoundBracketSdh) {
    const result = stripBracketedSdh(nextLine, ROUND_BRACKET_SDH_REGEX, options.removeBracketedSdhWithoutKeywordCheck);
    nextLine = stripOrphanedSpeakerSeparatorAfterSdh(result.line, result.removedTexts);
    logs.push(...result.removedTexts.map((text) => ({ type: "round_bracket_sdh" as const, key: cueKey, text })));
  }

  if (options.removeSquareBracketSdh) {
    const result = stripBracketedSdh(nextLine, SQUARE_BRACKET_SDH_REGEX, options.removeBracketedSdhWithoutKeywordCheck);
    nextLine = stripOrphanedSpeakerSeparatorAfterSdh(result.line, result.removedTexts);
    logs.push(...result.removedTexts.map((text) => ({ type: "square_bracket_sdh" as const, key: cueKey, text })));
  }

  if (options.removeCornerBracketSdh) {
    const result = stripBracketedSdh(nextLine, CORNER_BRACKET_SDH_REGEX, options.removeBracketedSdhWithoutKeywordCheck);
    nextLine = stripOrphanedSpeakerSeparatorAfterSdh(result.line, result.removedTexts);
    logs.push(...result.removedTexts.map((text) => ({ type: "corner_bracket_sdh" as const, key: cueKey, text })));
  }

  return { line: nextLine, logs };
};

const stripSpeakerLabel = (line: string) => {
  const match = line.match(SPEAKER_LABEL_REGEX);
  if (!match) {
    return {
      line: line.trim(),
      removedLabel: "",
    };
  }

  const [, speaker, content] = match;
  const words = speaker.trim().split(/\s+/);
  const isAllUppercaseSpeaker = speaker === speaker.toUpperCase();
  const isTitleCaseSpeaker = words.every((word) => /^[A-Z][a-z'".-]*$/.test(word));

  if (!isAllUppercaseSpeaker && !isTitleCaseSpeaker) {
    return {
      line: line.trim(),
      removedLabel: "",
    };
  }

  return {
    line: normalizeCueText(content),
    removedLabel: `${speaker.trim()}:`,
  };
};

const isLikelyUppercaseSdhLine = (line: string) => {
  if (STANDALONE_MUSIC_NOTE_REGEX.test(line.trim())) {
    return true;
  }

  const normalized = line.replace(/[♪♫]/g, " ").replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || CJK_TEXT_REGEX.test(line)) {
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

const removeStandaloneDialogueMarker = (line: string) => (STANDALONE_DIALOGUE_MARKER_REGEX.test(line.trim()) ? "" : line);

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

      const bracketedSdhResult = stripConfiguredBracketedSdh(nextLine, options, cueKey);
      nextLine = bracketedSdhResult.line;
      logs.push(...bracketedSdhResult.logs);

      if (options.removeSpeakerLabels) {
        const result = stripSpeakerLabel(nextLine);
        nextLine = result.line;
        if (result.removedLabel) {
          logs.push({ type: "speaker_label", key: cueKey, text: result.removedLabel });
        }
      }

      nextLine = normalizeCueText(nextLine);

      if (options.removeUppercaseSdh && isLikelyUppercaseSdhLine(nextLine)) {
        logs.push({ type: "uppercase_sdh", key: cueKey, text: nextLine });
        return "";
      }

      if (options.removeHesitationEllipses && (fileType === "srt" || fileType === "vtt")) {
        nextLine = applyHesitationEllipsisCleanup(nextLine);
      }

      return removeStandaloneDialogueMarker(nextLine);
    })
    .filter(Boolean);

  if (cleanedLines.length === 0) {
    return { cleanedLines: [], logs };
  }

  if (options.mergeLinesWithinCue) {
    const mergedSdhResult = stripConfiguredBracketedSdh(normalizeCueText(cleanedLines.join(" ")), options, cueKey);
    logs.push(...mergedSdhResult.logs);
    const mergedLine = applyFinalPunctuationReplacements(mergedSdhResult.line);
    return { cleanedLines: mergedLine ? [mergedLine] : [], logs };
  }

  return { cleanedLines: cleanedLines.map((line) => applyFinalPunctuationReplacements(line)).filter(Boolean), logs };
};

const mergeCueTextLines = (existingLines: string[], incomingLines: string[]) => {
  const mergedLine = applyFinalPunctuationReplacements(normalizeCueText([...existingLines, ...incomingLines].join(" ")));
  return mergedLine ? [mergedLine] : [];
};

const getFirstTextLineIndex = (lines: string[]) => lines.findIndex((line) => line.trim());

const getLastTextLineIndex = (lines: string[]) => {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index].trim()) {
      return index;
    }
  }

  return -1;
};

const getOpeningQuoteMark = (lines: string[]) => {
  const firstTextLineIndex = getFirstTextLineIndex(lines);
  if (firstTextLineIndex === -1) {
    return "";
  }

  const trimmedLine = lines[firstTextLineIndex].trimStart();
  const openingQuote = trimmedLine[0] ?? "";
  if (openingQuote === "'" && DROPPED_LEADING_APOSTROPHE_REGEX.test(trimmedLine.slice(1))) {
    return "";
  }

  return REPEATED_QUOTE_MARK_PAIRS[openingQuote] ? openingQuote : "";
};

const removeOpeningQuoteMark = (lines: string[], quoteMark: string) => {
  const firstTextLineIndex = getFirstTextLineIndex(lines);
  if (firstTextLineIndex === -1) {
    return lines;
  }

  const line = lines[firstTextLineIndex];
  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(leadingWhitespace.length);
  if (!content.startsWith(quoteMark)) {
    return lines;
  }

  const nextLines = [...lines];
  nextLines[firstTextLineIndex] = `${leadingWhitespace}${content.slice(quoteMark.length)}`;
  return nextLines;
};

const removeClosingQuoteMark = (lines: string[], quoteMark: string) => {
  const closingQuoteMark = REPEATED_QUOTE_MARK_PAIRS[quoteMark];
  const lastTextLineIndex = getLastTextLineIndex(lines);
  if (!closingQuoteMark || lastTextLineIndex === -1) {
    return lines;
  }

  const line = lines[lastTextLineIndex];
  const trimmedLine = line.trimEnd();
  if (!trimmedLine.endsWith(closingQuoteMark)) {
    return lines;
  }

  const trailingWhitespace = line.slice(trimmedLine.length);
  const nextLines = [...lines];
  nextLines[lastTextLineIndex] = `${trimmedLine.slice(0, -closingQuoteMark.length)}${trailingWhitespace}`;
  return nextLines;
};

const removeRepeatedQuoteMarksFromCueRun = (cueRun: TimedCueBlock[], quoteMark: string) => {
  if (cueRun.length < 2) {
    return;
  }

  cueRun.forEach((cue) => {
    cue.textLines = removeClosingQuoteMark(removeOpeningQuoteMark(cue.textLines, quoteMark), quoteMark);
  });
};

const removeRepeatedQuoteMarksFromBlocks = (blocks: Array<TimedCueBlock | RawBlock>) => {
  let cueRun: TimedCueBlock[] = [];
  let quoteMark = "";

  const flushCueRun = () => {
    removeRepeatedQuoteMarksFromCueRun(cueRun, quoteMark);
    cueRun = [];
    quoteMark = "";
  };

  blocks.forEach((block) => {
    if (block.type === "raw") {
      flushCueRun();
      return;
    }

    const nextQuoteMark = getOpeningQuoteMark(block.textLines);
    if (!nextQuoteMark || (quoteMark && nextQuoteMark !== quoteMark)) {
      flushCueRun();
    }

    if (!nextQuoteMark) {
      return;
    }

    quoteMark = nextQuoteMark;
    cueRun.push(block);
  });

  flushCueRun();
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
    const timeIndex = block.findIndex((line) => LOCAL_VTT_SRT_TIME.test(line.trim()));

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
  if (options.removeRepeatedQuoteMarks) {
    removeRepeatedQuoteMarksFromBlocks(parsedBlocks);
  }

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
  const assContentStartIndex = getAssContentStartIndex(lines);
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
  const fileType = detectSubtitleFormat(normalizedText);

  if (!fileType) {
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
