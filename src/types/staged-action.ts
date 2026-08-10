/**
 * Work the assistant wants to perform that touches something outside the
 * carousel itself. It is written down first and carried out after, so nothing
 * happens on the user's disk without a record of what and why.
 */

export type StagedActionType = "export_png";

export type StagedActionStatus =
  | "pending"
  | "approved"
  | "executed"
  | "failed"
  | "rejected";

export interface StagedAction {
  id: string;
  type: StagedActionType;
  fileName: string;
  content: string;
  /** What this does, in the user's language. */
  description: string;
  carouselId: string;
  autoExecute: boolean;
  status: StagedActionStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/** Root of data/staged-actions.json. */
export interface StagedActionsData {
  actions: StagedAction[];
}
