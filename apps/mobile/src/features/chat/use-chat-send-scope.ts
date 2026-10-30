import { useEffect, useMemo } from "react";
import { ChatSendScope } from "@/features/chat/chat-send-scope";

export function useChatSendScope(key: string) {
  const scope = useMemo(() => new ChatSendScope(key), [key]);
  useEffect(() => {
    scope.activate();
    return () => scope.dispose();
  }, [scope]);
  return scope;
}
