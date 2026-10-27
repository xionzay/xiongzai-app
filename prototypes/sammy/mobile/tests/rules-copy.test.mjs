import test from 'node:test';
import assert from 'node:assert/strict';
import { customerRulesText } from '../src/features/marketplace/rulesCopy.ts';
test('legacy customer rules remove developer framing while retaining money and acceptance terms',()=>{
 const original='SIMULATION ONLY: no real money, identity verification or real payouts. Server-priced orders retain their original snapshots. Acceptance is 72 hours with one optional 24-hour extension. Staff decides disputes from evidence; missing original V3.1 liability rules are not invented. Successful simulated refunds waive commission; otherwise commission is 10% rounded half-up. The company bears channel fees.';
 const copy=customerRulesText('sammy-simulation-v2',original);
 assert.ok(!/simulation|simulated|prototype|V3\.1|server/i.test(copy));
 for(const phrase of ['72 hours','24-hour','refunds waive commission','10% rounded half-up','company bears channel fees'])assert.ok(copy.includes(phrase));
 assert.equal(customerRulesText('other-policy',original),original);
});
test('Chinese legacy rule presentation preserves the agreed amounts and deadlines',()=>{
 const original='仅限模拟：不涉及真实资金、身份核验或真实提现。订单金额由服务器计算并保留原始快照，不包含预约或卖家接单。验收期72小时，可延长一次24小时。争议由工作人员根据证据处理，不编造缺失的V3.1责任规则。模拟退款成功即免佣，否则按10%四舍五入至分计佣，平台承担渠道费。';
 const copy=customerRulesText('sammy-simulation-v2',original);
 assert.ok(!/模拟|原型|服务器|V3\.1/.test(copy));
 for(const phrase of ['72小时','24小时','退款成功即免佣','10%','平台承担渠道费'])assert.ok(copy.includes(phrase));
});
