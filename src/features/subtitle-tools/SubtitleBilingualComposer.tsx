"use client";

import { useCallback, useState } from "react";
import {
  App,
  Button,
  Col,
  Divider,
  Flex,
  Input,
  Row,
  Segmented,
  Space,
  Spin,
  Typography,
  Upload,
  theme,
} from "antd";
import {
  ClearOutlined,
  EditOutlined,
  InboxOutlined,
  ProfileOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageCard from "@/app/components/styled/PageCard";
import ResultCard from "@/app/components/ResultCard";
import SourceArea from "@/app/components/SourceArea";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useTextStats } from "@/app/hooks/useTextStats";
import { downloadFile, getErrorMessage } from "@/app/utils";
import AssTemplateDrawer from "./AssTemplateDrawer";
import { getSubtitleToolsCopy } from "./copy";
import { useSubtitleFileInput } from "./hooks/useSubtitleFileInput";
import {
  bilingualAssHdrTemplate,
  bilingualAssSdrTemplate,
} from "./lib/assTemplates";
import { composeBilingualSubtitle } from "./lib/composeBilingualSubtitle";
import {
  buildBilingualFileName,
  formatBilingualLogLine,
} from "./lib/fileNames";
import type { BilingualComposeLogEntry } from "./lib/subtitleTypes";

const { Dragger } = Upload;
const { TextArea } = Input;
const { Paragraph, Text } = Typography;
const SUBTITLE_ACCEPT = ".srt,.vtt,.ass,.ssa";

type AssTemplateMode = "hdr" | "sdr";
type OutputFormat = "srt" | "ass";

