import { createHmac, timingSafeEqual } from "node:crypto";

export type PayoutCallbackPayload = { event_id:string; event_type:"PAYOUT_SUCCEEDED"|"PAYOUT_FAILED"; withdrawal_no:string; provider_payout_no:string; amount_cent:string; failure_reason?:string };

export interface PayoutProvider {
  readonly channel:string;
  verifyAccount(input:{accountType:"WECHAT"|"ALIPAY";holderName:string;accountToken:string}):Promise<{verified:boolean}>;
  /** Must be idempotent for the same withdrawalNo, including retries after an unknown outcome. */
  createPayout(input:{withdrawalNo:string;accountType:"WECHAT"|"ALIPAY";accountToken:string;amountCent:bigint}):Promise<{providerPayoutNo:string}>;
  verifyCallback(payload:PayoutCallbackPayload,signature:string|undefined):boolean;
}

export class MockPayoutProvider implements PayoutProvider {
  readonly channel="MOCK";
  constructor(private readonly secret:string){}
  async verifyAccount(){return {verified:true};}
  async createPayout(input:{withdrawalNo:string}){return {providerPayoutNo:`mock-payout-${input.withdrawalNo}`};}
  verifyCallback(payload:PayoutCallbackPayload,signature:string|undefined){if(!signature||!/^[a-f0-9]{64}$/u.test(signature))return false;const expected=Buffer.from(this.sign(payload),"hex");const actual=Buffer.from(signature,"hex");return expected.length===actual.length&&timingSafeEqual(expected,actual);}
  sign(payload:PayoutCallbackPayload){return createHmac("sha256",this.secret).update(JSON.stringify(payload)).digest("hex");}
}
