"use client";

import { useEffect, useState } from "react";

function replaceUrlParameter(parameter: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(parameter, value);
  else url.searchParams.delete(parameter);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function useSafeUrlChoice<T extends string>(parameter: string, fallback: T, allowedValues: readonly T[]): [T, (value: string) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    const candidate = new URLSearchParams(window.location.search).get(parameter) as T | null;
    return candidate !== null && allowedValues.includes(candidate) ? candidate : fallback;
  });

  useEffect(() => { replaceUrlParameter(parameter, value === fallback ? "" : value); }, [fallback, parameter, value]);
  return [value, (candidate) => setValue(allowedValues.includes(candidate as T) ? candidate as T : fallback)];
}

export function useSafeUrlDate(parameter: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return "";
    const candidate = new URLSearchParams(window.location.search).get(parameter) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/u.test(candidate) && Number.isFinite(Date.parse(`${candidate}T00:00:00.000Z`)) ? candidate : "";
  });

  useEffect(() => { replaceUrlParameter(parameter, value); }, [parameter, value]);
  return [value, setValue];
}
