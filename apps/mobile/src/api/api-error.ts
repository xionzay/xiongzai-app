import type { ApiErrorBody, ApiFieldError } from "@/types/api";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly fieldErrors: ApiFieldError[] = []
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function readApiError(response: Response): Promise<ApiClientError> {
  const body = await response.json().catch(() => ({})) as ApiErrorBody;
  return new ApiClientError(
    body.code ?? "HTTP_ERROR",
    body.message ?? "请求失败，请稍后重试",
    response.status,
    body.request_id,
    body.field_errors ?? []
  );
}

export function userFacingError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof TypeError) return "暂时无法连接服务，请检查网络后重试";
  return "请求失败，请稍后重试";
}
