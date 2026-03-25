"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { App, Button, Card, Col, Divider, Flex, Input, Radio, Row, Segmented, Skeleton, Space, Typography, Upload } from "antd";
import { ClearOutlined, CopyOutlined, DownloadOutlined, InboxOutlined, SaveOutlined, SyncOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import useFileUpload from "@/app/hooks/useFileUpload";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { downloadFile, getFileTypePresetConfig } from "@/app/utils";
import {
  bilingualAssHdrTemplate,
  bilingualAssSdrTemplate,
  composeBilingualSubtitle,
  type BilingualComposeLogEntry,
} from "./local-subtitle-tools/localSubtitleUtils";

const { Dragger } = Upload;
const { TextArea } = Input;
const { Paragraph, Text } = Typography;

const uploadFileTypes = getFileTypePresetConfig("subtitle");

const BILINGUAL_TEXT = {
  zh: {
    tabLabel: "双语合成",
    title: "双语字幕合成",
    description: "上传原文字幕和译文字幕，以译文时间轴为基准自动合成双语字幕。支持导出 SRT 和 ASS，并记录未匹配的字幕。",
    originalTitle: "原文字幕",
    translatedTitle: "译文字幕",
    optionsTitle: "合成选项",
    outputFormat: "输出格式",
    assTemplateMode: "ASS 模板",
    hdrTemplate: "HDR 模板",
    sdrTemplate: "SDR 模板",
    templateEditor: "ASS 模板编辑器",
    templateHint: "Chs 用于译文样式，Eng 用于原文样式，Tip 已预留。",
    saveTemplate: "保存模板",
    templateSaved: "模板已保存",
    startCompose: "开始合成",
    resultTitle: "合成结果",
    logTitle: "未匹配日志",
    noLogs: "本次合成没有未匹配字幕。",
    noSourceText: "请上传或粘贴原文字幕和译文字幕",
    unsupportedSubtitle: "当前仅支持 SRT、VTT、ASS 参与双语合成",
    composedSuccess: "双语字幕已生成",
    translatedUnmatched: "译文未匹配",
    originalUnmatched: "原文未匹配",
    saveResult: "导出双语字幕",
    resultSummary: (matched: number, translatedOnly: number, originalOnly: number, total: number) =>
      `已匹配 ${matched} 条，译文未匹配 ${translatedOnly} 条，原文未匹配 ${originalOnly} 条，输出共 ${total} 条`,
  },
  en: {
    tabLabel: "Bilingual",
    title: "Bilingual Subtitle Composer",
    description: "Upload original and translated subtitles, then compose bilingual subtitles using the translated timeline as the base. Export as SRT or ASS and review unmatched cues below.",
    originalTitle: "Original Subtitle",
    translatedTitle: "Translated Subtitle",
    optionsTitle: "Compose Options",
    outputFormat: "Output Format",
    assTemplateMode: "ASS Template",
    hdrTemplate: "HDR Template",
    sdrTemplate: "SDR Template",
    templateEditor: "ASS Template Editor",
    templateHint: "Chs is used for translated lines, Eng for original lines, and Tip is reserved.",
    saveTemplate: "Save Template",
    templateSaved: "Template saved",
    startCompose: "Compose Subtitle",
    resultTitle: "Composed Result",
    logTitle: "Unmatched Log",
    noLogs: "No unmatched subtitle cues in this run.",
    noSourceText: "Please upload or paste both original and translated subtitles",
    unsupportedSubtitle: "Only SRT, VTT, and ASS are supported for bilingual composition",
    composedSuccess: "Bilingual subtitle generated",
    translatedUnmatched: "Translated unmatched",
    originalUnmatched: "Original unmatched",
    saveResult: "Export Bilingual Subtitle",
    resultSummary: (matched: number, translatedOnly: number, originalOnly: number, total: number) =>
      `Matched ${matched}, translated-only ${translatedOnly}, original-only ${originalOnly}, output ${total}`,
  },
} as const;

const buildBilingualFileName = (translatedFileName: string | undefined, outputFormat: "srt" | "ass") => {
  if (!translatedFileName) {
    return `subtitle_bilingual.${outputFormat}`;
  }

  const lastDotIndex = translatedFileName.lastIndexOf(".");
  const baseName = lastDotIndex > 0 ? translatedFileName.slice(0, lastDotIndex) : translatedFileName;
  return `${baseName}_bilingual.${outputFormat}`;
};

const formatLogTime = (ms: number) => {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = safeMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
};

const SubtitleBilingualComposer = () => {
  const locale = useLocale();
  const t = useTranslations("common");
  const { message } = App.useApp();
  const { copyToClipboard } = useCopyToClipboard();
  const uiText = useMemo(() => (locale.startsWith("zh") ? BILINGUAL_TEXT.zh : BILINGUAL_TEXT.en), [locale]);
  const isHydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const originalUpload = useFileUpload();
  const translatedUpload = useFileUpload();

  const [outputFormat, setOutputFormat] = useLocalStorage<"srt" | "ass">("subtitleBilingualOutputFormat", "srt");
  const [assTemplateMode, setAssTemplateMode] = useLocalStorage<"hdr" | "sdr">("subtitleBilingualAssTemplateMode", "sdr");
  const [savedHdrTemplate, setSavedHdrTemplate] = useLocalStorage("subtitleBilingualHdrTemplate", bilingualAssHdrTemplate);
  const [savedSdrTemplate, setSavedSdrTemplate] = useLocalStorage("subtitleBilingualSdrTemplate", bilingualAssSdrTemplate);
  const [hdrTemplateDraft, setHdrTemplateDraft] = useState(savedHdrTemplate);
  const [sdrTemplateDraft, setSdrTemplateDraft] = useState(savedSdrTemplate);
  const [resultText, setResultText] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const [logs, setLogs] = useState<BilingualComposeLogEntry[]>([]);
  const [translatedSourceFileName, setTranslatedSourceFileName] = useState("");

  const isProcessing = originalUpload.isFileProcessing || translatedUpload.isFileProcessing;
  const currentTemplateDraft = assTemplateMode === "hdr" ? hdrTemplateDraft : sdrTemplateDraft;
  const currentSavedTemplate = assTemplateMode === "hdr" ? savedHdrTemplate : savedSdrTemplate;
  const logText =
    logs.length === 0
      ? uiText.noLogs
      : logs
          .map((log) => {
            const label = log.type === "translated_unmatched" ? uiText.translatedUnmatched : uiText.originalUnmatched;
            return `[${label}] ${formatLogTime(log.startMs)} --> ${formatLogTime(log.endMs)} ${log.text}`;
          })
          .join("\n");

  const clearResults = () => {
    setResultText("");
    setResultSummary("");
    setLogs([]);
  };

  const handleUpload = (upload: ReturnType<typeof useFileUpload>, file: File) => {
    clearResults();
    upload.resetUpload();
    upload.handleFileUpload(file);
  };

  const renderUploadCard = (title: string, upload: ReturnType<typeof useFileUpload>) => (
    <Card
      title={title}
      className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300 h-full"
      extra={
        <Button
          type="text"
          danger
          icon={<ClearOutlined />}
          onClick={() => {
            upload.resetUpload();
            if (upload === translatedUpload) {
              setTranslatedSourceFileName("");
            }
            clearResults();
          }}>
          {t("resetUpload")}
        </Button>
      }>
      <Dragger
        customRequest={({ file }) => {
          if (upload === translatedUpload) {
            setTranslatedSourceFileName((file as File).name || "");
          }
          handleUpload(upload, file as File);
        }}
        accept={uploadFileTypes.accept}
        multiple={false}
        maxCount={1}
        showUploadList
        onRemove={(file) => {
          clearResults();
          if (upload === translatedUpload && upload.fileList.length <= 1) {
            setTranslatedSourceFileName("");
          }
          return upload.handleUploadRemove(file);
        }}
        onChange={(info) => {
          clearResults();
          if (upload === translatedUpload) {
            setTranslatedSourceFileName(info.file?.name || translatedSourceFileName);
          }
          upload.handleUploadChange(info);
        }}
        fileList={upload.fileList}>
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
        value={upload.sourceText}
        onChange={(e) => {
          clearResults();
          upload.setSourceText(e.target.value);
        }}
        rows={10}
        className="mt-4"
        allowClear
        aria-label={title}
      />
    </Card>
  );

  const handleSaveTemplate = () => {
    if (assTemplateMode === "hdr") {
      setSavedHdrTemplate(hdrTemplateDraft);
    } else {
      setSavedSdrTemplate(sdrTemplateDraft);
    }
    message.success(uiText.templateSaved);
  };

  const handleCompose = () => {
    if (!originalUpload.sourceText.trim() || !translatedUpload.sourceText.trim()) {
      message.error(uiText.noSourceText);
      return;
    }

    const result = composeBilingualSubtitle(originalUpload.sourceText, translatedUpload.sourceText, {
      outputFormat,
      assTemplate: currentSavedTemplate,
    });

    if (!result) {
      message.error(uiText.unsupportedSubtitle);
      return;
    }

    setResultText(result.content);
    setLogs(result.logs);
    setResultSummary(resultSummaryText(result.matchedCount, result.translatedOnlyCount, result.originalOnlyCount, result.outputCueCount));
    message.success(uiText.composedSuccess);
  };

  const resultSummaryText = (matched: number, translatedOnly: number, originalOnly: number, total: number) =>
    uiText.resultSummary(matched, translatedOnly, originalOnly, total);

  const handleExport = async () => {
    if (!resultText) {
      return;
    }

    const fileName = buildBilingualFileName(translatedSourceFileName || translatedUpload.fileList[0]?.name, outputFormat);
    await downloadFile(resultText, fileName);
    message.success(`${t("exportedFile")}: ${fileName}`);
  };

  return (
    <Row gutter={[24, 24]}>
      <Col span={24}>
        <Paragraph type="secondary" className="!mb-0">
          {uiText.description}
        </Paragraph>
      </Col>

      <Col xs={24} lg={12}>
        {renderUploadCard(uiText.originalTitle, originalUpload)}
      </Col>

      <Col xs={24} lg={12}>
        {renderUploadCard(uiText.translatedTitle, translatedUpload)}
      </Col>

      <Col span={24}>
        <Card
          title={
            <Space>
              <SyncOutlined /> {uiText.optionsTitle}
            </Space>
          }
          className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300">
          {isHydrated ? (
            <Flex vertical gap="middle">
              <div>
                <Text strong>{uiText.outputFormat}</Text>
                <Segmented
                  className="mt-2"
                  value={outputFormat}
                  onChange={(value) => setOutputFormat(value as "srt" | "ass")}
                  options={[
                    { label: "SRT", value: "srt" },
                    { label: "ASS", value: "ass" },
                  ]}
                />
              </div>

              {outputFormat === "ass" && (
                <>
                  <Divider className="!my-1" />

                  <div>
                    <Text strong>{uiText.assTemplateMode}</Text>
                    <div className="mt-2">
                      <Radio.Group
                        value={assTemplateMode}
                        onChange={(e) => setAssTemplateMode(e.target.value as "hdr" | "sdr")}
                        optionType="button"
                        buttonStyle="solid">
                        <Radio.Button value="hdr">{uiText.hdrTemplate}</Radio.Button>
                        <Radio.Button value="sdr">{uiText.sdrTemplate}</Radio.Button>
                      </Radio.Group>
                    </div>
                  </div>

                  <div>
                    <Flex justify="space-between" align="center" className="mb-2">
                      <div>
                        <Text strong>{uiText.templateEditor}</Text>
                        <div className="text-xs text-gray-500">{uiText.templateHint}</div>
                      </div>
                      <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveTemplate}>
                        {uiText.saveTemplate}
                      </Button>
                    </Flex>

                    <TextArea
                      value={currentTemplateDraft}
                      onChange={(e) => {
                        if (assTemplateMode === "hdr") {
                          setHdrTemplateDraft(e.target.value);
                          return;
                        }
                        setSdrTemplateDraft(e.target.value);
                      }}
                      rows={12}
                      aria-label={uiText.templateEditor}
                    />
                  </div>
                </>
              )}

              <Flex justify="end">
                <Button type="primary" size="large" icon={<SyncOutlined />} loading={isProcessing} onClick={handleCompose}>
                  {uiText.startCompose}
                </Button>
              </Flex>
            </Flex>
          ) : (
            <Skeleton active paragraph={{ rows: outputFormat === "ass" ? 10 : 4 }} title={false} />
          )}
        </Card>
      </Col>

      {resultText && (
        <Col span={24}>
          <Card
            title={uiText.resultTitle}
            className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300"
            extra={
              <Space wrap>
                <Button type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(resultText)}>
                  {t("copy")}
                </Button>
                <Button type="primary" ghost icon={<DownloadOutlined />} onClick={handleExport}>
                  {uiText.saveResult}
                </Button>
              </Space>
            }>
            <TextArea value={resultText} onChange={(e) => setResultText(e.target.value)} rows={12} aria-label={uiText.resultTitle} />
            {resultSummary && (
              <Text type="secondary" className="mt-3 block">
                {resultSummary}
              </Text>
            )}
          </Card>
        </Col>
      )}

      {(resultText || logs.length > 0) && (
        <Col span={24}>
          <Card title={uiText.logTitle} className="shadow-md border-transparent hover:shadow-lg transition-shadow duration-300">
            <TextArea value={logText} rows={8} readOnly aria-label={uiText.logTitle} />
          </Card>
        </Col>
      )}
    </Row>
  );
};

export default SubtitleBilingualComposer;
