import { requestContext } from "./context.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;
export type LogSink = (line: string) => void;

const sensitivePattern = /(authorization|cookie|password|secret|token|phone|mobile|document|identity|bank|card|otp|sms.?code|verification.?code|legal.?name)/i;

export class JsonLogger {
  constructor(
    private readonly service: string,
    private readonly sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  ) {}

  debug(message: string, fields: LogFields = {}): void { this.write("debug", message, fields); }
  info(message: string, fields: LogFields = {}): void { this.write("info", message, fields); }
  warn(message: string, fields: LogFields = {}): void { this.write("warn", message, fields); }
  error(message: string, fields: LogFields = {}): void { this.write("error", message, fields); }

  child(defaultFields: LogFields): JsonLogger {
    return new ChildJsonLogger(this, defaultFields);
  }

  protected write(level: LogLevel, message: string, fields: LogFields): void {
    const context = requestContext.get();
    this.sink(JSON.stringify(redact({
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      request_id: context?.requestId,
      trace_id: context?.traceId,
      actor_id: context?.actorId,
      actor_type: context?.actorType,
      ...fields,
    })));
  }
}

class ChildJsonLogger extends JsonLogger {
  constructor(private readonly parent: JsonLogger, private readonly defaults: LogFields) {
    super("child");
  }

  protected override write(level: LogLevel, message: string, fields: LogFields): void {
    this.parent[level](message, { ...this.defaults, ...fields });
  }
}

function redact(value: unknown, key = ""): unknown {
  if (sensitivePattern.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    if (value instanceof Error) return { name: value.name };
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  if (typeof value === "bigint") return value.toString(10);
  return value;
}
