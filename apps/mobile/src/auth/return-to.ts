import type { Href } from "expo-router";

export type InternalReturnTo = Extract<Href, string>;

const staticRoutes = new Set<string>([
  "/(buyer-tabs)", "/(buyer-tabs)/messages", "/(buyer-tabs)/mine", "/(buyer-tabs)/orders",
  "/favorites", "/notifications", "/rules", "/search", "/support",
  "/settings", "/settings/identity", "/settings/media-avatar", "/settings/permissions",
  "/settings/privacy", "/settings/profile", "/settings/security", "/settings/sessions",
  "/seller/status", "/seller/apply", "/(seller-tabs)", "/(seller-tabs)/earnings",
  "/(seller-tabs)/orders", "/(seller-tabs)/services", "/seller/services/new"
]);

const dynamicRoutePatterns = [
  /^\/services\/[^/?#]+$/u,
  /^\/companions\/[^/?#]+(?:\/reviews)?$/u,
  /^\/users\/[^/?#]+$/u,
  /^\/orders\/[^/?#]+(?:\/pay)?$/u,
  /^\/refunds\/[^/?#]+$/u,
  /^\/complaints\/[^/?#]+$/u,
  /^\/reviews\/[^/?#]+$/u,
  /^\/conversations\/[^/?#]+$/u,
  /^\/notifications\/[^/?#]+$/u,
  /^\/support\/[^/?#]+$/u
];

const queryRoutes = new Map<string, readonly string[]>([
  ["/checkout/schedule", ["productId", "skuId"]],
  ["/checkout/confirm", ["productId", "skuId", "slotId", "startsAt"]]
]);

export function resolveInternalReturnTo(value: string | string[] | undefined, fallback: InternalReturnTo = "/(buyer-tabs)"): InternalReturnTo {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !isAllowedInternalRoute(candidate)) return fallback;
  return candidate as InternalReturnTo;
}

export function isAllowedInternalRoute(candidate: string): boolean {
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes(":") || candidate.includes("\\") || /%(?:2f|5c)/iu.test(candidate)) return false;
  let url: URL;
  try { url = new URL(candidate, "https://app.invalid"); } catch { return false; }
  if (url.origin !== "https://app.invalid" || url.hash) return false;
  if (staticRoutes.has(url.pathname)) return url.search === "";
  if (dynamicRoutePatterns.some((pattern) => pattern.test(url.pathname))) return url.search === "" && hasSafeSegments(url.pathname);
  const required = queryRoutes.get(url.pathname);
  if (!required) return false;
  if ([...url.searchParams.keys()].some((key) => !required.includes(key))) return false;
  return required.every((key) => hasSingleSafeValue(url.searchParams, key));
}

function hasSafeSegments(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).every((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== "." && decoded !== ".." && decoded.length > 0 && !decoded.includes("/") && !decoded.includes("\\");
    } catch { return false; }
  });
}

function hasSingleSafeValue(params: URLSearchParams, key: string): boolean {
  const values = params.getAll(key);
  return values.length === 1 && values[0] !== undefined && values[0].length > 0 && values[0].length <= 256;
}
