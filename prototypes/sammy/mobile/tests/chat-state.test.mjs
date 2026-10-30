import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMessages} from '../src/features/marketplace/chatState.ts';
const message=(id,createdAt)=>({id,createdAt,senderId:'sender',body:id,kind:'text'});
test('polling retains older history and deduplicates send acknowledgements',()=>{
 const older=message('old','2026-01-01'),recent=message('recent','2026-01-02'),next=message('new','2026-01-03');
 assert.deepEqual(mergeMessages([older,recent],[recent,next]),[older,recent,next]);
 assert.deepEqual(mergeMessages([recent,next],[older,recent]),[older,recent,next]);
});
test('equal timestamps have stable ID ordering',()=>{
 assert.deepEqual(mergeMessages([message('b','2026-01-01')],[message('a','2026-01-01')]).map(m=>m.id),['a','b']);
});
