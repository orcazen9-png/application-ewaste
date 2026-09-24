import {audit, body, fail, hash, hex, id, json, now, requireId, rows, text} from './common.js';
import {otpProvider} from './otp-provider.js';

const languages = new Set(['en', 'hi', 'mr']);
const roles = new Set(['collector', 'recycler']);
const SESSION_MS = 24 * 60 * 60 * 1000;
export const publicUser = user => ({id: user.id, role: user.role, mobile: /^(invited|password):/.test(user.mobile)?'':user.mobile, username:user.username||'', identityMethod:user.username||user.mobile.startsWith('password:')?'password':user.mobile.startsWith('invited:')?'invitation':'sms', displayName: user.display_name,
  language: user.language, locality: user.locality, version: user.version});

export async function rate(env, subject, windowSeconds, limit) {
  if (typeof env.AUTH_RATE_SECRET !== 'string' || env.AUTH_RATE_SECRET.length < 32) fail('Mobile sign-in is not available yet.', 503);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_RATE_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const digest = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(subject)));
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const counter = await env.DB.prepare(`INSERT INTO auth_rate_limits (key,window,count) VALUES (?,?,1)
    ON CONFLICT(key,window) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`).bind(digest, window, limit).first();
  if (!counter) fail('Too many attempts. Please wait before trying again.', 429);
}

function mobile(value) {
  const result = text(value, 24, 'mobile number').replace(/[\s()-]/g, '');
  const normalized = /^[6-9]\d{9}$/.test(result) ? '+91' + result : result;
  // Initial service is India-only; country coverage is not silently expanded.
  if (!/^\+91[6-9]\d{9}$/.test(normalized)) fail('Enter a valid Indian mobile number.');
  return normalized;
}

export async function authRoute(request, env, path) {
  if (path === '/api/v1/auth/challenges' && request.method === 'POST') {
    const input = await body(request, 1000), phone = mobile(input.mobile), role = input.role, language = input.language || 'en';
    if (!roles.has(role) || !languages.has(language)) fail('Choose a valid role and language.');
    const provider = otpProvider(env);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    await rate(env, 'send-phone-minute:' + phone, 60, 1);
    await rate(env, 'send-phone-hour:' + phone, 3600, 5);
    await rate(env, 'send-ip-hour:' + ip, 3600, 15);
    await rate(env, 'send-global-day', 86400, 100);
    const challengeId = id(), time = now(), expires = new Date(Date.now() + 600000).toISOString();
    await env.DB.prepare(`INSERT INTO auth_challenges
      (id,mobile,requested_role,language,status,expires_at,created_at) VALUES (?,?,?,?,'sending',?,?)`)
      .bind(challengeId, phone, role, language, expires, time).run();
    try {
      const reference = await provider.start(phone, language);
      await env.DB.prepare("UPDATE auth_challenges SET provider_reference=?,status='pending' WHERE id=? AND status='sending'").bind(reference, challengeId).run();
    } catch (error) {
      await env.DB.prepare("UPDATE auth_challenges SET status='failed' WHERE id=?").bind(challengeId).run();
      throw error;
    }
    return json({challengeId, expiresAt: expires, resendAfterSeconds: 60}, 201);
  }
  if (path === '/api/v1/auth/verify' && request.method === 'POST') {
    const input = await body(request, 1000), challengeId = requireId(input.challengeId);
    if (typeof input.code !== 'string' || !/^\d{4,10}$/.test(input.code)) fail('Enter the verification code.');
    const provider = otpProvider(env);
    await rate(env, 'verify-ip-hour:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 3600, 40);
    const challenge = await env.DB.prepare(`UPDATE auth_challenges SET attempts=attempts+1
      WHERE id=? AND status='pending' AND expires_at>? AND attempts<5 RETURNING *`).bind(challengeId, now()).first();
    if (!challenge) fail('This code expired or reached its attempt limit. Request a new code.', 401);
    if (!await provider.verify(challenge.provider_reference, input.code)) fail('The verification code is incorrect or expired.', 401);
    const existing = await env.DB.prepare('SELECT role FROM users WHERE mobile=?').bind(challenge.mobile).first();
    if (existing && existing.role !== challenge.requested_role) fail('This account uses a different role. Go back and choose '+(existing.role==='collector'?'Aggregator':'Recycler')+'.',409);
    const time = now(), userId = id(), organizationId = id(), sessionToken = 'ews_' + hex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await hash(sessionToken), expires = new Date(Date.now() + SESSION_MS).toISOString();
    // Guard every side effect with the challenge's unique consumed_by value. Concurrent
    // verification can create at most one session even if the provider replies approved twice.
    const guard = "EXISTS (SELECT 1 FROM auth_challenges WHERE id=? AND consumed_by=?)";
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE auth_challenges SET status='consumed',consumed_by=? WHERE id=? AND status='pending' AND expires_at>?").bind(tokenHash, challengeId, time),
      env.DB.prepare(`INSERT INTO users (id,mobile,role,language,created_at,updated_at)
        SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(mobile) DO NOTHING`)
        .bind(userId, challenge.mobile, challenge.requested_role, challenge.language, time, time, challengeId, tokenHash),
      env.DB.prepare(`INSERT INTO organizations (id,owner_user_id,created_at)
        SELECT ?,id,? FROM users WHERE mobile=? AND role='recycler' AND status='active' AND ${guard}
        ON CONFLICT(owner_user_id) DO NOTHING`).bind(organizationId, time, challenge.mobile, challengeId, tokenHash),
      env.DB.prepare(`INSERT INTO memberships (user_id,organization_id,role)
        SELECT o.owner_user_id,o.id,'owner' FROM organizations o JOIN users u ON u.id=o.owner_user_id
        WHERE u.mobile=? AND ${guard} ON CONFLICT(user_id,organization_id) DO NOTHING`).bind(challenge.mobile, challengeId, tokenHash),
      env.DB.prepare(`INSERT INTO facilities (id,organization_id,created_at)
        SELECT ?,o.id,? FROM organizations o JOIN users u ON u.id=o.owner_user_id WHERE u.mobile=? AND ${guard}
        ON CONFLICT(organization_id) DO NOTHING`).bind(id(), time, challenge.mobile, challengeId, tokenHash),
      env.DB.prepare(`INSERT INTO sessions (token_hash,user_id,expires_at,created_at)
        SELECT ?,id,?,? FROM users WHERE mobile=? AND status='active' AND ${guard}`)
        .bind(tokenHash, expires, time, challenge.mobile, challengeId, tokenHash),
      env.DB.prepare(`INSERT INTO audit_events (id,actor_id,action,resource_id,resource_version,created_at)
        SELECT ?,user_id,'session.created',user_id,1,? FROM sessions WHERE token_hash=?`).bind(id(), time, tokenHash),
    ]);
    if (result[0].meta.changes !== 1 || result[5].meta.changes !== 1) fail('Sign-in could not be completed. Request a new code.', 401);
    const user = await env.DB.prepare('SELECT * FROM users WHERE mobile=?').bind(challenge.mobile).first();
    return json({token: sessionToken, expiresAt: expires, user: publicUser(user)}, 200);
  }
  return null;
}

