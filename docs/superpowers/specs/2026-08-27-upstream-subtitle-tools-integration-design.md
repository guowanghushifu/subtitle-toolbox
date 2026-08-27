# Upstream Subtitle Tools Integration Design

## Objective

Use `rockbenben/subtitle-translator` commit `b4a8e73` (`upstream/main` on
2026-08-27) as the application baseline, then port this fork's subtitle
preprocessing and standalone bilingual subtitle composition features onto it.
The port must follow the upstream UI while keeping the two fork-specific tools
isolated from the upstream translation engine so later upstream syncs have one
small integration conflict instead of repeated conflicts throughout the
translation pipeline.

## Confirmed Scope

- Preserve the option-rich preprocessing behavior currently committed on this
  fork's `main` branch.
- Do not include the later simplified preprocessing implementation reachable
  through `stash@{0}`.
- Do not include the large Project Hail Mary subtitle fixtures stored in the
  stash.
- Keep preprocessing, subtitle translation, and bilingual composition on the
  same subtitle-translator page.
- Use a three-option segmented mode switch instead of restoring the upstream
  project's retired tab-based basic/advanced layout.
- Keep the upstream API settings drawer unchanged.
- Provide feature-specific copy in Chinese and English. `zh` and `zh-hant`
  select the Chinese copy; `en` selects English; all other locales fall back to
  English.
- Remove the fork-specific version/build-time block from the preprocessing UI
  and do not port the related `next.config.ts` environment injection.
- Keep all processing local to the browser. No API route or server-side
  processing is added.

## Upstream Change Analysis

The fork and upstream share base commit `c1b5744`. Since that point, the fork's
net feature changes are concentrated in two UI components, one local subtitle
utility module, two test files, and a small integration change in the old
`client.tsx`. Upstream changed roughly 145 files and replaced the surrounding
frontend architecture:

- The old card tabs and advanced settings tab were removed.
- API settings moved to `ApiSettingsDrawer`.
- Tool pages now use `ToolPageShell`, `ToolPage`, and `TOOL_REGISTRY`.
- Common input and output surfaces use `SourceArea`, `ResultCard`,
  `StatsFooter`, and `PageCard`.
- Subtitle translation logic moved into `src/app/lib/translation` and gained a
  new internal subtitle parser, live results, cancellation, glossary support,
  and bilingual export from a translation run.
- The upstream bilingual export combines an input subtitle with translations
  created in the same run. It does not replace this fork's standalone tool,
  which aligns two independently produced subtitle files by time range.

Because the old integration surface no longer exists, merging or replaying the
fork commits would reintroduce obsolete UI and couple the feature to deleted or
renamed modules. The integration will therefore be rebuilt on the upstream
baseline from the final feature behavior.

## Integration Strategy

Create an isolated integration branch from `upstream/main`, then add the two
features as new commits. Do not merge the current fork `main` wholesale and do
not replay its historical feature commits.

The only required modification to an upstream-owned feature file is
`src/app/[locale]/client.tsx`:

1. Import the fork-owned subtitle tools workspace.
2. Replace the direct `<SubtitleTranslator />` child with the workspace and
   pass `<SubtitleTranslator />` to it as the translation-mode content.

`SubtitleTranslator`, its hooks, `ApiSettingsDrawer`, the translation engine,
the tool registry, and upstream message catalogs remain unchanged.

## Code Ownership Boundary

All fork-owned implementation lives under:

```text
src/features/subtitle-tools/
  SubtitleToolsWorkspace.tsx
  SubtitlePreprocessor.tsx
  SubtitleBilingualComposer.tsx
  AssTemplateDrawer.tsx
  copy.ts
  hooks/
    useSubtitleFileInput.ts
  lib/
    subtitleTypes.ts
    subtitleParsing.ts
    preprocessSubtitle.ts
    composeBilingualSubtitle.ts
    assTemplates.ts
```

The local parser may use upstream code as a behavioral reference, but it must
not import from `src/app/lib/translation`,
`src/app/[locale]/subtitleCues.ts`, or `SubtitleTranslator`. It owns the types
and parsing operations required by the two local tools. Dependencies on the
application are limited to stable generic facilities:

