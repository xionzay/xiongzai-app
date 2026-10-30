// Only call with the result of the authenticated order-evidence access API.
// URLs remain ephemeral and are never put in query caches or device storage.
export function trustedEvidenceUrl(value: string): string {
  const url = new URL(value);
  const localHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/u.test(url.hostname);
  const production = process.env.EXPO_PUBLIC_APP_ENV === "production" || (process.env.NODE_ENV === "production" && process.env.EXPO_PUBLIC_APP_ENV !== "test");
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost && !production))) throw new Error('文件访问地址不安全');
  return url.toString();
}
