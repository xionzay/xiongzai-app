import { Controller, Get, Inject } from "@nestjs/common";
import type { DatabaseClient } from "@xiongzai/database";
import { AppError, errorCodes } from "@xiongzai/contracts";
import { Public } from "./auth.guard.js";
import { DATABASE_CLIENT } from "./tokens.js";

@Controller("health")
@Public()
export class HealthController {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  @Get("live")
  live() {
    return { status: "ok", service: "api", time: new Date() };
  }

  @Get("ready")
  async ready() {
    try {
      await this.database.pool.query("select 1");
      return { status: "ready", database: "ok", time: new Date() };
    } catch (cause) {
      throw new AppError({ code: errorCodes.DATABASE_UNAVAILABLE, message: "数据库暂不可用", statusCode: 503, cause });
    }
  }
}
