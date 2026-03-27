"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { App, Button, Card, Checkbox, Col, Divider, Flex, Input, Row, Skeleton, Space, Typography, Upload } from "antd";
import { ClearOutlined, CopyOutlined, DownloadOutlined, InboxOutlined, ToolOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import useFileUpload from "@/app/hooks/useFileUpload";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useTextStats } from "@/app/hooks/useTextStats";
import { downloadFile, getFileTypePresetConfig } from "@/app/utils";
import { preprocessSubtitleContent, type SubtitleFileType, type SubtitlePreprocessLogEntry } from "./local-subtitle-tools/localSubtitleUtils";

const { Dragger } = Upload;
const { TextArea } = Input;
const { Paragraph, Text } = Typography;

const uploadFileTypes = getFileTypePresetConfig("subtitle");

const PREPROCESSOR_TEXT = {
  zh: {
    tabLabel: "预处理区",
    title: "字幕预处理",
    description: "先清理 SDH 提示，再按选项合并字幕内容。处理完成后可以保存到本地。",
    optionsTitle: "预处理选项",
    removeBracketedSdhWithoutKeywordCheck: "括号匹配即移除，不判断关键词",
    removeBracketedSdhWithoutKeywordCheckHint: "默认会结合中英日韩常见 SDH 关键词判断；勾选后只要命中括号形式就会移除，更激进。",
    removeRoundBracketSdh: "移除圆括号 SDH",
    removeRoundBracketSdhHint: "包含 () 和 （），常见于欧美、日韩字幕： (sighs)、(whispering)、（叹气）、（旁白）",
    removeSquareBracketSdh: "移除方括号 SDH",
    removeSquareBracketSdhHint: "包含 [] 和 ［］，常见于平台字幕： [MUSIC]、[door opens]、[笑]、[拍手]",
    removeCornerBracketSdh: "移除【】类 SDH",
    removeCornerBracketSdhHint: "常见于中文、日系熟肉或电视字幕： 【脚步声】、【旁白】、【电话铃声】",
    removeHesitationEllipses: "清理中英文犹豫停顿",
    removeHesitationEllipsesHint: "仅处理 SRT/VTT。会清理常见台词里的重复词口吃，以及犹豫词后的省略号或逗号，例如 我……我、I... I、呃……、Uh...、嗯，、Well,",
    removeInlineFormattingTags: "移除内联格式标记",
    removeInlineFormattingTagsHint: "用于清理 SRT/VTT 中的 <i>、<b>、<u>、<font> 以及 {\\an8} 这类内联样式标记",
    removeSpeakerLabels: "移除说话人标签",
    removeSpeakerLabelsHint: "例如 SOME ONE SAY: hello、JOHN: hello",
    removeUppercaseSdh: "移除全大写音效提示",
    removeUppercaseSdhHint: "例如 MUSIC、DOOR OPENS、LOUD BREATHING",
    mergeSameTimestamps: "合并相同时间戳的字幕",
    mergeSameTimestampsHint: "同一时间范围出现多条字幕时，用空格合并成一条",
    mergeLinesWithinCue: "合并同一字幕块内多行",
    mergeLinesWithinCueHint: "同一时间戳里的多行内容会合并到同一行",
    resultTitle: "预处理结果",
    noProcessedText: "请先完成字幕预处理",
    sentToTranslate: "已提交到翻译区",
    sendToTranslate: "提交到翻译区",
    processedStats: (output: number, original: number, removed: number, merged: number) => `输出 ${output}/${original} 条，移除 ${removed} 条，合并 ${merged} 处`,
    logTitle: "SDH 清理日志",
    noLogs: "这次处理没有移除任何 SDH 提示。",
    roundBracketLog: "圆括号 SDH",
    squareBracketLog: "方括号 SDH",
    cornerBracketLog: "【】类 SDH",
    uppercaseLog: "全大写音效提示",
    buildInfoTitle: "版本信息",
    versionLabel: "版本",
    buildTimeLabel: "构建时间",
    unknownBuildTime: "未知",
  },
  en: {
    tabLabel: "Preprocess",
    title: "Subtitle Preprocess",
    description: "Clean SDH cues before translation, then merge subtitle content based on your options. You can save the result locally after processing.",
    optionsTitle: "Preprocess Options",
    removeBracketedSdhWithoutKeywordCheck: "Remove bracketed text without keyword checks",
    removeBracketedSdhWithoutKeywordCheckHint: "By default bracketed text is checked against common SDH keywords. Enable this to remove any matched bracketed text more aggressively.",
    removeRoundBracketSdh: "Remove round-bracket SDH",
    removeRoundBracketSdhHint: "Includes () and （）. Common in Western and East Asian subtitles: (sighs), (whispering), （旁白）",
    removeSquareBracketSdh: "Remove square-bracket SDH",
    removeSquareBracketSdhHint: "Includes [] and ［］. Common in streaming/platform captions: [MUSIC], [door opens], [笑]",
    removeCornerBracketSdh: "Remove 【】 SDH",
    removeCornerBracketSdhHint: "Common in Chinese and Japanese fan/TV subtitles: 【脚步声】, 【旁白】, 【电话铃声】",
    removeHesitationEllipses: "Clean hesitation pauses",
    removeHesitationEllipsesHint: "Only affects SRT/VTT. Cleans repeated-word stammers plus ellipses or commas after common hesitation fillers, such as 我……我, I... I, 呃……, Uh..., 嗯，, and Well,",
    removeInlineFormattingTags: "Remove inline formatting tags",
    removeInlineFormattingTagsHint: "Cleans SRT/VTT tags such as <i>, <b>, <u>, <font>, and inline markers like {\\an8}",
    removeSpeakerLabels: "Remove speaker labels",
    removeSpeakerLabelsHint: "Examples: SOME ONE SAY: hello, JOHN: hello",
    removeUppercaseSdh: "Remove uppercase sound cues",
    removeUppercaseSdhHint: "Examples: MUSIC, DOOR OPENS, LOUD BREATHING",
    mergeSameTimestamps: "Merge subtitles with identical timestamps",
    mergeSameTimestampsHint: "Combine subtitles in the same time range into one line with spaces",
    mergeLinesWithinCue: "Merge multi-line subtitles inside one cue",
    mergeLinesWithinCueHint: "Join multiple lines inside the same subtitle cue with spaces",
    resultTitle: "Preprocessed Result",
    noProcessedText: "Process the subtitle content first",
    sentToTranslate: "Sent to the translation tab",
    sendToTranslate: "Send to Translate",
    processedStats: (output: number, original: number, removed: number, merged: number) => `Kept ${output}/${original} cues, removed ${removed}, merged ${merged}`,
    logTitle: "SDH Cleanup Log",
    noLogs: "No SDH cues were removed in this run.",
    roundBracketLog: "Round-bracket SDH",
    squareBracketLog: "Square-bracket SDH",
    cornerBracketLog: "【】 SDH",
    uppercaseLog: "Uppercase sound cue",
    buildInfoTitle: "Build Info",
    versionLabel: "Version",
    buildTimeLabel: "Build Time",
    unknownBuildTime: "Unknown",
  },
} as const;

