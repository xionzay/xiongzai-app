import assert from "node:assert/strict";
import { test } from "node:test";
import { FinancialRecoveryService } from "../dist/index.js";

test("production recovery and simulated results reject before accessing database or provider",async()=>{
  let touched=false;
  const database={db:{transaction:async()=>{touched=true;throw new Error("unexpected database access");}}};
  const service=new FinancialRecoveryService(database,{environment:"production"},{},{});
  const metadata={ip:"127.0.0.1",userAgent:"unit",requestId:"synthetic"};
  await assert.rejects(service.recover("admin","operation",0,"测试恢复",metadata),error=>error.code==="MOCK_TRANSFER_DISABLED");
  await assert.rejects(service.mockResult("admin","operation",0,"SUCCEEDED","测试模拟",metadata),error=>error.code==="MOCK_TRANSFER_DISABLED");
  assert.equal(touched,false);
});