const SubtitleBilingualComposer = () => {
  const locale = useLocale();
  const t = useTranslations("common");
  const copy = getSubtitleToolsCopy(locale).composer;
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { copyToClipboard } = useCopyToClipboard();

  const onReadError = useCallback(
    (error: unknown) =>
      message.error(`${t("fileReadFailed")}: ${getErrorMessage(error)}`),
    [message, t],
  );
  const originalInput = useSubtitleFileInput({ onError: onReadError });
  const translatedInput = useSubtitleFileInput({ onError: onReadError });

  const [outputFormat, setOutputFormat] = useLocalStorage<OutputFormat>(
    "subtitleBilingualOutputFormat",
    "srt",
  );
  const [assTemplateMode, setAssTemplateMode] =
    useLocalStorage<AssTemplateMode>(
      "subtitleBilingualAssTemplateMode",
      "sdr",
    );
  const [savedHdrTemplate, setSavedHdrTemplate] = useLocalStorage(
    "subtitleBilingualHdrTemplate",
    bilingualAssHdrTemplate,
  );
  const [savedSdrTemplate, setSavedSdrTemplate] = useLocalStorage(
    "subtitleBilingualSdrTemplate",
    bilingualAssSdrTemplate,
  );

  const [hdrTemplateDraft, setHdrTemplateDraft] = useState(
    bilingualAssHdrTemplate,
  );
  const [sdrTemplateDraft, setSdrTemplateDraft] = useState(
    bilingualAssSdrTemplate,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resultText, setResultText] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const [logs, setLogs] = useState<BilingualComposeLogEntry[]>([]);
  const [hasComposed, setHasComposed] = useState(false);

  const originalStats = useTextStats(originalInput.sourceText);
  const translatedStats = useTextStats(translatedInput.sourceText);
  const resultStats = useTextStats(resultText);
  const isReading = originalInput.isReading || translatedInput.isReading;
  const currentSavedTemplate =
    assTemplateMode === "hdr" ? savedHdrTemplate : savedSdrTemplate;
  const currentTemplateDraft =
    assTemplateMode === "hdr" ? hdrTemplateDraft : sdrTemplateDraft;

  const clearResults = () => {
    setResultText("");
    setResultSummary("");
    setLogs([]);
    setHasComposed(false);
  };

  const openTemplateDrawer = () => {
    if (assTemplateMode === "hdr") {
      setHdrTemplateDraft(savedHdrTemplate);
    } else {
      setSdrTemplateDraft(savedSdrTemplate);
    }
    setDrawerOpen(true);
  };

  const handleSaveTemplate = () => {
    if (assTemplateMode === "hdr") {
      setSavedHdrTemplate(hdrTemplateDraft);
    } else {
      setSavedSdrTemplate(sdrTemplateDraft);
    }
    clearResults();
    message.success(copy.templateSaved);
  };

  const handleResetTemplate = () => {
    if (assTemplateMode === "hdr") {
      setHdrTemplateDraft(bilingualAssHdrTemplate);
      setSavedHdrTemplate(bilingualAssHdrTemplate);
    } else {
      setSdrTemplateDraft(bilingualAssSdrTemplate);
      setSavedSdrTemplate(bilingualAssSdrTemplate);
    }
    clearResults();
    message.success(copy.templateReset);
  };

  const handleCompose = () => {
    if (
      !originalInput.sourceText.trim() ||
      !translatedInput.sourceText.trim()
    ) {
      message.error(copy.noSourceText);
      return;
    }

    const result = composeBilingualSubtitle(
      originalInput.sourceText,
      translatedInput.sourceText,
      {
        outputFormat,
        assTemplate: outputFormat === "ass" ? currentSavedTemplate : undefined,
      },
    );

    if (!result) {
      message.error(copy.unsupportedSubtitle);
      return;
    }

    setResultText(result.content);
    setResultSummary(
      copy.resultSummary(
        result.matchedCount,
        result.translatedOnlyCount,
        result.originalOnlyCount,
        result.outputCueCount,
      ),
    );
    setLogs(result.logs);
    setHasComposed(true);
    message.success(copy.composedSuccess);
  };

  const handleExport = async () => {
    if (!resultText) return;
    const fileName = buildBilingualFileName(
      translatedInput.fileName,
      outputFormat,
    );
    await downloadFile(resultText, fileName);
    message.success(`${t("exportedFile")}: ${fileName}`);
  };

  const logText =
    logs.length === 0
      ? copy.noLogs
      : logs
          .map((entry) =>
            formatBilingualLogLine(entry, {
              translatedUnmatched: copy.translatedUnmatched,
              originalUnmatched: copy.originalUnmatched,
            }),
          )
          .join("\n");

  const renderInputCard = (
    title: string,
    input: typeof originalInput,
    stats: ReturnType<typeof useTextStats>,
  ) => (
    <PageCard
      title={
        <Space>
          <InboxOutlined /> {title}
        </Space>
      }
      extra={
        <Button
          type="text"
          danger
          icon={<ClearOutlined />}
          onClick={() => {
            input.reset();
            clearResults();
          }}>
          {t("resetUpload")}
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
          {t("supportedFormats")} SRT, VTT, ASS/SSA
        </p>
      </Dragger>

      <SourceArea
        sourceText={input.sourceText}
        setSourceText={(value) => {
          clearResults();
          input.setSourceText(value);
        }}
        stats={stats}
        placeholder={t("pasteUploadContent")}
        ariaLabel={title}
        rows={11}
        className="mt-3"
        textDirection="auto"
      />
    </PageCard>
  );

  return (
    <Spin spinning={isReading} description={t("pleaseWait")} size="large">
      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Paragraph style={{ margin: 0, color: token.colorTextSecondary }}>
            {copy.description}
          </Paragraph>
        </Col>

        <Col xs={24} lg={12}>
          {renderInputCard(copy.originalTitle, originalInput, originalStats)}
        </Col>
        <Col xs={24} lg={12}>
          {renderInputCard(
            copy.translatedTitle,
            translatedInput,
            translatedStats,
          )}
        </Col>

        <Col span={24}>
          <PageCard
            title={
              <Space>
                <SyncOutlined /> {copy.optionsTitle}
              </Space>
            }>
            <Flex vertical gap="middle">
              <div>
                <Text strong>{copy.outputFormat}</Text>
                <Segmented
                  block
                  className="mt-2"
                  value={outputFormat}
                  onChange={(value) => {
                    setOutputFormat(value as OutputFormat);
                    clearResults();
                  }}
                  options={[
                    { label: "SRT", value: "srt" },
                    { label: "ASS", value: "ass" },
                  ]}
                />
              </div>

              {outputFormat === "ass" && (
                <>
                  <Divider style={{ marginBlock: token.marginXS }} />
                  <Row gutter={[16, 16]} align="bottom">
                    <Col xs={24} md={16} lg={18}>
                      <Text strong>{copy.assTemplateMode}</Text>
                      <Segmented
                        block
                        className="mt-2"
                        value={assTemplateMode}
                        onChange={(value) => {
                          setAssTemplateMode(value as AssTemplateMode);
                          clearResults();
                        }}
                        options={[
                          { label: copy.hdrTemplate, value: "hdr" },
                          { label: copy.sdrTemplate, value: "sdr" },
                        ]}
                      />
                    </Col>
                    <Col xs={24} md={8} lg={6}>
                      <Button
                        block
                        icon={<EditOutlined />}
                        onClick={openTemplateDrawer}>
                        {copy.templateEditor}
                      </Button>
                    </Col>
                  </Row>
                </>
              )}

              <Flex justify="end">
                <Button
                  type="primary"
                  size="large"
                  icon={<SyncOutlined />}
                  onClick={handleCompose}
                  disabled={isReading}>
                  {copy.startCompose}
                </Button>
              </Flex>
            </Flex>
          </PageCard>
        </Col>

        {resultText && (
          <Col span={24}>
            <ResultCard
              title={copy.resultTitle}
              content={resultText}
              onChange={setResultText}
              stats={resultStats}
              onCopy={() => copyToClipboard(resultText)}
              onExport={handleExport}
              textDirection="auto"
              rows={12}
            />
          </Col>
        )}

        {hasComposed && (
          <Col span={24}>
            <PageCard
              title={
                <Space>
                  <ProfileOutlined /> {copy.logTitle}
                </Space>
              }>
              <Text
                style={{
                  display: "block",
                  marginBottom: token.marginSM,
                  color: token.colorTextSecondary,
                }}>
                {resultSummary}
              </Text>
              <TextArea
                value={logText}
                rows={Math.min(10, Math.max(4, logs.length + 1))}
                readOnly
                dir="auto"
                aria-label={copy.logTitle}
              />
            </PageCard>
          </Col>
        )}
      </Row>

      <AssTemplateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode={assTemplateMode}
        draft={currentTemplateDraft}
        onDraftChange={(value) => {
          if (assTemplateMode === "hdr") {
            setHdrTemplateDraft(value);
          } else {
            setSdrTemplateDraft(value);
          }
        }}
        onSave={handleSaveTemplate}
        onReset={handleResetTemplate}
      />
    </Spin>
  );
};

export default SubtitleBilingualComposer;
