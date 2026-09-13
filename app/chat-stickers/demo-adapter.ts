import { getSticker, stickerSummary } from "./manifest";
import type { StickerProgress } from "./playback";

export type DemoStatus = "local" | "sending" | "failed";
export type DemoStickerMessage = {
  localId: string; stickerId: string; direction: "mine" | "theirs";
  status: DemoStatus; time: string; createdAt: number; progress: StickerProgress; brokenAnimation?: boolean;
};
export type DemoState = { scope: string; messages: DemoStickerMessage[]; lastTap: { id: string; at: number } | null };
export type DemoAction =
  | { type: "send"; scope: string; id: string; localId: string; at: number; time: string; direction?: "mine" | "theirs"; status?: DemoStatus; brokenAnimation?: boolean; allowUnknown?: boolean }
  | { type: "status"; scope: string; localId: string; status: DemoStatus }
  | { type: "retry"; scope: string; localId: string }
  | { type: "clear"; scope: string };
export const emptyDemo = (scope: string): DemoState => ({ scope, messages: [], lastTap: null });

/** In-memory design adapter only. Not a request DTO, queue, cache, or transport. */
export function stickerDemoReducer(previous: DemoState, action: DemoAction): DemoState {
  const state = previous.scope === action.scope ? previous : emptyDemo(action.scope);
  if (action.type === "clear") return emptyDemo(action.scope);
  if (action.type === "send") {
    if (!getSticker(action.id) && !action.allowUnknown) return state;
    if (state.lastTap?.id === action.id && action.at - state.lastTap.at < 600) return state;
    const message: DemoStickerMessage = {
      localId: action.localId, stickerId: action.id, direction: action.direction ?? "mine", status: action.status ?? "local",
      time: action.time, createdAt: action.at, progress: { played: false, failed: false }, brokenAnimation: action.brokenAnimation,
    };
    return { ...state, lastTap: { id: action.id, at: action.at }, messages: [...state.messages, message] };
  }
  return { ...state, messages: state.messages.map((message) => {
    if (message.localId !== action.localId) return message;
    if (action.type === "retry") return message.status === "failed" ? { ...message, status: "sending" } : message;
    return { ...message, status: action.status };
  }) };
}
export const demoSummary = (state: DemoState) => state.messages.length ? stickerSummary(state.messages[state.messages.length - 1]!.stickerId) : "还没有本地演示表情";