- React and Ant Design;
- generic encoding, newline, and download utilities;
- shared visual primitives such as `SourceArea`, `ResultCard`, `StatsFooter`,
  and `PageCard`;
- generic local-storage and text-stat hooks where their public APIs fit.

The feature owns its file-input hook so upstream changes to the translation
upload workflow do not change local-tool behavior.

## Page and Component Design

`SubtitleToolsWorkspace` renders a full-width segmented switch with three
modes, ordered as preprocessing, translation, and bilingual composition. The
translation mode is initially active to preserve the upstream page's default
purpose.

All three mode panels stay mounted. Inactive panels use the HTML `hidden`
attribute, so switching modes preserves uploaded files, option values, drafts,
results, and logs without leaving inactive controls exposed to keyboard or
screen-reader navigation.

The workspace receives the translation panel as a React node. This keeps the
feature directory from importing the route-local upstream translator and makes
`client.tsx` the only integration seam.

### Preprocessing Mode

The preprocessing surface uses the upstream responsive tool layout:

- a primary input card with single-file drop zone, `SourceArea`, reset action,
  and primary process button;
- a configuration card containing the complete option-rich setting set from
  the fork's current `main`;
- a `ResultCard` for editable processed output with copy and export actions;
- a flat `PageCard` for processing summary and SDH cleanup logs.

The following options and existing localStorage keys remain supported:

- remove round-bracket SDH (`subtitlePreprocessRemoveRoundBracketSdh`);
- remove square-bracket SDH (`subtitlePreprocessRemoveSquareBracketSdh`);
- remove corner-bracket SDH (`subtitlePreprocessRemoveCornerBracketSdh`);
- remove bracketed SDH without keyword checks
  (`subtitlePreprocessRemoveBracketedSdhWithoutKeywordCheck`);
- remove hesitation pauses (`subtitlePreprocessRemoveHesitationEllipses`);
- remove inline formatting tags
  (`subtitlePreprocessRemoveInlineFormattingTags`);
- remove speaker labels (`subtitlePreprocessRemoveSpeakerLabels`);
- remove uppercase sound cues (`subtitlePreprocessRemoveUppercaseSdh`);
- remove repeated quote marks across cues
  (`subtitlePreprocessRemoveRepeatedQuoteMarks`);
- merge identical timestamps (`subtitlePreprocessMergeSameTimestamps`);
- merge lines within a cue (`subtitlePreprocessMergeLinesWithinCue`).

The local preprocessing pipeline preserves the current committed ordering and
format-specific behavior for SRT, VTT, ASS, and LRC.

### Translation Mode

The translation panel is the unmodified upstream `SubtitleTranslator`. Its
configuration cards, live results, progress strip, cancellation, export modes,
and API settings drawer continue to work exactly as they do on
`upstream/main`.

The local modes do not write into translation state. The prior fork UI contains
copy for a "send to translate" action but does not implement that transfer;
this port does not add a new cross-mode data channel.

### Bilingual Composition Mode

The composition surface contains:

- equal-width original and translated subtitle input cards on desktop,
  stacked on mobile;
- SRT/ASS output selection and the saved HDR/SDR template choice in a compact
  configuration card;
- an Ant Design drawer for editing, saving, and resetting the selected ASS
  template;
- a primary compose action;
- an editable `ResultCard` with copy and export actions;
- a summary and a read-only unmatched-cue log.

Composition uses the translated subtitle timeline as the output baseline. It
preserves the current fork's overlap threshold, short-cue exact-alignment
handling, one-to-many and many-to-one matching, and unmatched cue retention.
Unmatched translated and original cues remain in the output and are identified
separately in the log.

## Local Data and Parsing Design

The local parser exposes only the concepts the two tools need:

- detected local subtitle format;
- normalized timed cue with start time, end time, and text;
- format-specific structured blocks needed to reconstruct processed output;
- ASS dialogue field boundaries and inline text normalization.

It supports the current feature formats rather than mirroring every capability
of the upstream translation engine. Format recognition, parsing, reconstruction,
and matching remain pure functions with no React, browser, or translation-engine
dependencies.

