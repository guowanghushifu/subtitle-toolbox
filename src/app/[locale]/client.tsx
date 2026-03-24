"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsProps, Typography, Spin } from "antd";
import { VideoCameraOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import SubtitleTranslator from "./SubtitleTranslator";
import SubtitlePreprocessor from "./SubtitlePreprocessor";
import SubtitleBilingualComposer from "./SubtitleBilingualComposer";
import { useTranslations, useLocale } from "next-intl";
import { TranslationProvider } from "@/app/components/TranslationContext";
import { getDocUrl } from "@/app/utils";

const TranslationSettings = dynamic(() => import("@/app/components/TranslationSettings"), {
  loading: () => (
    <div className="flex justify-center items-center py-20">
      <Spin size="large" />
    </div>
  ),
});

const { Title, Paragraph, Link } = Typography;

const ClientPage = () => {
  const tSubtitle = useTranslations("subtitle");
  const t = useTranslations("common");
  const locale = useLocale();
  const userGuideUrl = getDocUrl("guide/translation/subtitle-translator/index.html", locale);
  const preprocessTabLabel = locale.startsWith("zh") ? "预处理区" : "Preprocess";
  const bilingualTabLabel = locale.startsWith("zh") ? "双语合成" : "Bilingual";
  const [activeKey, setActiveKey] = useState("preprocess");
  const [incomingSourceText, setIncomingSourceText] = useState<{ id: number; content: string; fileName?: string } | null>(null);

  const handleTabChange = (key: string) => {
    setActiveKey(key);
  };

  const handleUseProcessedText = (content: string, fileName?: string) => {
    setIncomingSourceText({
      id: Date.now(),
      content,
      fileName,
    });
    setActiveKey("basic");
  };

  const items: TabsProps["items"] = [
    {
      key: "preprocess",
      label: preprocessTabLabel,
      children: <SubtitlePreprocessor onUseProcessedText={handleUseProcessedText} />,
    },
    {
      key: "basic",
      label: t("basicTab"),
      children: <SubtitleTranslator incomingSourceText={incomingSourceText} />,
    },
    {
      key: "bilingual",
      label: bilingualTabLabel,
      children: <SubtitleBilingualComposer />,
    },
    {
      key: "advanced",
      label: t("advancedTab"),
      children: <TranslationSettings />,
    },
  ];

  return (
    <TranslationProvider>
      <Title level={3}>
        <VideoCameraOutlined /> {tSubtitle("clientTitle")}
      </Title>
      <Paragraph type="secondary" ellipsis={{ rows: 3, expandable: true, symbol: "more" }}>
        <Link href={userGuideUrl} target="_blank" rel="noopener noreferrer">
          <QuestionCircleOutlined /> {t("userGuide")}
        </Link>{" "}
        {tSubtitle("clientDescription")}
        {t("privacyNotice")}
      </Paragraph>
      <Tabs activeKey={activeKey} onChange={handleTabChange} items={items} type="card" className="w-full" animated={{ inkBar: true, tabPane: true }} />
    </TranslationProvider>
  );
};

export default ClientPage;
