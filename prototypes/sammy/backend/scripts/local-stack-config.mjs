// PostgreSQL permits an empty authority with a Unix socket in the query string.
// WHATWG URL rejects that valid pg format, so parse only its query parameters.
export function socketDirectory(connectionString) {
 const queryStart=connectionString.indexOf('?');
 if(queryStart<0)return null;
 const host=new URLSearchParams(connectionString.slice(queryStart+1)).get('host');
 return host?.startsWith('/')?host:null;
}
