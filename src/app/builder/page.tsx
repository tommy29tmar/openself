"use client";

import { useState } from "react";
import { SplitView } from "@/components/layout/SplitView";
import {
  LanguagePicker,
  type LanguageCode,
} from "@/components/chat/LanguagePicker";

export default function BuilderPage() {
  const [language, setLanguage] = useState<LanguageCode | null>(null);

  if (!language) {
    return <LanguagePicker onSelect={setLanguage} />;
  }

  return <SplitView language={language} />;
}
