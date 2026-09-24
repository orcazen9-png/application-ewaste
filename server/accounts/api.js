import {CATALOG} from '../../dist/waste-catalog.js';
import {authenticate, authRoute, profileRoute} from './auth.js';
import {fileRoute} from './files.js';
import {lotRoute} from './lots.js';
import {marketplaceRoute} from './marketplace.js';
import {assessmentRoute} from './assessments.js';
import {logisticsRoute} from './logistics.js';
import {fail, json} from './common.js';
import {invitationRoute} from './invitations.js';
import {financeRoute} from './finance.js';
import {personalInsights} from './finance-read.js';
import {passwordRoute} from './password-auth.js';

export async function accountApi(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/api/v1/capabilities' && request.method === 'GET') {
    return json({accountsEnabled: env.ACCOUNTS_ENABLED === 'true', invitationsEnabled:env.INVITATIONS_ENABLED==='true', passwordAuthEnabled:env.PASSWORD_AUTH_ENABLED==='true', schemaVersion: 3});
  }
  // A new build cannot accidentally enable public account creation on the legacy live workspace.
  if (env.ACCOUNTS_ENABLED !== 'true') fail('Personal accounts are not available on this server yet.',503);
  const password=await passwordRoute(request,env,path);if(password)return password;
  const invitation=await invitationRoute(request,env,path);if(invitation)return invitation;
  const auth = await authRoute(request, env, path); if (auth) return auth;
  const user = await authenticate(request, env);
  const insights=await personalInsights(request,env,user,path);if(insights)return insights;
  const finance=await financeRoute(request,env,user,path);if(finance)return finance;
  const profile = await profileRoute(request, env, user, path); if (profile) return profile;
  const logistics = await logisticsRoute(request, env, user, path); if (logistics) return logistics;
  const assessment = await assessmentRoute(request, env, user, path); if (assessment) return assessment;
  const market = await marketplaceRoute(request, env, user, path); if (market) return market;
  if (path === '/api/v1/catalogue' && request.method === 'GET') return json(CATALOG);
  const file = path.match(/^\/api\/v1\/files\/([^/]+)$/);
  if (file) return fileRoute(request, env, user, file[1]);
  const lot = path.match(/^\/api\/v1\/lots(?:\/([^/]+))?$/);
  if (lot) return lotRoute(request, env, user, lot[1]);
  fail('Not found.',404);
}
