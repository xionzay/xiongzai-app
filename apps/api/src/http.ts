import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor, type PipeTransform } from "@nestjs/common";
import { AppError, errorCodes, toApiJson, type ErrorResponse } from "@xiongzai/contracts";
import { JsonLogger, requestContext } from "@xiongzai/observability";
import type { FastifyReply } from "fastify";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { z } from "zod";
import { API_LOGGER } from "./tokens.js";

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(API_LOGGER) private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = requestContext.get()?.requestId ?? "unknown";
    const appError = normalizeError(exception);
    if (appError.statusCode >= 500) this.logger.error("http_request_failed", {
      code: appError.code,
      error_name: exception instanceof Error ? exception.name : "UnknownError",
    });
    const body: ErrorResponse = {
      code: appError.code,
      message: appError.expose ? appError.message : "服务暂时不可用，请稍后重试",
      request_id: requestId,
      field_errors: appError.fieldErrors,
      ...(appError.details ? { details: appError.details } : {}),
    };
    void reply.status(appError.statusCode).send(body);
  }
}

@Injectable()
export class ApiSerializationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => toApiJson(value)));
  }
}

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppError({
      code: errorCodes.VALIDATION_FAILED,
      message: "请求参数校验失败",
      statusCode: 400,
      fieldErrors: result.error.issues.map((issue) => ({ field: issue.path.join("."), code: issue.code, message: issue.message })),
    });
  }
}

function normalizeError(exception: unknown): AppError {
  if (exception instanceof AppError) return exception;
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = status === 404 ? "RESOURCE_NOT_FOUND" : status === 405 ? "METHOD_NOT_ALLOWED" : "HTTP_ERROR";
    return new AppError({ code, message: status === 404 ? "请求的资源不存在" : exception.message, statusCode: status });
  }
  return new AppError({ code: errorCodes.INTERNAL_ERROR, message: "Internal server error", statusCode: 500, expose: false, cause: exception });
}