const buildProcessedFileName = (originalFileName: string, fileType: SubtitleFileType) => {
  const lastDotIndex = originalFileName.lastIndexOf(".");
  const baseName = lastDotIndex > 0 ? originalFileName.slice(0, lastDotIndex) : originalFileName || "subtitle";
  return `${baseName}_preprocessed.${fileType}`;
};

const SubtitlePreprocessor = () => {
  const locale = useLocale();
  const t = useTranslations("common");
  const tSubtitle = useTranslations("subtitle");
  const { message } = App.useApp();
  const { copyToClipboard } = useCopyToClipboard();
  const uiText = useMemo(() => (locale.startsWith("zh") ? PREPROCESSOR_TEXT.zh : PREPROCESSOR_TEXT.en), [locale]);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;
  const formattedBuildTime = useMemo(() => {
    if (!buildTime) {
      return uiText.unknownBuildTime;
    }

    const parsedTime = new Date(buildTime);
    if (Number.isNaN(parsedTime.getTime())) {
      return buildTime;
    }

    return parsedTime.toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, [buildTime, locale, uiText.unknownBuildTime]);
  const {
    isFileProcessing,
    fileList,
    sourceText,
    setSourceText,
    handleFileUpload,
    handleUploadRemove,
    handleUploadChange,
    resetUpload,
  } = useFileUpload();
  const [processedText, setProcessedText] = useState("");
  const [processedFileType, setProcessedFileType] = useState<SubtitleFileType | null>(null);
  const [processLogs, setProcessLogs] = useState<SubtitlePreprocessLogEntry[]>([]);
  const [sourceFileName, setSourceFileName] = useState("");
  const [processSummary, setProcessSummary] = useState("");
  const isHydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [removeRoundBracketSdh, setRemoveRoundBracketSdh] = useLocalStorage("subtitlePreprocessRemoveRoundBracketSdh", true);
  const [removeSquareBracketSdh, setRemoveSquareBracketSdh] = useLocalStorage("subtitlePreprocessRemoveSquareBracketSdh", true);
  const [removeCornerBracketSdh, setRemoveCornerBracketSdh] = useLocalStorage("subtitlePreprocessRemoveCornerBracketSdh", true);
  const [removeBracketedSdhWithoutKeywordCheck, setRemoveBracketedSdhWithoutKeywordCheck] = useLocalStorage("subtitlePreprocessRemoveBracketedSdhWithoutKeywordCheck", true);
  const [removeHesitationEllipses, setRemoveHesitationEllipses] = useLocalStorage("subtitlePreprocessRemoveHesitationEllipses", true);
  const [removeInlineFormattingTags, setRemoveInlineFormattingTags] = useLocalStorage("subtitlePreprocessRemoveInlineFormattingTags", true);
  const [removeSpeakerLabels, setRemoveSpeakerLabels] = useLocalStorage("subtitlePreprocessRemoveSpeakerLabels", true);
  const [removeUppercaseSdh, setRemoveUppercaseSdh] = useLocalStorage("subtitlePreprocessRemoveUppercaseSdh", true);
  const [mergeSameTimestamps, setMergeSameTimestamps] = useLocalStorage("subtitlePreprocessMergeSameTimestamps", true);
  const [mergeLinesWithinCue, setMergeLinesWithinCue] = useLocalStorage("subtitlePreprocessMergeLinesWithinCue", true);

  const sourceStats = useTextStats(sourceText);
  const resultStats = useTextStats(processedText);
  const logText =
    processLogs.length === 0
      ? uiText.noLogs
      : processLogs
          .map((log) => {
            const label =
              log.type === "round_bracket_sdh"
                ? uiText.roundBracketLog
                : log.type === "square_bracket_sdh"
                  ? uiText.squareBracketLog
                  : log.type === "corner_bracket_sdh"
                    ? uiText.cornerBracketLog
                    : uiText.uppercaseLog;
            return `[${label}] ${log.key} ${log.text}`.trim();
          })
          .join("\n");

  const clearProcessedResult = () => {
    setProcessedText("");
    setProcessedFileType(null);
    setProcessLogs([]);
    setProcessSummary("");
  };

  const clearSourceFileName = () => {
    setSourceFileName("");
  };

  const handleProcess = () => {
    if (!sourceText.trim()) {
      message.error(tSubtitle("noSourceText"));
      return;
    }

    const result = preprocessSubtitleContent(sourceText, {
      removeRoundBracketSdh,
      removeSquareBracketSdh,
      removeCornerBracketSdh,
      removeBracketedSdhWithoutKeywordCheck,
      removeHesitationEllipses,
      removeInlineFormattingTags,
      removeSpeakerLabels,
      removeUppercaseSdh,
      mergeSameTimestamps,
      mergeLinesWithinCue,
    });

    if (!result) {
      message.error(tSubtitle("unsupportedSub"));
      return;
    }

    setProcessedText(result.content);
    setProcessedFileType(result.fileType);
    setProcessLogs(result.logs);
    setProcessSummary(
      uiText.processedStats(result.stats.outputCueCount, result.stats.originalCueCount, result.stats.removedCueCount, result.stats.mergedCueCount),
    );
    message.success(t("textProcessed"));
  };

  const handleDownload = async () => {
    if (!processedText || !processedFileType) {
      message.warning(uiText.noProcessedText);
      return;
    }

    const fileName = buildProcessedFileName(sourceFileName || "subtitle", processedFileType);
    await downloadFile(processedText, fileName);
    message.success(`${t("exportedFile")}: ${fileName}`);
  };

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={14} xl={15}>
        <Card
          title={
            <Space>
              <ToolOutlined /> {uiText.title}
            </Space>
          }
          extra={
            <Button
              type="text"
              danger
              onClick={() => {
                resetUpload();
                clearSourceFileName();
                clearProcessedResult();
                message.success(t("resetUploadSuccess"));
              }}
              icon={<ClearOutlined />}>
              {t("resetUpload")}
            </Button>
          }
          className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300">
          <Paragraph type="secondary" className="!mb-4">
            {uiText.description}
          </Paragraph>

          <Dragger
            customRequest={({ file }) => {
              clearProcessedResult();
              resetUpload();
              setSourceFileName((file as File).name || "");
              handleFileUpload(file as File);
            }}
            accept={uploadFileTypes.accept}
            multiple={false}
            maxCount={1}
            showUploadList
            onRemove={(file) => {
              clearProcessedResult();
              if (fileList.length <= 1) {
                clearSourceFileName();
              }
              return handleUploadRemove(file);
            }}
            onChange={(info) => {
              clearProcessedResult();
              setSourceFileName(info.file?.name || sourceFileName);
              handleUploadChange(info);
            }}
            fileList={fileList}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{t("dragAndDropText")}</p>
            <p className="ant-upload-hint">
              {t("supportedFormats")} {uploadFileTypes.label}
            </p>
          </Dragger>

          <TextArea
            placeholder={t("pasteUploadContent")}
            value={sourceStats.isEditable ? sourceText : sourceStats.displayText}
            onChange={
              sourceStats.isEditable
                ? (e) => {
                    clearProcessedResult();
                    setSourceText(e.target.value);
                  }
                : undefined
            }
            rows={20}
            className="mt-4"
            allowClear
            readOnly={!sourceStats.isEditable}
            aria-label={uiText.title}
          />

          {sourceText && (
            <Flex justify="end" className="mt-2">
              <Text type="secondary" className="!text-xs">
                {sourceStats.charCount} {t("charLabel")} / {sourceStats.lineCount} {t("lineLabel")}
              </Text>
            </Flex>
          )}

          <Divider />

          <Button type="primary" size="large" block icon={<ToolOutlined />} loading={isFileProcessing} onClick={handleProcess}>
            {t("startProcess")}
          </Button>
        </Card>
      </Col>

      <Col xs={24} lg={10} xl={9}>
        <Card
          title={
            <Space>
              <ToolOutlined /> {uiText.optionsTitle}
            </Space>
          }
          className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300">
          {isHydrated ? (
            <Flex vertical gap="middle">
              <div>
                <Checkbox checked={removeRoundBracketSdh} onChange={(e) => setRemoveRoundBracketSdh(e.target.checked)}>
                  {uiText.removeRoundBracketSdh}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeRoundBracketSdhHint}</div>
              </div>

              <div>
                <Checkbox checked={removeSquareBracketSdh} onChange={(e) => setRemoveSquareBracketSdh(e.target.checked)}>
                  {uiText.removeSquareBracketSdh}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeSquareBracketSdhHint}</div>
              </div>

              <div>
                <Checkbox checked={removeCornerBracketSdh} onChange={(e) => setRemoveCornerBracketSdh(e.target.checked)}>
                  {uiText.removeCornerBracketSdh}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeCornerBracketSdhHint}</div>
              </div>

              <div>
                <Checkbox checked={removeBracketedSdhWithoutKeywordCheck} onChange={(e) => setRemoveBracketedSdhWithoutKeywordCheck(e.target.checked)}>
                  {uiText.removeBracketedSdhWithoutKeywordCheck}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeBracketedSdhWithoutKeywordCheckHint}</div>
              </div>

              <div>
                <Checkbox checked={removeHesitationEllipses} onChange={(e) => setRemoveHesitationEllipses(e.target.checked)}>
                  {uiText.removeHesitationEllipses}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeHesitationEllipsesHint}</div>
              </div>

            <div>
              <Checkbox checked={removeInlineFormattingTags} onChange={(e) => setRemoveInlineFormattingTags(e.target.checked)}>
                {uiText.removeInlineFormattingTags}
              </Checkbox>
              <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeInlineFormattingTagsHint}</div>
            </div>

            <div>
              <Checkbox checked={removeSpeakerLabels} onChange={(e) => setRemoveSpeakerLabels(e.target.checked)}>
                  {uiText.removeSpeakerLabels}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeSpeakerLabelsHint}</div>
              </div>

              <div>
                <Checkbox checked={removeUppercaseSdh} onChange={(e) => setRemoveUppercaseSdh(e.target.checked)}>
                  {uiText.removeUppercaseSdh}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.removeUppercaseSdhHint}</div>
              </div>

              <Divider className="!my-1" />

              <div>
                <Checkbox checked={mergeSameTimestamps} onChange={(e) => setMergeSameTimestamps(e.target.checked)}>
                  {uiText.mergeSameTimestamps}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.mergeSameTimestampsHint}</div>
              </div>

              <div>
                <Checkbox checked={mergeLinesWithinCue} onChange={(e) => setMergeLinesWithinCue(e.target.checked)}>
                  {uiText.mergeLinesWithinCue}
                </Checkbox>
                <div className="pl-6 pt-1 text-xs text-gray-500">{uiText.mergeLinesWithinCueHint}</div>
              </div>

              <Divider className="!my-1" />

              <div className="text-xs text-gray-500">
                <div className="font-medium text-gray-700">{uiText.buildInfoTitle}</div>
                <div className="pt-1">
                  {uiText.versionLabel}: {appVersion}
                </div>
                <div>
                  {uiText.buildTimeLabel}: {formattedBuildTime}
                </div>
              </div>
            </Flex>
          ) : (
            <Skeleton active paragraph={{ rows: 8 }} title={false} />
          )}
        </Card>
      </Col>

      {processedText && (
        <Col span={24}>
          <Card
            title={uiText.resultTitle}
            className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300"
            extra={
              <Space wrap>
                <Button type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(processedText)}>
                  {t("copy")}
                </Button>
                <Button type="primary" ghost icon={<DownloadOutlined />} onClick={handleDownload}>
                  {t("exportFile")}
                </Button>
              </Space>
            }>
            <TextArea
              value={resultStats.isEditable ? processedText : resultStats.displayText}
              onChange={resultStats.isEditable ? (e) => setProcessedText(e.target.value) : undefined}
              rows={10}
              readOnly={!resultStats.isEditable}
              aria-label={uiText.resultTitle}
            />
            <Flex justify="end" className="mt-2">
              <Text type="secondary" className="!text-xs">
                {resultStats.charCount} {t("charLabel")} / {resultStats.lineCount} {t("lineLabel")}
              </Text>
            </Flex>
          </Card>
          {processSummary && (
            <Text type="secondary" className="mt-3 block">
              {processSummary}
            </Text>
          )}
        </Col>
      )}

      {(processedText || processLogs.length > 0) && (
        <Col span={24}>
          <Card title={uiText.logTitle} className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300">
            <TextArea value={logText} rows={8} readOnly aria-label={uiText.logTitle} />
          </Card>
        </Col>
      )}
    </Row>
  );
};

export default SubtitlePreprocessor;
