/** V3.1 case contract. D06 reasons retain temporary local validation. */
export const afterSaleCaseStates = ["S01", "S02", "S03", "S04", "S05", "R01", "R02", "P01", "P02", "P03", "P04", "EXECUTION_PENDING", "F01", "F02", "F06", "REMEDY_COMPLETED"] as const;
export type AfterSaleCaseState = typeof afterSaleCaseStates[number];
export type AfterSaleCaseKind = "NORMAL" | "REMEDY" | "SPECIAL";
export interface AfterSaleOffer {
  id: string;
  proposer_id: string;
  kind: "REFUND" | "REMEDY";
  amount_cent?: string;
  retained_amount_cent?: string;
  recognized_delivery?: string;
  remaining_obligations_terminated?: boolean;
  content?: string;
  quantity?: string;
  standard?: string;
  fulfillment_seconds?: number;
  expires_at: string;
}
export interface AfterSaleCaseData {
  original_status: string;
  paused_at: string;
  original_fulfillment_due_at: string | null;
  receipt_remaining_ms: number | null;
  modifications: number;
  negotiation_rounds: number;
  platform_entered: boolean;
  review_level: number;
  offer: AfterSaleOffer | null;
  remedy_remaining_ms?: number;
  evidence_file_ids: string[];
  counterparty_visible_evidence_ids?: string[];
  remedy_evidence_file_ids?: string[];
  review_phase?: "MATERIALS" | "REVIEW";
  review_extension_used?: boolean;
  initial_reviewer_id?: string;
  decision?: AfterSaleDecision;
  accepted_by?: string[];
  appealed_by?: string[];
  special_contact_at?: string;
  special_contact_evidence_ids?: string[];
  funding?: {held_cent:string;commission_reserved_cent:string;funding_gap_cent:string;target_cent:string};
  award_effective?: boolean;
  execution_amount_cent?: string;
  funding_updated_at?: string;
}
export interface AfterSaleDecision {
  id:string;
  level:number;
  reviewer_id:string;
  outcome:"REFUND"|"NO_REFUND";
  amount_cent:string;
  facts:string;
  evidence_file_ids:string[];
  rule_basis:string;
  liability:string;
  reason:string;
  remaining_obligations:string;
  execution_conditions:string;
  issued_at:string;
  appeal_deadline_at:string|null;
}
export const afterSaleLocalRules = Object.freeze({
  applicationLimit: 3, modificationLimit: 2, negotiationLimit: 2,
  responseSeconds: 86400, rejectionSeconds: 172800,
  remedyMaximumSeconds: 604800, receiptSeconds: 259200,
  specialFunding: "WAIT_FOR_FULL_FUNDING" as const,
  automaticAdvance: false,
  temporaryReasons: true,
});
