import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { useEffect, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { runtimeFlags } from "@/config/runtime-flags";
import { resolveQueryOnlineState } from "@/query/query-online-state";

export function QueryLifecycleSync({ children }: PropsWithChildren) {
  useEffect(() => onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => {
    setOnline(resolveQueryOnlineState({
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      appEnvironment: runtimeFlags.appEnvironment
    }));
  })), []);

  useEffect(() => {
    const setFocused = (state: typeof AppState.currentState) => {
      if (Platform.OS !== "web") focusManager.setFocused(state === "active");
    };
    setFocused(AppState.currentState);
    const subscription = AppState.addEventListener("change", setFocused);
    return () => subscription.remove();
  }, []);

  return children;
}
