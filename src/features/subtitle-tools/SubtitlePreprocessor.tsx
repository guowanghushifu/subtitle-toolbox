"use client";

import { useCallback, useMemo, useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Col,
  Divider,
  Flex,
  Input,
  Row,
  Space,
  Spin,
  Typography,
  Upload,
  theme,
} from "antd";
import {
  ClearOutlined,
  InboxOutlined,
  ProfileOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageCard from "@/app/components/styled/PageCard";
import ResultCard from "@/app/components/ResultCard";
import SourceArea from "@/app/components/SourceArea";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useTextStats } from "@/app/hooks/useTextStats";
import { downloadFile, getErrorMessage } from "@/app/utils";
import { getSubtitleToolsCopy } from "./copy";
import { useSubtitleFileInput } from "./hooks/useSubtitleFileInput";
import { buildProcessedFileName } from "./lib/fileNames";
import { preprocessSubtitleContent } from "./lib/preprocessSubtitle";
import type {
  SubtitleFileType,
  SubtitlePreprocessLogEntry,
  SubtitlePreprocessOptions,
} from "./lib/subtitleTypes";

const { Dragger } = Upload;
const { TextArea } = Input;
const { Paragraph, Text } = Typography;
const SUBTITLE_ACCEPT = ".srt,.vtt,.ass,.ssa,.lrc";

