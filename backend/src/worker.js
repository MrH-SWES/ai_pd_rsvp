import { validateAnswer } from './survey.js';

const LIMIT = 20_000;
class ClientError extends Error { constructor(message, status) { super(message); this.status = status; } }
export async function hashToken(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
}
export function validateSessions(value) {
  if (!Array.isArray(value) || value.length > 50 || value.some(s => !s || typeof s !== 'object' ||
      typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(s.id) || ['neither','updates'].includes(s.id) ||
      typeof s.label !== 'string' || !s.label.trim() || s.label.length > 200 ||
      typeof s.detail !== 'string' || s.detail.length > 500) || new Set(value.map(s => s.id)).size !== value.length) {
    throw Error('Invalid session configuration');
  }
  return value.map(({id,label,detail}) => ({id,label,detail}));
}
async function readJSON(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('content-type') || '')) {
    throw new ClientError('Use application/json.', 415);
  }
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMIT)) throw new ClientError('Response is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ClientError('Please review your answers.', 400);
  const chunks = []; let total = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > LIMIT) { await reader.cancel(); throw new ClientError('Response is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { throw new ClientError('Please review your answers.',400); }
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    let allowed = false;
    try {
      const u = new URL(env.ALLOWED_ORIGIN);
      allowed = u.origin === env.ALLOWED_ORIGIN && ['https:','http:'].includes(u.protocol) && origin === env.ALLOWED_ORIGIN;
    } catch { /* Configuration fails closed. */ }
    const headers = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if (allowed) headers['Access-Control-Allow-Origin'] = origin;
    const json = (value,status=200) => Response.json(value,{status,headers});
    if (!allowed) return json({error:'Please use your invitation page.'},403);
    const path = new URL(request.url).pathname;
    const method = path === '/api/invitation' ? 'GET' : path === '/api/response' ? 'POST' : null;
    if (!method) return json({error:'Not found.'},404);
    if (request.method === 'OPTIONS') {
      const requestedHeaders = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
      if (request.headers.get('access-control-request-method') !== method || requestedHeaders.some(h=>!['content-type','x-invitation'].includes(h))) return json({error:'Preflight rejected.'},403);
      return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':'Content-Type, X-Invitation','Access-Control-Max-Age':'600','Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'}});
    }
    if (request.method !== method) return new Response(JSON.stringify({error:'Method not allowed.'}),{status:405,headers:{...headers,Allow:method,'Content-Type':'application/json'}});
    try {
      const token = request.headers.get('x-invitation') || '';
      const invalidStatus = method === 'GET' ? 404 : 403;
      if (!/^[a-f0-9]{64}$/.test(token)) return json({error:'This invitation isn’t available.'},invalidStatus);
      const hash = await hashToken(token);
      const invitation = await env.DB.prepare('SELECT hash,name FROM invitations WHERE hash = ? AND revoked = 0').bind(hash).first();
      if (!invitation) return json({error:'This invitation isn’t available.'},invalidStatus);
      const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('sessions').first();
      const sessions = validateSessions(row ? JSON.parse(row.value) : []);
      if (method === 'GET') return json({name:invitation.name,sessions});
      if (!sessions.length) return json({error:'Session dates are still being confirmed. Please check back.'},409);
      const raw = await readJSON(request);
      let answer;
      try { answer = validateAnswer(raw,sessions); }
      catch (e) { throw new ClientError(e.message,400); }
      const result = await env.DB.prepare('INSERT INTO responses (invitation_hash,payload,submitted_at) VALUES (?,?,?) ON CONFLICT(invitation_hash) DO UPDATE SET payload=excluded.payload,submitted_at=excluded.submitted_at').bind(hash,JSON.stringify(answer),new Date().toISOString()).run();
      if (!result.success) throw Error('Write failed');
      return json({ok:true});
    } catch (e) {
      return json({error: e instanceof ClientError ? e.message : 'Service unavailable. Please try again.'}, e instanceof ClientError ? e.status : 503);
    }
  }
};
