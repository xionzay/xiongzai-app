import { AppState, type AppStateStatus } from "react-native";
import { useEffect, useState } from "react";

export function useAppActivity(): AppStateStatus {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setState);
    return () => subscription.remove();
  }, []);
  return state;
}
