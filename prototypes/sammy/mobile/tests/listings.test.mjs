import test from 'node:test';
import assert from 'node:assert/strict';
import {listingPrice} from '../src/features/marketplace/listingModels.ts';
test('service prices preserve integer fen and reject ambiguous or out-of-range input',()=>{
 for(const [input,fen] of [['1',100],['39.99',3999],['1000',100000],[' 12.50 ',1250]])assert.equal(listingPrice(input),fen);
 for(const input of ['', '0','0.99','1000.01','1e2','1,000','1.999','NaN','-2','1.'])assert.equal(listingPrice(input),null,input);
});
