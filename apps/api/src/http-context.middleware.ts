import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { uuidv7 } from "@xiongzai/database";
import { JsonLogger, requestContext } from "@xiongzai/observability";
import { API_LOGGER } from "./tokens.js";

@Injectable()
export class HttpContextMiddleware implements NestMiddleware {
  constructor(@Inject(API_LOGGER) private readonly logger: JsonLogger) {}

  use(request: IncomingMessage, response: ServerResponse, next: () => void): void {
    const requestId = safeId(request.headers["x-request-id"]) ?? uuidv7();
    const traceId = traceIdFromTraceparent(request.headers.traceparent) ?? safeId(request.headers["x-trace-id"]) ?? uuidv7().replaceAll("-", "");
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

function safeId(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : undefined;
}

function traceIdFromTraceparent(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(value);
  return match?.[1]?.toLowerCase();
}
