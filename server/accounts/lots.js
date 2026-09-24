import {begin,commit} from './commands.js';
import {CATALOG} from '../../dist/waste-catalog.js';
import {body, canonical, fail, hash, id, json, now, requireId, requireRole, rows, text} from './common.js';

const broadCodes = new Set(CATALOG.broad_categories.map(c => c.id));
const detailedCodes = new Set(CATALOG.categories.map(c => c.code));
export function quantityBase(value, unit) {
  if (!['kg','piece'].includes(unit)) fail('Choose kg or pieces.');
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !(unit === 'kg' ? /^\d{1,6}(\.\d{1,3})?$/ : /^\d{1,6}$/).test(value)) fail('Enter a valid quantity; pieces must be whole numbers.');
  const [whole, fraction = ''] = value.split('.');
  const amount = unit === 'kg' ? Number(whole)*1000 + Number(fraction.padEnd(3, '0')) : Number(whole);
  if (amount <= 0 || amount > (unit === 'kg' ? 50000000 : 50000)) fail('Quantity must be greater than zero and at most 50,000.');
  return amount;
}

function normalize(input) {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) fail('Refresh this draft before saving.');
  requireId(input.commandId);
  if (input.taxonomyVersion !== CATALOG.version) fail('Refresh the category catalogue before saving.', 409);
  if (!Array.isArray(input.items) || input.items.length > 20 || !Array.isArray(input.fileIds) || input.fileIds.length > 10) fail('A draft can contain up to 20 items and 10 photos.');
  const itemIds = new Set();
  const items = input.items.map(item => {
    if (!item || typeof item !== 'object') fail('Invalid material line.');
    const itemId = requireId(item.id);
    if (itemIds.has(itemId)) fail('Duplicate material line.'); itemIds.add(itemId);
    const broadCode = item.broadCode || null, detailedCode = item.detailedCode || null;
    if (broadCode !== null && !broadCodes.has(broadCode)) fail('Unknown broad category.');
    if (detailedCode !== null && !detailedCodes.has(detailedCode)) fail('Unknown equipment category.');
    if (detailedCode !== null && broadCode !== null && CATALOG.categories.find(c=>c.code===detailedCode).broad_category_id!==broadCode) fail('The detailed category does not belong to this broad group. Review the category.');
    if (!['unknown','unsorted','sorted','damaged'].includes(item.condition)) fail('Choose a valid condition.');
    if (!['needs_review','confirmed'].includes(item.reviewState) || (item.reviewState === 'confirmed' && !broadCode)) fail('Confirm a category or mark it for review.');
    return {id: itemId, broadCode, detailedCode, name:text(item.name||'',120,'item name'), description: text(item.description, 1000, 'description'),
      condition: item.condition, unit: item.unit, quantityBase: quantityBase(item.quantity, item.unit), reviewState: item.reviewState};
  });
  const fileIds = input.fileIds.map(requireId);
  if (new Set(fileIds).size !== fileIds.length) fail('Duplicate photo.');
  const appliedPhotos=Object.fromEntries(fileIds.filter(f=>input.appliedPhotos?.[f]===true).map(f=>[f,true]));
  return {appliedPhotos,title: text(input.title, 120, 'title'), locality: text(input.locality, 120, 'locality'),
    notes: text(input.notes, 3000, 'notes'), items, fileIds, taxonomyVersion: CATALOG.version};
}

function project(lot, items, files) {
  return {deletedAt:lot.deleted_at||null,id: lot.id, title: lot.title, locality: lot.locality, notes: lot.notes, status: lot.status, version: lot.version,
    appliedPhotos:JSON.parse(lot.assessment_photos_json||'{}'),taxonomyVersion: CATALOG.version, createdAt: lot.created_at, updatedAt: lot.updated_at, fileIds: files.map(f => f.file_id),
    items: items.map(i => ({id: i.id, name:i.name, broadCode: i.broad_code, detailedCode: i.detailed_code, description: i.description,
      condition: i.condition, unit: i.unit, quantity: i.quantity_base === null ? null : i.unit === 'kg'
        ? `${Math.floor(i.quantity_base/1000)}.${String(i.quantity_base%1000).padStart(3,'0')}` : String(i.quantity_base),
      reviewState: i.review_state}))};
}