const SubtitlePreprocessor = () => {
  const locale = useLocale();
  const t = useTranslations("common");
  const copy = getSubtitleToolsCopy(locale).preprocessor;
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { copyToClipboard } = useCopyToClipboard();

  const onReadError = useCallback(
    (error: unknown) => message.error(`${t("fileReadFailed")}: ${getErrorMessage(error)}`),
    [message, t],
  );
  const input = useSubtitleFileInput({ onError: onReadError });

  const [removeRoundBracketSdh, setRemoveRoundBracketSdh] = useLocalStorage("subtitlePreprocessRemoveRoundBracketSdh", true);
  const [removeSquareBracketSdh, setRemoveSquareBracketSdh] = useLocalStorage("subtitlePreprocessRemoveSquareBracketSdh", true);
  const [removeCornerBracketSdh, setRemoveCornerBracketSdh] = useLocalStorage("subtitlePreprocessRemoveCornerBracketSdh", true);
  const [removeBracketedSdhWithoutKeywordCheck, setRemoveBracketedSdhWithoutKeywordCheck] = useLocalStorage(
    "subtitlePreprocessRemoveBracketedSdhWithoutKeywordCheck",
    true,
  );
  const [removeHesitationEllipses, setRemoveHesitationEllipses] = useLocalStorage("subtitlePreprocessRemoveHesitationEllipses", true);
  const [removeInlineFormattingTags, setRemoveInlineFormattingTags] = useLocalStorage("subtitlePreprocessRemoveInlineFormattingTags", true);
  const [removeSpeakerLabels, setRemoveSpeakerLabels] = useLocalStorage("subtitlePreprocessRemoveSpeakerLabels", true);
  const [removeUppercaseSdh, setRemoveUppercaseSdh] = useLocalStorage("subtitlePreprocessRemoveUppercaseSdh", true);
  const [removeRepeatedQuoteMarks, setRemoveRepeatedQuoteMarks] = useLocalStorage("subtitlePreprocessRemoveRepeatedQuoteMarks", true);
  const [mergeSameTimestamps, setMergeSameTimestamps] = useLocalStorage("subtitlePreprocessMergeSameTimestamps", true);
  const [mergeLinesWithinCue, setMergeLinesWithinCue] = useLocalStorage("subtitlePreprocessMergeLinesWithinCue", true);

  const [processedText, setProcessedText] = useState("");
  const [processedFileType, setProcessedFileType] = useState<SubtitleFileType | null>(null);
  const [processLogs, setProcessLogs] = useState<SubtitlePreprocessLogEntry[]>([]);
  const [processSummary, setProcessSummary] = useState("");
  const [hasProcessed, setHasProcessed] = useState(false);
  const sourceStats = useTextStats(input.sourceText);
  const resultStats = useTextStats(processedText);

  const clearResults = useCallback(() => {
    setProcessedText("");
    setProcessedFileType(null);
    setProcessLogs([]);
    setProcessSummary("");
    setHasProcessed(false);
  }, []);

  const options = useMemo<SubtitlePreprocessOptions>(
    () => ({
      removeRoundBracketSdh,
      removeSquareBracketSdh,
      removeCornerBracketSdh,
      removeBracketedSdhWithoutKeywordCheck,
      removeHesitationEllipses,
      removeInlineFormattingTags,
      removeSpeakerLabels,
      removeUppercaseSdh,
      removeRepeatedQuoteMarks,
      mergeSameTimestamps,
      mergeLinesWithinCue,
    }),
    [
      mergeLinesWithinCue,
      mergeSameTimestamps,
      removeBracketedSdhWithoutKeywordCheck,
      removeCornerBracketSdh,
      removeHesitationEllipses,
      removeInlineFormattingTags,
      removeRepeatedQuoteMarks,
      removeRoundBracketSdh,
      removeSpeakerLabels,
      removeSquareBracketSdh,
      removeUppercaseSdh,
    ],
  );

  const handleProcess = () => {
    if (!input.sourceText.trim()) {
      message.error(copy.noSourceText);
      return;
    }
    const result = preprocessSubtitleContent(input.sourceText, options);
    if (!result) {
      message.error(copy.unsupportedSubtitle);
      return;
    }
    setProcessedText(result.content);
    setProcessedFileType(result.fileType);
    setProcessLogs(result.logs);
    setProcessSummary(
      copy.processedStats(
        result.stats.outputCueCount,
        result.stats.originalCueCount,
        result.stats.removedCueCount,
        result.stats.mergedCueCount,
      ),
    );
    setHasProcessed(true);
    message.success(t("textProcessed"));
  };

  const handleReset = () => {
    input.reset();
    clearResults();
    message.success(t("resetUploadSuccess"));
  };

  const handleExport = async () => {
    if (!processedText || !processedFileType) {
      message.warning(copy.noProcessedText);
      return;
    }
    const fileName = buildProcessedFileName(input.fileName, processedFileType);
    await downloadFile(processedText, fileName);
    message.success(`${t("exportedFile")}: ${fileName}`);
  };

  const logText =
    processLogs.length === 0
      ? copy.noLogs
      : processLogs
          .map((log) => {
            const label =
              log.type === "round_bracket_sdh"
                ? copy.roundBracketLog
                : log.type === "square_bracket_sdh"
                  ? copy.squareBracketLog
                  : log.type === "corner_bracket_sdh"
                    ? copy.cornerBracketLog
                    : log.type === "speaker_label"
                      ? copy.speakerLabelLog
                      : copy.uppercaseLog;
            return `[${label}] ${log.key} ${log.text}`.trim();
          })
          .join("\n");

  const optionRow = (label: string, hint: string, checked: boolean, onChange: (value: boolean) => void) => (
    <div>
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
        {label}
      </Checkbox>
      <div style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM, lineHeight: 1.45, paddingInlineStart: 24, paddingTop: 3 }}>
        {hint}
      </div>
    </div>
  );

  return (
    <Spin spinning={input.isReading} description={t("pleaseWait")} size="large">
      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Paragraph style={{ margin: 0, color: token.colorTextSecondary }}>{copy.description}</Paragraph>
        </Col>

        <Col xs={24} lg={14} xl={15}>
          <PageCard
            title={
              <Space>
                <InboxOutlined /> {t("sourceArea")}
              </Space>
            }
            extra={
              <Button type="text" danger icon={<ClearOutlined />} onClick={handleReset}>
                {t("clearAll")}
              </Button>
            }
            className="h-full">
            <Dragger
              accept={SUBTITLE_ACCEPT}
              multiple={false}
              maxCount={1}
              fileList={input.fileList}
              beforeUpload={(file) => {
                clearResults();
                void input.selectFile(file);
                return false;
              }}
              onRemove={() => {
                input.reset();
                clearResults();
                return true;
              }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{t("dragAndDropText")}</p>
              <p className="ant-upload-hint">
                {t("supportedFormats")} SRT, VTT, ASS/SSA, LRC
              </p>
            </Dragger>

            <SourceArea
              sourceText={input.sourceText}
              setSourceText={(value) => {
                clearResults();
                input.setSourceText(value);
              }}
              stats={sourceStats}
              placeholder={t("pasteUploadContent")}
              ariaLabel={copy.title}
              rows={16}
              className="mt-3"
              textDirection="auto"
            />

            <Divider />
            <Button type="primary" size="large" block icon={<ToolOutlined />} onClick={handleProcess} disabled={input.isReading}>
              {t("startProcess")}
            </Button>
          </PageCard>
        </Col>

        <Col xs={24} lg={10} xl={9}>
          <PageCard
            title={
              <Space>
                <SettingOutlined /> {copy.optionsTitle}
              </Space>
            }
            className="h-full">
            <Flex vertical gap="middle">
              <Text className="font-mono" style={{ color: token.colorTextTertiary, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                SDH / CLEANUP
              </Text>
              {optionRow(copy.removeRoundBracketSdh, copy.removeRoundBracketSdhHint, removeRoundBracketSdh, setRemoveRoundBracketSdh)}
              {optionRow(copy.removeSquareBracketSdh, copy.removeSquareBracketSdhHint, removeSquareBracketSdh, setRemoveSquareBracketSdh)}
              {optionRow(copy.removeCornerBracketSdh, copy.removeCornerBracketSdhHint, removeCornerBracketSdh, setRemoveCornerBracketSdh)}
              {optionRow(
                copy.removeBracketedSdhWithoutKeywordCheck,
                copy.removeBracketedSdhWithoutKeywordCheckHint,
                removeBracketedSdhWithoutKeywordCheck,
                setRemoveBracketedSdhWithoutKeywordCheck,
              )}
              {optionRow(copy.removeHesitationEllipses, copy.removeHesitationEllipsesHint, removeHesitationEllipses, setRemoveHesitationEllipses)}
              {optionRow(copy.removeInlineFormattingTags, copy.removeInlineFormattingTagsHint, removeInlineFormattingTags, setRemoveInlineFormattingTags)}
              {optionRow(copy.removeSpeakerLabels, copy.removeSpeakerLabelsHint, removeSpeakerLabels, setRemoveSpeakerLabels)}
              {optionRow(copy.removeUppercaseSdh, copy.removeUppercaseSdhHint, removeUppercaseSdh, setRemoveUppercaseSdh)}
              {optionRow(copy.removeRepeatedQuoteMarks, copy.removeRepeatedQuoteMarksHint, removeRepeatedQuoteMarks, setRemoveRepeatedQuoteMarks)}

              <Divider style={{ marginBlock: token.marginXS }} />
              <Text className="font-mono" style={{ color: token.colorTextTertiary, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                STRUCTURE
              </Text>
              {optionRow(copy.mergeSameTimestamps, copy.mergeSameTimestampsHint, mergeSameTimestamps, setMergeSameTimestamps)}
              {optionRow(copy.mergeLinesWithinCue, copy.mergeLinesWithinCueHint, mergeLinesWithinCue, setMergeLinesWithinCue)}
            </Flex>
          </PageCard>
        </Col>

        {processedText && (
          <Col span={24}>
            <ResultCard
              title={copy.resultTitle}
              content={processedText}
              onChange={setProcessedText}
              stats={resultStats}
              onCopy={() => copyToClipboard(processedText)}
              onExport={handleExport}
              textDirection="auto"
              rows={12}
            />
          </Col>
        )}

        {hasProcessed && (
          <Col span={24}>
            <PageCard
              title={
                <Space>
                  <ProfileOutlined /> {copy.logTitle}
                </Space>
              }>
              <Text style={{ display: "block", marginBottom: token.marginSM, color: token.colorTextSecondary }}>{processSummary}</Text>
              <TextArea value={logText} rows={Math.min(10, Math.max(4, processLogs.length + 1))} readOnly dir="auto" aria-label={copy.logTitle} />
            </PageCard>
          </Col>
        )}
      </Row>
    </Spin>
  );
};

export default SubtitlePreprocessor;
