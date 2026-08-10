import type { AspectRatio } from "./carousel";
import type { BrandConfig } from "./brand";

/**
 * A saved way of designing: the brand it was built with, the rules in prose,
 * and one slide as a worked example. It is fed to the assistant so a look can
 * be reapplied to a different topic.
 */
export interface StylePreset {
  id: string;
  name: string;
  description: string;
  brand: BrandConfig;
  /** Plain-language rules, e.g. "huge type, one idea per slide, no photos". */
  designRules: string;
  /** Reference markup; only the opening chunk reaches the prompt. */
  exampleSlideHtml: string;
  aspectRatio: AspectRatio;
  tags: string[];
  createdAt: string;
}

/** Root of data/style-presets.json. */
export interface StylePresetsData {
  presets: StylePreset[];
}
