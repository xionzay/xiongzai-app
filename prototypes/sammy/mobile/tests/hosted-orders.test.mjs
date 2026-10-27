import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedOrder, purchaseSnapshot } from '../src/features/marketplace/hostedOrders.ts';
test('hosted purchase uses listing mode/revision and explicit policy without inventing a deadline',()=>{
 const policy={maxQuantity:24,rules:{version:'sammy-test',text:{en:'Simulation',zh:'模拟'}},simulationEnabled:true};
 const snapshot=purchaseSnapshot({id:'listing',revision:7,title:'Actual service',priceFen:3900,mode:'squad',provider:{nickname:'Provider'}},policy);
 assert.equal(snapshot.mode,'squad');assert.equal(snapshot.unitPriceFen,3900);assert.equal(snapshot.listingRevision,7);assert.equal(snapshot.rulesVersion,'sammy-test');assert.equal(snapshot.fulfillmentHours,null);
});
test('server order mapping retains persisted simulated outcome, role and snapshot amount',()=>{
 const mapped=hostedOrder({order:{id:'order',requestId:'request',viewerRole:'seller',buyerId:'buyer',sellerId:'seller',service:{id:'listing',revision:1,title:'Old title',providerName:'Provider',mode:'duo',unitPriceFen:3900},quantity:2,totalFen:7800,status:'awaitingService',simulated:true,delivery:{gameName:'Player',gameId:'player-1',server:'wechat',note:''},rules:{version:'snapshot-rule',text:{en:'test',zh:'测试'}},createdAt:'2026-10-21T00:00:00Z',paidAt:'2026-10-21T00:00:01Z',closedAt:null},attempts:[{requestId:'attempt',status:'succeeded'}],simulationEnabled:true},'');
 assert.equal(mapped.totalFen,7800);assert.equal(mapped.role,'seller');assert.equal(mapped.paymentStatus,'succeeded');assert.equal(mapped.paymentRequestId,'attempt');assert.equal(mapped.deadlineAt,null);assert.equal(mapped.service.title.en,'Old title');assert.equal(mapped.rules.version,'snapshot-rule');
});
