/** Keep public media and cookie API on the same configured local/same-origin backend. */
export function apiBaseUrl() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:3002/api/v1';
  const host = window.location.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/u.test(host)) {
    const api = new URL(window.location.origin); api.port = '3002'; api.pathname = '/api/v1'; return api.toString().replace(/\/$/u, '');
  }
  return '/api/v1';
}
