"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsProps, Spin } from "antd";
import { VideoCameraOutlined } from "@ant-design/icons";
import SubtitleTranslator from "./SubtitleTranslator";
import SubtitlePreprocessor from "./SubtitlePreprocessor";
import SubtitleBilingualComposer from "./SubtitleBilingualComposer";
import { useTranslations, useLocale } from "next-intl";
import { TranslationProvider } from "@/app/components/TranslationContext";
import { getDocUrl } from "@/app/utils";
import ToolPage from "@/app/components/styled/ToolPage";

const TranslationSettings = dynamic(() => import("@/app/components/TranslationSettings"), {
  loading: () => (
    <div className="flex justify-center items-center py-20">
      <Spin size="large" />
    </div>
  ),
});

const ClientPage = () => {
  const tSubtitle = useTranslations("subtitle");
  const t = useTranslations("common");
  const locale = useLocale();
  const userGuideUrl = getDocUrl("guide/translation/subtitle-translator/index.html", locale);
  const preprocessTabLabel = locale.startsWith("zh") ? "预处理区" : "Preprocess";
  const bilingualTabLabel = locale.startsWith("zh") ? "双语合成" : "Bilingual";
  const [activeKey, setActiveKey] = useState("basic");

  const handleTabChange = (key: string) => {
    setActiveKey(key);
  };

  const items: TabsProps["items"] = [
    {
      key: "preprocess",
      label: preprocessTabLabel,
      children: <SubtitlePreprocessor />,
    },
    {
      key: "basic",
      label: t("basicTab"),
      children: <SubtitleTranslator onOpenApiSettings={() => setActiveKey("advanced")} />,
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
      <ToolPage icon={<VideoCameraOutlined />} title={tSubtitle("clientTitle")} description={tSubtitle("clientDescription")} guideUrl={userGuideUrl}>
        <Tabs activeKey={activeKey} onChange={handleTabChange} items={items} type="card" className="w-full" animated={{ inkBar: true, tabPane: true }} />
      </ToolPage>
    </TranslationProvider>
  );
};

export default ClientPage;
