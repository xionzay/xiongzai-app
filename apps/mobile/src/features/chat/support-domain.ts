import type { SupportCaseStatus } from "@/types/api";
export const supportStatusCopy: Record<SupportCaseStatus, string> = { WAITING: "排队中", SERVING: "服务中", TRANSFERRED: "已转交", CLOSED: "已关闭" };
export function canSendSupport(status: SupportCaseStatus) { return status !== "CLOSED"; }
