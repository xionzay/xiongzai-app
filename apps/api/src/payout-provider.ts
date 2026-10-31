import { createHmac, timingSafeEqual } from "node:crypto";
import type { MockTransferStore } from "./mock-transfer-store.js";
import type { TransferResult } from "./durable-transfers.js";

export type PayoutCallbackPayload = { event_id:string; event_type:"PAYOUT_SUCCEEDED"|"PAYOUT_FAILED"; withdrawal_no:string; provider_payout_no:string; amount_cent:string; failure_reason?:string };

export interface PayoutProvider {
  readonly channel:string;
  readonly mode:"mock"|"live";
  verifyAccount(input:{accountType:"WECHAT"|"ALIPAY";holderName:string;accountToken:string}):Promise<{verified:boolean}>;
  /** Must be idempotent for the same withdrawalNo, including retries after an unknown outcome. */
  createPayout(input:{withdrawalNo:string;accountType:"WECHAT"|"ALIPAY";accountToken:string;amountCent:bigint;idempotencyKey?:string}):Promise<{providerPayoutNo:string}>;
  queryPayout?(input:{withdrawalNo:string;accountType:"WECHAT"|"ALIPAY";idempotencyKey:string}):Promise<TransferResult>;
  verifyCallback(payload:PayoutCallbackPayload,signature:string|undefined):boolean;
}

export class MockPayoutProvider implements PayoutProvider {
  private transferStore?:MockTransferStore;
  bindTransferStore(store:MockTransferStore){this.transferStore=store;return this;}
  readonly channel="MOCK";
  readonly mode="mock";
  constructor(private readonly secret:string){}
  async verifyAccount(){return {verified:true};}
  async createPayout(input:{withdrawalNo:string;accountType?:"WECHAT"|"ALIPAY";idempotencyKey?:string}){
    const key=input.idempotencyKey??input.withdrawalNo,providerPayoutNo=`mock-payout-${key}`;
    if(this.transferStore)await this.transferStore.create("PAYOUT",input.accountType!,key,input,providerPayoutNo);
    return {providerPayoutNo};
  }
  async queryPayout(input:{withdrawalNo:string;accountType:"WECHAT"|"ALIPAY";idempotencyKey:string}):Promise<TransferResult>{
    return this.transferStore?this.transferStore.query("PAYOUT",input.accountType,input.idempotencyKey):{status:"UNKNOWN"};
  }
  verifyCallback(payload:PayoutCallbackPayload,signature:string|undefined){if(!signature||!/^[a-f0-9]{64}$/u.test(signature))return false;const expected=Buffer.from(this.sign(payload),"hex");const actual=Buffer.from(signature,"hex");return expected.length===actual.length&&timingSafeEqual(expected,actual);}
  sign(payload:PayoutCallbackPayload){return createHmac("sha256",this.secret).update(JSON.stringify(payload)).digest("hex");}
}