Preprocessing data flow:

```text
file/pasted text -> local format detection -> structured cue cleanup
                 -> reconstructed subtitle + stats + cleanup logs
```

Bilingual composition data flow:

```text
original text   -> local timed cue parser --+
                                             +-> overlap matcher -> SRT/ASS builder
translated text -> local timed cue parser --+                    -> summary + logs
```

The ASS choices and templates remain user-editable values stored under the
existing keys `subtitleBilingualOutputFormat`,
`subtitleBilingualAssTemplateMode`, `subtitleBilingualHdrTemplate`, and
`subtitleBilingualSdrTemplate`. The builder preserves the current behavior: it
normalizes line endings and inserts a standard `[Events]` section or `Format`
line when absent, while otherwise retaining the user's template text.

## Error Handling

- Empty required inputs produce a localized message and no state mutation.
- Unsupported or malformed subtitle content produces a localized format error.
- Files are decoded through the application's generic encoding utility; read or
  decode failures clear the local loading state and surface the underlying
  message when available.
- Malformed input with no recognizable subtitle structure returns an explicit
  invalid-format result. Valid input whose cues are all removed still returns
  cleanup stats and logs, while blank export remains disabled.
- Bilingual unmatched cues are retained and logged, not treated as fatal.
- Reset invalidates in-flight reads so a late file callback cannot restore
  cleared or replaced content.

## Localization

Feature-specific text is held in a typed local dictionary in `copy.ts` with
Chinese and English entries. Locale selection is:

```text
zh, zh-hant -> Chinese
en          -> English
all others  -> English fallback
```

Existing shared labels may continue to come from the upstream `common`
namespace where using them does not introduce a feature-specific message
catalog dependency. No `TOOL_REGISTRY` entry or upstream locale catalog is
changed.

## Test Strategy

Pure-function tests are self-contained and use short inline fixtures. They do
not depend on files kept in git stashes or on full copyrighted subtitle files.

Preprocessing coverage includes:

- SRT and VTT cue reconstruction;
- ASS dialogue reconstruction and LRC metadata preservation;
- each SDH bracket family and the aggressive bracket option;
- speaker labels, uppercase cues, standalone music cues, and inline tags;
- hesitation cleanup and punctuation normalization;
- repeated outer quote removal without breaking contractions, decades, or
  dropped-leading-apostrophe words;
- identical timestamp merging and within-cue line merging;
- option-disabled behavior and preprocessing order.

Composition coverage includes:

- exactly aligned short cues;
- threshold-boundary and small-offset matches;
- one-to-many and many-to-one alignment;
- translated-only and original-only retention and logging;
- SRT output ordering;
- ASS output with HDR/SDR templates and invalid-template rejection.

Integration verification includes:

- lint;
- TypeScript/Next.js production build;
- Chinese and English mode labels and feature copy;
- switching among all three modes without state loss;
- translation mode and API settings drawer regression checks;
- desktop and mobile layouts;
- light and dark themes;
- file upload, paste, reset, copy, and export flows.

## Acceptance Criteria

1. The implementation is based on `upstream/main` commit `b4a8e73` or a newer
   upstream commit explicitly approved before implementation begins.
2. Upstream subtitle translation behavior and API settings remain intact.
3. The subtitle-translator page exposes preprocessing, translation, and
   bilingual composition through one segmented mode switch.
4. Switching modes preserves each mode's local state.
5. The option-rich preprocessing behavior from the fork's current `main` is
   preserved, excluding version/build information.
6. Standalone bilingual composition accepts independent subtitle inputs,
   aligns them by time, exports SRT or ASS, and reports unmatched cues.
7. All fork-owned business logic and feature UI live under
   `src/features/subtitle-tools/`.
8. No local business logic imports the upstream translation engine or its cue
   parser.
9. Only the route client integration file is modified in the upstream subtitle
   feature surface.
10. Feature-specific UI text is Chinese/English with the agreed fallback.
11. Pure-function tests, lint, and the production build pass.
12. The existing worktree stash remains untouched.
