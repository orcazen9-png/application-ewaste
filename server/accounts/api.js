import {CATALOG} from '../../dist/waste-catalog.js';
import {authenticate, authRoute, profileRoute} from './auth.js';
import {fileRoute} from './files.js';
import {lotRoute} from './lots.js';
import {fail, json} from './common.js';

export async function accountApi(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/api/v1/capabilities' && request.method === 'GET') {
    return json({accountsEnabled: env.ACCOUNTS_ENABLED === 'true', schemaVersion: 1});
  }
  // A new build cannot accidentally enable public account creation on the legacy live workspace.
  if (env.ACCOUNTS_ENABLED !== 'true') fail('Personal accounts are not available on this server yet.',503);
  const auth = await authRoute(request, env, path); if (auth) return auth;
  const user = await authenticate(request, env);
  const profile = await profileRoute(request, env, user, path); if (profile) return profile;
  if (path === '/api/v1/catalogue' && request.method === 'GET') return json(CATALOG);
  const file = path.match(/^\/api\/v1\/files\/([^/]+)$/);
  if (file) return fileRoute(request, env, user, file[1]);
  const lot = path.match(/^\/api\/v1\/lots(?:\/([^/]+))?$/);
  if (lot) return lotRoute(request, env, user, lot[1]);
  fail('Not found.',404);
}
