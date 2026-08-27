"use client";

import { useId, useState, type ReactNode } from "react";
import { Segmented, theme } from "antd";
import { useLocale } from "next-intl";
import SubtitleBilingualComposer from "./SubtitleBilingualComposer";
import SubtitlePreprocessor from "./SubtitlePreprocessor";
import { getSubtitleToolsCopy } from "./copy";
import {
  DEFAULT_SUBTITLE_TOOL_MODE,
  SUBTITLE_TOOL_MODES,
  type SubtitleToolMode,
} from "./lib/workspaceModes";

interface SubtitleToolsWorkspaceProps {
  translationPanel: ReactNode;
}

const SubtitleToolsWorkspace = ({
  translationPanel,
}: SubtitleToolsWorkspaceProps) => {
  const copy = getSubtitleToolsCopy(useLocale());
  const [mode, setMode] = useState<SubtitleToolMode>(
    DEFAULT_SUBTITLE_TOOL_MODE,
  );
  const baseId = useId();
  const { token } = theme.useToken();

  const panels: Record<SubtitleToolMode, ReactNode> = {
    preprocess: <SubtitlePreprocessor />,
    translate: translationPanel,
    bilingual: <SubtitleBilingualComposer />,
  };

  return (
    <>
      <Segmented
        block
        size="large"
        aria-label={copy.workspace.modeLabel}
        value={mode}
        onChange={(value) => setMode(value as SubtitleToolMode)}
        options={SUBTITLE_TOOL_MODES.map((key) => ({
          value: key,
          label: copy.workspace[key],
        }))}
        style={{ marginBottom: token.marginLG }}
      />

      {SUBTITLE_TOOL_MODES.map((key) => (
        <section
          id={`${baseId}-${key}`}
          key={key}
          hidden={mode !== key}
          aria-label={copy.workspace[key]}>
          {panels[key]}
        </section>
      ))}
    </>
  );
};

export default SubtitleToolsWorkspace;