export async function authenticate(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (ews_[a-f0-9]{64})$/)?.[1];
  if (!token) fail('Sign in to continue.', 401);
  const tokenHash = await hash(token);
  const user = await env.DB.prepare(`SELECT u.*,c.username FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN auth_credentials c ON c.user_id=u.id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active'`).bind(tokenHash, now()).first();
  if (!user) fail('Your session has ended. Sign in again; saved drafts are kept.', 401);
  return {...user, tokenHash};
}

export async function profileRoute(request, env, user, path) {
  if (path === '/api/v1/auth/logout' && request.method === 'POST') {
    await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').bind(now(), user.tokenHash),
      audit(env.DB, user.id, 'session.revoked', user.id, user.version),
    ]);
    return json({signedOut: true});
  }
  if (path !== '/api/v1/me') return null;
  if (request.method === 'GET') {
    const facilities = await rows(env.DB.prepare(`SELECT f.id,f.name,f.locality,
      CASE WHEN fp.status='approved' AND fp.valid_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired' ELSE f.verification_status END AS verificationStatus,
      CASE WHEN fp.facility_id IS NOT NULL THEN 'Freedom Value document review' ELSE 'Existing facility record' END AS reviewSource
      FROM facilities f JOIN memberships m ON m.organization_id=f.organization_id LEFT JOIN facility_profiles fp ON fp.facility_id=f.id WHERE m.user_id=?`).bind(user.id));
    return json({user: publicUser(user), facilities});
  }
  if (request.method === 'PUT') {
    const input = await body(request, 2000);
    if (input.role !== undefined || input.mobile !== undefined || input.status !== undefined) fail('Account role and mobile number cannot be changed here.');
    const name = text(input.displayName, 100, 'name'), locality = text(input.locality, 120, 'locality'), language = input.language;
    if (!name || !languages.has(language) || !Number.isSafeInteger(input.expectedVersion)) fail('Enter your name, language and current profile version.');
    const time = now();
    const writes = await env.DB.batch([
      env.DB.prepare(`UPDATE users SET display_name=?,locality=?,language=?,version=version+1,updated_at=?
        WHERE id=? AND version=?`).bind(name, locality, language, time, user.id, input.expectedVersion),
      env.DB.prepare(`INSERT INTO audit_events (id,actor_id,action,resource_id,resource_version,created_at)
        SELECT ?,?,'profile.updated',?,?,? WHERE changes()=1`).bind(id(),user.id,user.id,input.expectedVersion+1,time),
    ]);
    if (writes[0].meta.changes !== 1) fail('Your profile changed on another device. Refresh before saving.', 409);
    const updated = await env.DB.prepare('SELECT u.*,c.username FROM users u LEFT JOIN auth_credentials c ON c.user_id=u.id WHERE u.id=?').bind(user.id).first();
    return json({user: publicUser(updated)});
  }
  fail('Method not supported.', 405);
}
