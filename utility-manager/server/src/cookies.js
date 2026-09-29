// Minimal cookie parsing and serialising (RFC 6265).
export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue;
    try { out[name] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[name] = part.slice(i + 1).trim(); }
  }
  return out;
}

export function serializeCookie(name, value, { path = '/', httpOnly, secure, sameSite, expires, maxAge } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}`;
  if (expires) s += `; Expires=${expires.toUTCString()}`;
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  if (httpOnly) s += '; HttpOnly';
  if (secure) s += '; Secure';
  if (sameSite) s += `; SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1).toLowerCase()}`;
  return s;
}
