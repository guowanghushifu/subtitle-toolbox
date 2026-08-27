"use client";

import { useCallback, useRef, useState } from "react";
import type { UploadFile } from "antd";
import { decodeFileBytes, normalizeNewlines } from "@/app/utils";

interface UseSubtitleFileInputOptions {
  onError: (error: unknown) => void;
}

export const useSubtitleFileInput = ({ onError }: UseSubtitleFileInputOptions) => {
  const [sourceText, setSourceText] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const readSequence = useRef(0);

  const reset = useCallback(() => {
    readSequence.current += 1;
    setSourceText("");
    setFileList([]);
    setFileName("");
    setIsReading(false);
  }, []);

  const selectFile = useCallback(
    async (file: File) => {
      const sequence = ++readSequence.current;
      setFileName(file.name);
      setFileList([
        {
          uid: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          size: file.size,
          status: "done",
        },
      ]);
      setIsReading(true);

      try {
        const decoded = await decodeFileBytes(await file.arrayBuffer());
        if (sequence === readSequence.current) {
          setSourceText(normalizeNewlines(decoded));
        }
      } catch (error) {
        if (sequence === readSequence.current) {
          setSourceText("");
          setFileList([]);
          setFileName("");
          onError(error);
        }
      } finally {
        if (sequence === readSequence.current) {
          setIsReading(false);
        }
      }
    },
    [onError],
  );

  return {
    sourceText,
    setSourceText,
    fileList,
    fileName,
    isReading,
    selectFile,
    reset,
  };
};
