import test from 'node:test';
import assert from 'node:assert/strict';
import { socketDirectory } from './local-stack-config.mjs';
test('adoption reads valid PostgreSQL socket URIs without a WHATWG authority',()=>{
 const socket='/var/folders/n2/example/T/sammy-local-VWwubE';
 assert.equal(socketDirectory(`postgresql://sammy_local@/postgres?host=${socket}&port=55487`),socket);
});
test('adoption decodes an encoded absolute socket directory exactly once',()=>{
 const socket='/private/tmp/sammy local+QA%20';
 assert.equal(socketDirectory(`postgresql://sammy_local@/postgres?port=55487&host=${encodeURIComponent(socket)}`),socket);
});
test('non-socket connection strings do not select a local data directory',()=>{
 assert.equal(socketDirectory('postgresql://user@localhost/postgres'),null);
 assert.equal(socketDirectory('postgresql://user@/postgres?host=localhost&port=55487'),null);
});
