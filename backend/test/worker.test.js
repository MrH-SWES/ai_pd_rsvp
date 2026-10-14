import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {hashToken,validateSessions} from '../src/worker.js';
const token = 'a'.repeat(64), origin = 'https://example.github.io';
const sessions = [{id:'session-a',label:'Confirmed date',detail:'Time and location'}];
const answer = {experience:'A few times',tools:['ChatGPT'],uses:['Lesson planning'],beliefs:[],blockers:[],example:'  Example  ',question:'Question',availability:['session-a']};
async function fixture(options={}) {
  const hash = await hashToken(token);
  const db = {responses:new Map(),queries:[],prepare(sql) {
    db.queries.push(sql);
    return {bind(...args) { return {
      async first() {
        if(options.fail) throw Error('PRIVATE database details');
        if(sql.includes('FROM invitations')) return args[0]===hash && !options.revoked ? {hash,name:'Test invitee'} : null;
        if(sql.includes('FROM settings')) return {value:JSON.stringify(options.sessions ?? sessions)};
        throw Error('Unexpected query');
      },
      async run() {
        if (options.writeFail) return {success:false};
        assert.match(sql,/ON CONFLICT\(invitation_hash\) DO UPDATE/);
        db.responses.set(args[0],{payload:JSON.parse(args[1]),submitted_at:args[2]}); return {success:true};
      }
    };}};
  }};
  const env = {DB:db,ALLOWED_ORIGIN:origin};
  function call(path='/api/invitation', options={}) {
    const {headers={},method='GET',body,...extra} = options;
    return worker.fetch(new Request('https://api.example'+path,{method,headers:{origin,'X-Invitation':token,...headers},...(body===undefined?{}:{body}),...extra}),env);
  }
  const post = (a=answer,headers={}) => call('/api/response',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(a)});
  return {call,post,db,env,hash};
}
test('SHA-256 known vector; token never stored',async()=>{
  assert.equal(await hashToken('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const f=await fixture(); const r=await f.call();
  assert.equal(r.status,200); assert.deepEqual(await r.json(),{name:'Test invitee',sessions});
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'),origin);
  assert.ok(!f.db.queries.some(q=>q.includes('FROM responses')));
});
test('malformed, missing, unknown and revoked tokens rejected',async()=>{
  for(const t of ['', 'bad', 'b'.repeat(64),'A'.repeat(64)]) {const f=await fixture(); assert.equal((await f.call('/api/invitation',{headers:{'X-Invitation':t}})).status,404); assert.equal((await f.post(answer,{'X-Invitation':t})).status,403);}
  const f=await fixture({revoked:true}); assert.equal((await f.call()).status,404);
});
test('exact CORS origin and no missing/null origins; no credentials allowed',async()=>{
  const f=await fixture();
  for(const bad of ['null','','https://evil.example',origin+'/',origin+'.evil.example']) {
    const r=await f.call('/api/invitation',{headers:{origin:bad}}); assert.equal(r.status,403); assert.equal(r.headers.get('access-control-allow-origin'),null);
  }
  assert.equal(f.db.queries.length,0);
  const r=await f.call('/api/response',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-invitation'}});
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-credentials'),null);
  assert.equal((await f.call('/api/response',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'DELETE'}})).status,403);
  assert.equal((await f.call('/api/response',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'}})).status,403);
  f.env.ALLOWED_ORIGIN='*';assert.equal((await f.call()).status,403);
});
test('durable upsert uses hashed key; strips extra fields and trims text',async()=>{
  const f=await fixture();assert.equal((await f.post({...answer,admin:true})).status,200);
  assert.equal(f.db.responses.size,1);assert.equal(f.db.responses.get(f.hash).payload.example,'Example');assert.equal(f.db.responses.get(f.hash).payload.admin,undefined);
  assert.equal((await f.post({...answer,question:'Changed'})).status,200);assert.equal(f.db.responses.size,1);assert.equal(f.db.responses.get(f.hash).payload.question,'Changed');
  assert.ok(!f.db.responses.has(token));
});
test('invalid answer/session choices never write',async()=>{
  for(const change of [{experience:'unknown'},{tools:['unknown']},{tools:['ChatGPT','ChatGPT']},{tools:['ChatGPT','I don’t remember']},{beliefs:['A useful thinking partner','A fad','Potentially harmful']},{blockers:['Nothing in particular','Student privacy']},{example:'x'.repeat(501)},{question:'x'.repeat(3001)},{availability:[]},{availability:['invented']},{availability:['session-a','session-a']},{availability:['session-a','updates']},{availability:['neither','updates']}]) {
    const f=await fixture();assert.equal((await f.post({...answer,...change})).status,400);assert.equal(f.db.responses.size,0);
  }
  for(const a of [null,[],{},'string']) {const f=await fixture();assert.equal((await f.post(a)).status,400);}
  const f=await fixture();await f.post({...answer,experience:'Not yet'});assert.deepEqual(f.db.responses.get(f.hash).payload.tools,[]);
});
test('session config rejects malformed/duplicate/reserved IDs; no confirmed dates blocks saving',async()=>{
  for(const s of [[{id:'updates',label:'X',detail:''}],[sessions[0],sessions[0]],[{id:'x',label:'',detail:''}],{}]) assert.throws(()=>validateSessions(s));
  let f=await fixture({sessions:[]});assert.equal((await f.post()).status,409);
  f=await fixture({sessions:[{id:'neither',label:'bad',detail:''}]});assert.equal((await f.call()).status,503);
});
test('content type, malformed JSON, announced and streamed oversized bodies rejected',async()=>{
  const f=await fixture();assert.equal((await f.post(answer,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.call('/api/response',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await f.post(answer,{'Content-Length':'20001'})).status,413);
  const stream = new ReadableStream({start(c){c.enqueue(new Uint8Array(10001));c.enqueue(new Uint8Array(10001));c.close();}});
  assert.equal((await f.call('/api/response',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'})).status,413);
  assert.equal(f.db.responses.size,0);
});
test('no public admin, roster, export, or response read routes',async()=>{
  const f=await fixture(); for(const path of ['/api/admin','/api/export','/api/responses','/api/roster']) assert.equal((await f.call(path)).status,404);
  assert.equal((await f.call('/api/response')).status,405);assert.equal((await f.call('/api/invitation',{method:'POST'})).status,405);
});
test('storage failure is not reported as saved; private errors never leak',async()=>{
  const f=await fixture({writeFail:true}); assert.equal((await f.post()).status,503);
  const g=await fixture({fail:true});const r=await g.call();assert.equal(r.status,503);assert.ok(!(await r.text()).includes('PRIVATE'));
});


test('interest enum is recorded separately from experience for every level',async()=>{
  for(const interest of ['curious','interested','eager','eager_unsure']){
    const f=await fixture();const r=await f.post({...answer,interest,experience:'Not yet'});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
    const stored=f.db.responses.get(f.hash).payload;
    assert.equal(stored.interest,interest);assert.equal(stored.experience,'Not yet');assert.deepEqual(stored.tools,[]);
  }
});
test('invalid supplied interest never writes',async()=>{
  for(const interest of ['',null,[],['curious'],4,'extremely_interested']){
    const f=await fixture();assert.equal((await f.post({...answer,interest})).status,400);assert.equal(f.db.responses.size,0);
  }
});
test('legacy client/token remains compatible without assigning a false interest level',async()=>{
  const f=await fixture();assert.equal((await f.call()).status,200);assert.equal((await f.post(answer)).status,200);
  assert.equal('interest' in f.db.responses.get(f.hash).payload,false);
  assert.equal((await f.post({...answer,interest:'eager_unsure'})).status,200);
  assert.equal(f.db.responses.size,1);assert.equal(f.db.responses.get(f.hash).payload.interest,'eager_unsure');
});
