"use client";

import { Button, Drawer, Flex, Input, Tag, Typography } from "antd";
import { useLocale } from "next-intl";
import { useIsMobile } from "@/app/hooks/useIsMobile";
import { getSubtitleToolsCopy } from "./copy";

interface AssTemplateDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: "hdr" | "sdr";
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
}

const AssTemplateDrawer = ({
  open,
  onClose,
  mode,
  draft,
  onDraftChange,
  onSave,
  onReset,
}: AssTemplateDrawerProps) => {
  const copy = getSubtitleToolsCopy(useLocale()).composer;
  const isMobile = useIsMobile();

  return (
    <Drawer
      title={copy.templateEditor}
      open={open}
      onClose={onClose}
      size={isMobile ? "100vw" : "min(720px, 92vw)"}
      destroyOnHidden={false}
      extra={<Tag>{mode.toUpperCase()}</Tag>}>
      <Typography.Paragraph type="secondary">
        {copy.templateHint}
      </Typography.Paragraph>
      <Input.TextArea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        rows={22}
        aria-label={copy.templateEditor}
      />
      <Flex justify="end" gap="small" wrap className="mt-4">
        <Button onClick={onReset}>{copy.resetTemplate}</Button>
        <Button type="primary" onClick={onSave}>
          {copy.saveTemplate}
        </Button>
      </Flex>
    </Drawer>
  );
};

export default AssTemplateDrawer;
