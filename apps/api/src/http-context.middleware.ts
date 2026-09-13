import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { uuidv7 } from "@xiongzai/database";
import { JsonLogger, requestContext } from "@xiongzai/observability";
import { API_LOGGER } from "./tokens.js";

const tokenEndpoints = new Set([
  "/api/v1/auth/sms/login",
  "/api/v1/auth/token/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/mobile/sms/login",
  "/api/v1/auth/mobile/token/refresh",
  "/api/v1/auth/mobile/logout",
]);

@Injectable()
export class HttpContextMiddleware implements NestMiddleware {
  constructor(@Inject(API_LOGGER) private readonly logger: JsonLogger) {}

  use(request: IncomingMessage, response: ServerResponse, next: () => void): void {
    const requestId = safeId(request.headers["x-request-id"]) ?? uuidv7();
    const traceId = traceIdFromTraceparent(request.headers.traceparent) ?? safeId(request.headers["x-trace-id"]) ?? uuidv7().replaceAll("-", "");
    if (isSensitiveEndpoint(request.url)) {
      response.setHeader("cache-control", "no-store");
      response.setHeader("pragma", "no-cache");
    }
    response.setHeader("x-request-id", requestId);
    response.setHeader("x-trace-id", traceId);
    const startedAt = performance.now();
    requestContext.run({ requestId, traceId }, () => {
      response.once("finish", () => this.logger.info("http_request_completed", {
        method: request.method,
        path: request.url?.split("?", 1)[0],
        status_code: response.statusCode,
        duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
      }));
      next();
    });
  }
}

function isSensitiveEndpoint(url: string | undefined): boolean {
  const path = url?.split("?", 1)[0];
  return path !== undefined && (tokenEndpoints.has(path) || path.startsWith("/admin-api/v1/"));
}

function safeId(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : undefined;
}

function traceIdFromTraceparent(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(value);
  return match?.[1]?.toLowerCase();
}
