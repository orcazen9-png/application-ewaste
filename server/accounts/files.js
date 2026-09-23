import {bytes, fail, hash, json, now, requireId, requireRole} from './common.js';

export function imageInfo(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let width, height, type;
  if (data.length >= 45 && [137,80,78,71,13,10,26,10].every((b,i) => data[i] === b)) {
    if (view.getUint32(8) !== 13 || String.fromCharCode(...data.slice(12,16)) !== 'IHDR') fail('Invalid PNG photo.');
    width = view.getUint32(16); height = view.getUint32(20); type = 'image/png';
    let offset = 8, ended = false, hasData = false;
    while (offset + 12 <= data.length) {
      const length = view.getUint32(offset), name = String.fromCharCode(...data.slice(offset+4, offset+8));
      if (length > data.length - offset - 12) fail('Incomplete PNG photo.');
      if (name === 'IDAT') hasData = true;
      offset += length + 12;
      if (name === 'IEND') { ended = length === 0 && offset === data.length; break; }
    }
    if (!ended || !hasData) fail('Incomplete PNG photo.');
  } else if (data.length > 12 && data[0] === 255 && data[1] === 216 && data.at(-2) === 255 && data.at(-1) === 217) {
    type = 'image/jpeg'; let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 255) fail('Invalid JPEG photo.');
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 218) break;
      if (marker === 217 || marker === 0 || marker === undefined) fail('Invalid JPEG photo.');
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset+2 > data.length) fail('Incomplete JPEG photo.');
      const length = view.getUint16(offset);
      if (length < 2 || offset+length > data.length) fail('Incomplete JPEG photo.');
      if ([192,193,194].includes(marker)) {
        if (length < 8) fail('Invalid JPEG photo.');
        height = view.getUint16(offset+3); width = view.getUint16(offset+5);
      }
      offset += length;
    }
  } else fail('Choose a complete JPEG or PNG photo.', 415);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 20000000) fail('Photo dimensions are unsupported. Use a smaller image.');
  return {width, height, type};
}

export async function fileRoute(request, env, user, fileId) {
  requireId(fileId);
  if (!env.ACCOUNT_BUCKET) fail('Photo storage is temporarily unavailable.', 503);
  const existing = await env.DB.prepare('SELECT * FROM files WHERE id=?').bind(fileId).first();
  if (existing && existing.owner_user_id !== user.id) fail('Photo not found.', 404);
  if (request.method === 'GET') {
    if (!existing || existing.state !== 'ready') fail('Photo not found.', 404);
    const object = await env.ACCOUNT_BUCKET.get(existing.object_key);
    if (!object) fail('Photo is unavailable. Please retry.', 503);
    return new Response(object.body, {headers: {'Content-Type': existing.mime_type,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline'}});
  }
  if (request.method !== 'PUT') fail('Method not supported.', 405);
  if (!['collector','recycler'].includes(user.role)) fail('Photo uploads require a personal account.',403);
  const data = await bytes(request, 2*1024*1024), info = imageInfo(data), digest = await hash(data);
  if (request.headers.get('Content-Type')?.split(';')[0] !== info.type) fail('The photo type does not match its contents.', 415);
  if (existing && existing.sha256 !== digest) fail('This photo reference already belongs to a different image.', 409);
  const key = `users/${user.id}/photos/${fileId}/${digest}`;
  if (!existing) {
    // The unique id fixes the bytes/key before upload. Two different payloads cannot overwrite each other.
    await env.DB.prepare(`INSERT INTO files (id,owner_user_id,object_key,mime_type,size_bytes,sha256,width,height,state,created_at)
      SELECT ?,?,?,?,?,?,?,?,'uploading',? WHERE
      (SELECT count(*) FROM files WHERE owner_user_id=?)<500 AND
      (SELECT COALESCE(sum(size_bytes),0) FROM files WHERE owner_user_id=?)+?<=104857600
      ON CONFLICT(id) DO NOTHING`)
      .bind(fileId, user.id, key, info.type, data.length, digest, info.width, info.height, now(),user.id,user.id,data.length).run();
    const claimed = await env.DB.prepare('SELECT owner_user_id,sha256 FROM files WHERE id=?').bind(fileId).first();
    if (!claimed) fail('Your photo storage allowance is full. Contact support before uploading more.',413);
    if (claimed.owner_user_id !== user.id || claimed.sha256 !== digest) fail('This photo reference is already in use.', 409);
  }
  if (existing?.state !== 'ready') {
    await env.ACCOUNT_BUCKET.put(key, data, {httpMetadata: {contentType: info.type}});
    await env.DB.prepare("UPDATE files SET state='ready' WHERE id=? AND owner_user_id=? AND sha256=?").bind(fileId, user.id, digest).run();
  }
  return json({id: fileId, sha256: digest, sizeBytes: data.length, mimeType: info.type, width: info.width, height: info.height}, existing ? 200 : 201);
}
