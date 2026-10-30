import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryServers, validateDelivery } from '../src/features/marketplace/domain.ts';
import { purchaseSnapshot, hostedOrder } from '../src/features/marketplace/hostedOrders.ts';

const legacy={gameName:'小熊',gameId:'player_01',server:'wechat',note:''};
const valorant={gameName:'小熊',gameId:'熊崽队长#CN一',server:'china',note:''};

test('VALORANT checkout accepts Unicode Name#Tag with explicit China server',()=>{
 assert.deepEqual(deliveryServers('valorant'),['china']);
 assert.deepEqual(validateDelivery(valorant,'valorant'),{});
 assert.deepEqual(validateDelivery({...valorant,gameId:'Captain Bear#CN1'},'valorant'),{});
 assert.equal(validateDelivery({...valorant,server:'qq'},'valorant').server,'valorantServerRequired');
 assert.equal(validateDelivery({...valorant,server:''},'valorant').server,'valorantServerRequired');
 for(const gameId of ['plain-id','#CN1','Name#','Name#Tag#More','Name\n#Tag','Name#Bad Tag','x'.repeat(80)+'#CN1'])assert.equal(validateDelivery({...valorant,gameId},'valorant').gameId,'invalidValorantGameId',gameId);
});

test('other game delivery keeps QQ and WeChat compatibility and legacy limits',()=>{
 for(const game of [undefined,'peaceElite','deltaForce','honorOfKings']){
  assert.deepEqual(deliveryServers(game),['wechat','qq']);
  assert.deepEqual(validateDelivery(legacy,game),{});assert.deepEqual(validateDelivery({...legacy,server:'qq'},game),{});
  assert.equal(validateDelivery({...legacy,server:'china'},game).server,'serverRequired');
  assert.equal(validateDelivery({...legacy,gameId:'熊崽#CN1'},game).gameId,'invalidGameId');
 }
});

test('purchase and persisted order snapshots retain game for delivery validation',()=>{
 const policy={maxQuantity:24,rules:{version:'test',text:{en:'Rules',zh:'规则'}},simulationEnabled:true};
 const service=purchaseSnapshot({id:'listing',game:'valorant',revision:7,title:'VALORANT coaching',priceFen:3900,mode:'squad',provider:{nickname:'Provider'}},policy);
 assert.equal(service.game,'valorant');assert.deepEqual(validateDelivery(valorant,service.game),{});
 const mapped=hostedOrder({order:{id:'order',requestId:'request',viewerRole:'buyer',service:{id:'listing',game:'valorant',revision:7,title:'Saved service',providerName:'Provider',mode:'squad',unitPriceFen:3900},quantity:1,totalFen:3900,status:'unpaid',simulated:true,delivery:valorant,rules:policy.rules,createdAt:'2026-10-29T00:00:00Z',paidAt:null,closedAt:null},attempts:[],simulationEnabled:true},'13800138000');
 assert.equal(mapped.service.game,'valorant');assert.equal(mapped.delivery.gameId,'熊崽队长#CN一');assert.equal(mapped.delivery.server,'china');
});
