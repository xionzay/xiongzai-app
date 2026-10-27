// Older order snapshots retain their original text in storage. Only remove
// known development framing when presenting those versions to a customer.
export function customerRulesText(version:string|undefined,value:string):string {
 if(version!=='sammy-simulation-v1'&&version!=='sammy-simulation-v2')return value;
 return value
  .replace('SIMULATION ONLY: no real money, identity verification or real payouts. ','')
  .replace('Server-priced orders retain their original snapshots. ','')
  .replace('missing original V3.1 liability rules are not invented. ','')
  .replace('Staff decides disputes from evidence; ','Staff reviews disputes using the submitted evidence. ')
  .replace('Successful simulated refunds','Successful refunds')
  .replace('Unpaid timeout and an initial delivery deadline are not configured.','Coordinate service details with your companion.')
  .replace('仅限模拟：不涉及真实资金、身份核验或真实提现。','')
  .replace('订单金额由服务器计算并保留原始快照，','')
  .replace('不编造缺失的V3.1责任规则。','')
  .replace('模拟退款成功','退款成功')
  .replace('未配置未付款超时或初始交付期限。','请与陪玩沟通具体的游戏安排。')
  .trim();
}
