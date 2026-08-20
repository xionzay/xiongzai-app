import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContextValue {
  requestId: string;
  traceId: string;
  actorId?: string;
  actorType?: "user" | "admin" | "service";
}

const storage = new AsyncLocalStorage<RequestContextValue>();

export const requestContext = {
  run<T>(context: RequestContextValue, callback: () => T): T {
    return storage.run(context, callback);
  },
  get(): RequestContextValue | undefined {
    return storage.getStore();
  },
  setActor(actorId: string, actorType: NonNullable<RequestContextValue["actorType"]>): void {
    const context = storage.getStore();
    if (context) Object.assign(context, { actorId, actorType });
  },
};
