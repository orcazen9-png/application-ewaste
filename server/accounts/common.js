export function fail(message, status = 400) {
  throw Object.assign(new Error(message), {status});
}

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function requireId(value) { if (!validId(value)) fail('Invalid record reference.'); return value; }
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const hash = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value));

export async function bytes(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) fail('Request is too large.', 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); fail('Request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export async function body(request, limit = 30000) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('Use a JSON request.', 415);
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await bytes(request, limit))); }
  catch (error) { if (error.status) throw error; fail('Invalid JSON request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Use a JSON object.');
  return value;
}

export function text(value, maximum, label, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`Invalid ${label}.`);
  return value.trim();
}

export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
  return value;
}
export const rows = async statement => (await statement.all()).results;

export function requireRole(user, role) {
  if (user.role !== role) fail('This action is not available for this account role.', 403);
}

export function audit(db, userId, action, resourceId, version) {
  return db.prepare('INSERT INTO audit_events (id,actor_id,action,resource_id,resource_version,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id(), userId, action, resourceId, version, now());
}