async function projectPage(env, lots) {
  if (!lots.length) return [];
  const ids = lots.map(lot => lot.id), placeholders = ids.map(() => '?').join(',');
  // Bounded bulk reads avoid exceeding D1's per-invocation query budget on a full page.
  const [items, files] = await Promise.all([
    rows(env.DB.prepare(`SELECT * FROM lot_items WHERE lot_id IN (${placeholders}) ORDER BY id`).bind(...ids)),
    rows(env.DB.prepare(`SELECT lot_id,file_id FROM lot_files WHERE lot_id IN (${placeholders}) ORDER BY file_id`).bind(...ids)),
  ]);
  return lots.map(lot => project(lot, items.filter(item => item.lot_id === lot.id), files.filter(file => file.lot_id === lot.id)));
}

export async function lotRoute(request, env, user, lotId) {
  requireRole(user, 'collector');
  if (!lotId && request.method === 'GET') {
    const url = new URL(request.url), cursor = url.searchParams.get('after') || '';
    if (cursor) requireId(cursor);
    const lots = await rows(env.DB.prepare('SELECT l.*,d.deleted_at FROM lots l LEFT JOIN lot_deletions d ON d.lot_id=l.id WHERE l.owner_user_id=? AND l.id>? ORDER BY l.id LIMIT 51').bind(user.id, cursor));
    const page = lots.slice(0,50);
    return json({lots: await projectPage(env, page.filter(l=>!l.deleted_at)),deletedLots:page.filter(l=>l.deleted_at).map(l=>l.id), nextCursor: lots.length > 50 ? page.at(-1).id : null});
  }
  requireId(lotId);
  const existing = await env.DB.prepare('SELECT l.*,d.deleted_at FROM lots l LEFT JOIN lot_deletions d ON d.lot_id=l.id WHERE l.id=?').bind(lotId).first();
  if (existing && existing.owner_user_id !== user.id) fail('Draft not found.', 404);
  if (request.method === 'GET') {
    if (!existing) fail('Draft not found.', 404);
    return json({lot: (await projectPage(env, [existing]))[0]});
  }
  if(request.method==='DELETE'){
    const c=await begin(request,env,{...user,actor:'user:'+user.id});if(c.previous)return c.previous;
    if(!existing)fail('Lot not found.',404);
    if(existing.deleted_at)return json({id:lotId,deleted:true});
    if(existing.version!==c.input.expectedVersion)fail('This lot changed. Refresh before deleting.',409);
    if(await env.DB.prepare("SELECT 1 FROM reservations WHERE lot_id=? AND state='held'").bind(lotId).first())fail('Resolve the active order before deleting this lot.',409);
    const time=now();return commit(env,c,env.DB.prepare('INSERT INTO lot_deletions SELECT id,?,? FROM lots WHERE id=? AND owner_user_id=? AND version=?').bind(time,user.id,lotId,user.id,c.input.expectedVersion),{id:lotId,deleted:true},[
      (g,a)=>env.DB.prepare(`UPDATE lot_listings SET state='withdrawn',version=version+1,updated_at=? WHERE lot_id=? AND ${g}`).bind(time,lotId,...a),
      (g,a)=>env.DB.prepare(`INSERT INTO market_events SELECT lower(hex(randomblob(16))),id,?,'withdrawn','Aggregator deleted this lot',? FROM supply_requests WHERE lot_id=? AND state IN ('submitted','clarification') AND ${g}`).bind(user.id,time,lotId,...a),
      (g,a)=>env.DB.prepare(`UPDATE supply_requests SET state='withdrawn',version=version+1,updated_at=? WHERE lot_id=? AND state IN ('submitted','clarification') AND ${g}`).bind(time,lotId,...a),
      (g,a)=>env.DB.prepare(`INSERT INTO audit_events(id,actor_id,action,resource_id,resource_version,created_at) SELECT ?,?,'lot.deleted',?,?,? WHERE ${g}`).bind(id(),user.id,lotId,existing.version,time,...a)
    ]);
  }
  if(existing?.deleted_at)fail('This lot was deleted. Refresh your lots.',410);
  if (request.method !== 'PUT') fail('Method not supported.', 405);
  const input = await body(request), normalized = normalize(input);
  const payloadHash = await hash(canonical({path: lotId, expectedVersion: input.expectedVersion, ...normalized}));
  const replay = async () => {
    const receipt = await env.DB.prepare('SELECT * FROM command_receipts WHERE actor_id=? AND command_id=?').bind(user.id, input.commandId).first();
    if (!receipt) return null;
    if (receipt.payload_hash !== payloadHash) fail('This retry does not match the saved action.', 409);
    return json({...JSON.parse(receipt.result_json), replayed: true});
  };
  const previous = await replay(); if (previous) return previous;
  if ((existing?.version || 0) !== input.expectedVersion) fail('This draft changed on another device. Refresh before saving.', 409);
  for (const fileId of normalized.fileIds) {
    const file = await env.DB.prepare("SELECT id FROM files WHERE id=? AND owner_user_id=? AND state='ready'").bind(fileId, user.id).first();
    if (!file) fail('Upload all photos to this account before syncing the draft.', 409);
  }
  const version = input.expectedVersion+1, time = now(), result = {id: lotId, version, updatedAt: time};
  const guard = 'EXISTS (SELECT 1 FROM lots WHERE id=? AND owner_user_id=? AND version=? AND last_command=?)';
  const guardArgs = [lotId, user.id, version, input.commandId];
  const writes = [env.DB.prepare(`INSERT INTO lots
    (id,owner_user_id,title,locality,notes,status,version,last_command,created_at,updated_at)
    VALUES (?,?,?,?,?,'draft',1,?,?,?) ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,locality=excluded.locality,notes=excluded.notes,version=lots.version+1,
    last_command=excluded.last_command,updated_at=excluded.updated_at WHERE lots.owner_user_id=? AND lots.version=?`)
    .bind(lotId, user.id, normalized.title, normalized.locality, normalized.notes, input.commandId, time, time, user.id, input.expectedVersion),
  env.DB.prepare(`DELETE FROM lot_items WHERE lot_id=? AND ${guard}`).bind(lotId, ...guardArgs),
  env.DB.prepare(`DELETE FROM lot_files WHERE lot_id=? AND ${guard}`).bind(lotId, ...guardArgs)];
  writes.push(env.DB.prepare(`UPDATE lots SET assessment_photos_json=? WHERE id=? AND ${guard}`).bind(JSON.stringify(normalized.appliedPhotos),lotId,...guardArgs));
  for (const item of normalized.items) writes.push(env.DB.prepare(`INSERT INTO lot_items
    (lot_id,id,taxonomy_version,broad_code,detailed_code,description,condition,unit,quantity_base,review_state,name)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(lotId, item.id, CATALOG.version, item.broadCode, item.detailedCode,
      item.description, item.condition, item.unit, item.quantityBase, item.reviewState, item.name, ...guardArgs));
  for (const fileId of normalized.fileIds) writes.push(env.DB.prepare(`INSERT INTO lot_files (lot_id,file_id) SELECT ?,? WHERE ${guard}`).bind(lotId,fileId,...guardArgs));
  writes.push(env.DB.prepare(`INSERT INTO audit_events (id,actor_id,action,resource_id,resource_version,created_at)
    SELECT ?,?,'draft.saved',?,?,? WHERE ${guard}`).bind(id(),user.id,lotId,version,time,...guardArgs));
  writes.push(env.DB.prepare(`INSERT INTO command_receipts (actor_id,command_id,payload_hash,result_json,created_at)
    SELECT ?,?,?,?,? WHERE ${guard}`).bind(user.id,input.commandId,payloadHash,JSON.stringify(result),time,...guardArgs));
  let committed;
  try { committed = await env.DB.batch(writes); }
  catch (error) { const retry = await replay(); if (retry) return retry; if(error.message?.includes('MARKET_CONFLICT:'))fail('This lot has reserved stock. Cancel the uncollected order or create a separate lot before editing.',409); throw error; }
  if (committed[0].meta.changes !== 1) { const retry = await replay(); if (retry) return retry; fail('This draft changed on another device. Refresh before saving.',409); }
  return json({...result, replayed:false}, existing ? 200 : 201);
}
