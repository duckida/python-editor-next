/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { createContext, useContext } from "react";
import { defaultCodeFontSizePt } from "../deployment/misc";
import { CodeStructureSettings } from "../editor/codemirror/structure-highlighting";
import { stage } from "../environment";

export interface Language {
  id: string;
  name: string;
}

export const supportedLanguages = [
  {
    id: "en",
    name: "English",
  },
];
if (stage === "REVIEW" || process.env.NODE_ENV !== "production") {
  supportedLanguages.push({
    id: "lol", // This has to be a valid locale value, so can't be e.g. "test".
    name: "Translation test",
  });
}

export const minimumFontSize = 4;
export const maximumFontSize = 154;
export const fontSizeStep = 3;

export const defaultSettings: Settings = {
  languageId: supportedLanguages[0].id,
  fontSize: defaultCodeFontSizePt,
  codeStructureHighlight: "full",
};

export const isValidSettingsObject = (value: unknown): value is Settings => {
  if (typeof value !== "object") {
    return false;
  }
  const object = value as any;
  if (
    object.languageId &&
    !supportedLanguages.find((x) => x.id === object.languageId)
  ) {
    return false;
  }
  if (codeStructureOptions.indexOf(object.codeStructureHighlight) === -1) {
    return false;
  }
  return true;
};

// These are the only configuration exposed to end users and are
// sets of presets. We've retained more internal configurability
// for experimentation.
export type CodeStructureOption = "none" | "full" | "simple";
export const codeStructureOptions: CodeStructureOption[] = [
  "none",
  "full",
  "simple",
];
export const codeStructureSettings = (
  settings: Settings
): CodeStructureSettings => {
  switch (settings.codeStructureHighlight) {
    case "none":
      return {
        shape: "box",
        background: "none",
        borders: "none",
        cursorBackground: false,
        cursorBorder: "none",
      };
    case "simple":
      return {
        shape: "l-shape",
        background: "none",
        borders: "left-edge-only",
        cursorBackground: false,
        cursorBorder: "none",
      };
    case "full":
    // same as default => fall through
    default:
      return {
        shape: "l-shape",
        background: "block",
        borders: "none",
        cursorBackground: true,
        cursorBorder: "left-edge-only",
      };
  }
};

export interface Settings {
  languageId: string;
  fontSize: number;
  codeStructureHighlight: CodeStructureOption;
}

type SettingsContextValue = [Settings, (settings: Settings) => void];

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined
);

export const SettingsProvider = SettingsContext.Provider;

export const useSettings = (): SettingsContextValue => {
  const settings = useContext(SettingsContext);
  if (!settings) {
    throw new Error("Missing provider");
  }
  return settings;
};
