/** Snapshot of the element currently selected inside the slide iframe. */
export interface SelectedElement {
  /**
   * Stable per-element id assigned by the editing runtime. Used as the React
   * key for the text field so it doesn't remount (and drop characters) while
   * typing changes the element's measured size.
   */
  uid: string;
  /** Human role: background, shape, text, image, icon, group. */
  kind: string;
  /** Friendly name shown in the UI. Never a tag name. */
  label: string;
  text: string;
  /** True when the element holds only text, so editing `text` is safe. */
  isTextNode: boolean;
  /** The block styles part of its text with nested tags (span/b/i/…). */
  hasInlineFormatting: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  color: string;
  fontStyle: string;
  /** Computed `text-decoration-line`; "underline" when underlined. */
  textDecoration: string;
  /**
   * The characters currently highlighted inside the block, when any. Present
   * only on snapshots produced by a text selection — the quick bar uses it to
   * say whether it is about to format a run or the whole block.
   */
  selectedText?: string;
  background: string;
  /** Computed `background-image`; empty when there is none. Grids and washes
   *  live here, and the panel edits them as patterns rather than fills. */
  backgroundImage: string;
  /** Tiled with an explicit size = a repeating pattern; otherwise a single
   *  gradient over the box. The panel picks its controls from this. */
  backgroundSize: string;
  backgroundRepeat: string;
  /** `src` of an <img> layer, so the panel can offer to swap the file. */
  src: string;
  opacity: string;
  borderRadius: number;
  width: number;
  height: number;
  /** Offsets taken from the element's own style, so they round-trip with drag. */
  offsetX: number;
  offsetY: number;
  position: string;
  /** Box in slide coordinates, for positioning the floating toolbar. */
  rect: { left: number; top: number; width: number; height: number };
  /** The block is currently in inline text-editing mode. */
  editing: boolean;
}
