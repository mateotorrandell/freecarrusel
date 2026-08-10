import { readDataSafe, writeData } from "./data";
import { generateId, now } from "./utils";
import type {
  StagedAction,
  StagedActionStatus,
  StagedActionsData,
  StagedActionType,
} from "@/types/staged-action";

/**
 * A ledger of side effects the assistant asked for. Writing the intent down
 * before carrying it out means nothing lands on the user's disk without a row
 * saying what it was and how it ended.
 */

const FILE = "staged-actions.json";
const EMPTY: StagedActionsData = { actions: [] };

const load = () => readDataSafe<StagedActionsData>(FILE, EMPTY);
const save = (data: StagedActionsData) => writeData(FILE, data);

export async function listStagedActions(): Promise<StagedAction[]> {
  return (await load()).actions;
}

export async function getStagedAction(id: string): Promise<StagedAction | null> {
  return (await load()).actions.find((a) => a.id === id) ?? null;
}

export async function createStagedAction(input: {
  type: StagedActionType;
  fileName: string;
  content: string;
  description: string;
  carouselId: string;
  autoExecute?: boolean;
}): Promise<StagedAction> {
  const data = await load();

  const action: StagedAction = {
    ...input,
    id: generateId(),
    autoExecute: input.autoExecute ?? false,
    status: "pending",
    createdAt: now(),
    resolvedAt: null,
  };

  data.actions.push(action);
  await save(data);
  return action;
}

export async function updateStagedAction(
  id: string,
  patch: Partial<Pick<StagedAction, "status" | "resolvedAt">>
): Promise<StagedAction | null> {
  const data = await load();
  const action = data.actions.find((a) => a.id === id);
  if (!action) return null;
  Object.assign(action, patch);
  await save(data);
  return action;
}

/** Move an action to a terminal state, stamping when it got there. */
export async function updateStagedActionStatus(
  id: string,
  status: StagedActionStatus
): Promise<StagedAction | null> {
  return updateStagedAction(id, {
    status,
    resolvedAt: status === "pending" ? null : now(),
  });
}
