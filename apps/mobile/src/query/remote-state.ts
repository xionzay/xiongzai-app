export type RemoteState = "loading" | "error" | "empty" | "success";

export function resolveRemoteState(input: {
  loading: boolean;
  error: boolean;
  itemCount: number;
}): RemoteState {
  if (input.loading) return "loading";
  if (input.error) return "error";
  if (input.itemCount === 0) return "empty";
  return "success";
}
