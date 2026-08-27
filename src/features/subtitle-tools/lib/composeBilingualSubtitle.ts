import {
  formatMsToAss,
  formatMsToSrt,
  normalizeCueText,
  parseTimelineSubtitle,
} from "./subtitleParsing";
import {
  bilingualAssSdrTemplate,
  ensureAssTemplateHasEvents,
} from "./assTemplates";
import type {
  BilingualComposeLogEntry,
  BilingualComposeOptions,
  BilingualComposeResult,
  TimelineCue,
} from "./subtitleTypes";

const COMPOSE_MIN_OVERLAP_MS = 400;
const COMPOSE_DURATION_TOLERANCE_MS = 600;
const COMPOSE_SHORT_CUE_COVERAGE_RATIO = 0.75;
const COMPOSE_LONG_CUE_COVERAGE_RATIO = 0.6;
const COMPOSE_SHORT_CUE_ALIGNMENT_TOLERANCE_MS = 50;

interface BilingualOutputCue {
  startMs: number;
  endMs: number;
  translatedText: string;
  originalText: string;
  kind: "merged" | "translated_only" | "original_only";
}

const calculateOverlapMs = (first: TimelineCue, second: TimelineCue) => Math.max(0, Math.min(first.endMs, second.endMs) - Math.max(first.startMs, second.startMs));
const getCueDurationMs = (cue: TimelineCue) => cue.endMs - cue.startMs;
const areIndicesConsecutive = (indices: number[]) => indices.every((value, index) => index === 0 || value === indices[index - 1] + 1);
const calculateCoverageRatio = (baseDurationMs: number, coveredDurationMs: number) => (baseDurationMs <= 0 ? 0 : coveredDurationMs / baseDurationMs);
const hasNearlyIdenticalTiming = (first: TimelineCue, second: TimelineCue) =>
  Math.abs(first.startMs - second.startMs) <= COMPOSE_SHORT_CUE_ALIGNMENT_TOLERANCE_MS &&
  Math.abs(first.endMs - second.endMs) <= COMPOSE_SHORT_CUE_ALIGNMENT_TOLERANCE_MS;

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
      if (overlap < threshold && !hasNearlyIdenticalTiming(originalCue, translatedCue)) {
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

