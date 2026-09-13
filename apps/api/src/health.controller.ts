import { Controller, Get, Inject } from "@nestjs/common";
import type { DatabaseClient } from "@xiongzai/database";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { Public } from "./auth.guard.js";
import type { ApiConfig } from "./config.js";
import type { ObjectStorageProvider } from "./object-storage-provider.js";
import { API_CONFIG, DATABASE_CLIENT, OBJECT_STORAGE_PROVIDER } from "./tokens.js";

@Controller("health")
@Public()
export class HealthController {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
  ) {}

  @Get("live")
  live() {
    return { status: "ok", service: "api", time: new Date() };
  }

  @Get("ready")
  async ready() {
    const requiresVoicePolicy = this.config.fileStorageProvider === "minio" || this.config.fileStorageProvider === "aliyun-oss";
    let voicePolicyConfigured = false;
    try {
      await this.database.pool.query("select 1");
      if (requiresVoicePolicy) {
        const policy = await this.database.pool.query(
          "select 1 from policy_versions where policy_type = $1 and status = 'PUBLISHED' and effective_at <= now() order by version_no desc limit 1",
          ["VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION"],
        );
        voicePolicyConfigured = policy.rows.length > 0;
      }
    } catch (cause) {
      throw new AppError({ code: errorCodes.DATABASE_UNAVAILABLE, message: "数据库暂不可用", statusCode: 503, cause });
    }
    if (requiresVoicePolicy && !voicePolicyConfigured) {
      throw new AppError({ code: errorCodes.POLICY_CONFIGURATION_INCOMPLETE, message: "声音名片公开播放授权协议尚未发布", statusCode: 503 });
    }
    if (this.config.fileStorageProvider !== "disabled") {
      try {
        await this.storage.listObjects({ bucket: this.config.fileQuarantineBucket, prefix: "health/readiness/", limit: 1 });
      } catch (cause) {
        throw new AppError({ code: "FILE_STORAGE_UNAVAILABLE", message: "对象存储暂不可用", statusCode: 503, cause });
      }
    }
    return {
      status: "ready",
      checks: {
        database: "ok",
        object_storage: this.config.fileStorageProvider === "disabled" ? "not_configured" : "ok",
        rejected_file_retention: this.config.fileRejectedRetentionSeconds > 0 ? "configured" : "disabled",
        ...(requiresVoicePolicy ? { voice_playback_policy: "ok" } : {}),
      },
      time: new Date(),
    };
  }
}
