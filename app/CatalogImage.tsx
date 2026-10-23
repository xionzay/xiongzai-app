"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const DEFAULT_PLAYER_IMAGE = "/assets/placeholders/player.svg";
export const DEFAULT_SERVICE_IMAGE = "/assets/placeholders/service.svg";
const cache = new Map<string, { expires: number; promise: Promise<string | null> }>();

function publicImage(fileId: string): Promise<string | null> {
  const existing = cache.get(fileId);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const base = new URL(window.location.origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (local) base.port = "3002";
  base.pathname = `/api/v1/files/${encodeURIComponent(fileId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const promise = fetch(base, { signal: controller.signal }).then(async response => {
    if (!response.ok) return null;
    const file = await response.json() as { mime_type?: string; content_url?: string };
    if (!file.mime_type?.startsWith("image/") || !file.content_url) return null;
    const url = new URL(file.content_url, base);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    // These three documented seed fixtures are old UI posters, not user uploads.
    if (local && /\/manual-test\/images\/approved-(seller-avatar|seller-cover|product-cover)\.png$/.test(url.pathname)) return null;
    return url.href;
  }).catch(() => null).finally(() => clearTimeout(timeout));
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(fileId, { expires: Date.now() + 60000, promise });
  return promise;
}

export function CatalogImage({ src, alt, fileId, kind = "service", className = "", fallbackSrc }: { fallbackSrc?: string; src?: string; alt: string; fileId?: string | null; kind?: "avatar" | "service"; className?: string }) {
  const fallback = fallbackSrc ?? (kind === "avatar" ? DEFAULT_PLAYER_IMAGE : DEFAULT_SERVICE_IMAGE);
  // Order snapshots contain approved file IDs, not image URLs.
  const resolvedFileId = fileId ?? (src && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(src) ? src : null);
  const legacy = src && /^\/assets\/(player-(kirito|luye|xiaoyou|susu|poster)|product-hero|home-hero|publish-arcade)\.png$/.test(src);
  const [remote, setRemote] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!resolvedFileId) return;
    let active = true;
    void publicImage(resolvedFileId).then(url => { if (active) setRemote({ id: resolvedFileId, url }); });
    return () => { active = false; };
  }, [resolvedFileId]);
  const candidate = resolvedFileId ? (remote?.id === resolvedFileId ? remote.url : null) ?? fallback : legacy ? fallback : src || fallback;
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  const broken = failed === candidate;
  const shown = broken ? fallback : candidate;
  const placeholder = shown === fallback;
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const node = image.current;
    // Cached images may finish before React attaches onLoad; show them without a new fade.
    node?.classList.toggle("is-cached", Boolean(node.complete && node.naturalWidth > 0));
  }, [shown]);
  return <img ref={image} className={`catalog-image ${className}${loaded === shown ? " is-ready" : ""}${placeholder ? " is-placeholder" : ""}`} src={shown} alt={alt === "" ? "" : placeholder ? `${alt}（默认${kind === "avatar" ? "头像" : "封面"}）` : alt} width={256} height={256} decoding="async" draggable={false} onLoad={() => setLoaded(shown)} onError={() => { if (!broken) setFailed(candidate); }} />;
}
