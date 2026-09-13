INSERT INTO "permissions" ("id", "permission_key", "description", "high_risk")
VALUES ('00000000-0000-4000-8000-000000000002', 'system_health.read', '读取脱敏系统健康状态', false)
ON CONFLICT ("permission_key") DO NOTHING;
