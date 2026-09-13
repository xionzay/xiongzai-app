export const errorCodes = {
  INTERNAL_ERROR: "INTERNAL_ERROR",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_SESSION_INVALID: "AUTH_SESSION_INVALID",
  AUTH_SMS_RATE_LIMITED: "AUTH_SMS_RATE_LIMITED",
  AUTH_SMS_CODE_INVALID: "AUTH_SMS_CODE_INVALID",
  AUTH_SMS_CODE_EXPIRED: "AUTH_SMS_CODE_EXPIRED",
  AUTH_SMS_ATTEMPTS_EXCEEDED: "AUTH_SMS_ATTEMPTS_EXCEEDED",
  AUTH_REFRESH_INVALID: "AUTH_REFRESH_INVALID",
  AUTH_CSRF_REJECTED: "AUTH_CSRF_REJECTED",
  AUTH_INSECURE_TRANSPORT: "AUTH_INSECURE_TRANSPORT",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_DISABLED: "USER_DISABLED",
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
  POLICY_ACCEPTANCE_REQUIRED: "POLICY_ACCEPTANCE_REQUIRED",
  POLICY_ACCEPTANCE_MISMATCH: "POLICY_ACCEPTANCE_MISMATCH",
  POLICY_CONFIGURATION_INCOMPLETE: "POLICY_CONFIGURATION_INCOMPLETE",
  IDENTITY_ALREADY_ACTIVE: "IDENTITY_ALREADY_ACTIVE",
  IDENTITY_NOT_FOUND: "IDENTITY_NOT_FOUND",
  IDENTITY_STATUS_INVALID: "IDENTITY_STATUS_INVALID",
  ADMIN_MFA_REQUIRED: "ADMIN_MFA_REQUIRED",
  ADMIN_PERMISSION_DENIED: "ADMIN_PERMISSION_DENIED",
  IDEMPOTENCY_KEY_CONFLICT: "IDEMPOTENCY_KEY_CONFLICT",
  IDEMPOTENCY_REQUEST_IN_PROGRESS: "IDEMPOTENCY_REQUEST_IN_PROGRESS",
  INBOX_PAYLOAD_CONFLICT: "INBOX_PAYLOAD_CONFLICT",
  RESOURCE_VERSION_CONFLICT: "RESOURCE_VERSION_CONFLICT",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes] | `${Uppercase<string>}_${Uppercase<string>}`;

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  request_id: string;
  field_errors: FieldError[];
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly fieldErrors: FieldError[];
  readonly details?: Record<string, unknown>;
  readonly expose: boolean;

  constructor(options: {
    code: ErrorCode;
    message: string;
    statusCode: number;
    fieldErrors?: FieldError[];
    details?: Record<string, unknown>;
    expose?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.fieldErrors = options.fieldErrors ?? [];
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}
