import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubmission,validSubmission} from '../lib/sheets.ts';
import {emptyAnswer} from '../lib/survey.ts';
import {PENDING_KEY,PENDING_TTL_MS,loadPending,storePending,clearPending} from '../lib/pending.ts';
const endpoint='https://script.google.com/macros/s/'+'A'.repeat(40)+'/exec';
const NOW=Date.parse('2026-10-15T05:00:00Z');
const payload=()=>createSubmission('Taylor 教师',{...emptyAnswer,interest:'curious',experience:'Regularly',tools:['Claude'],example:'Dictated words.',question:'Can it help?',availability:['session-a']});
function fixture(){const values=new Map();return {values,sessionStorage:{getItem(key){return values.get(key)??null;},setItem(key,value){values.set(key,value);},removeItem(key){values.delete(key);}}};}
const saved=(p=payload())=>({version:1,endpoint,createdAt:NOW,payload:p});
function put(f,record){f.values.set(PENDING_KEY,JSON.stringify(record));}
test('no saved envelope means no invented response or restore notice',()=>{const f=fixture();assert.deepEqual(loadPending(endpoint,f,NOW),{payload:null,notice:'',storageAvailable:true,blocked:false});assert.equal(f.values.size,0);});
test('pending exact ID, name, all answers and text survive a same-tab reload',()=>{const f=fixture(),p=payload();assert(storePending(endpoint,p,f,NOW));const restored=loadPending(endpoint,f,NOW+1000);assert.deepEqual(restored.payload,p);assert.match(restored.notice,/still unconfirmed/);assert(restored.storageAvailable);assert.equal(restored.payload.requestId,p.requestId);});
test('persisted snapshot is independent of subsequent object mutation',()=>{const f=fixture(),p=payload(),original=structuredClone(p);assert(storePending(endpoint,p,f,NOW));p.answers.tools.push('ChatGPT');p.answers.example='changed';assert.deepEqual(loadPending(endpoint,f,NOW).payload,original);});
test('an identical retry keeps the original age and exact envelope',()=>{const f=fixture(),p=payload();assert(storePending(endpoint,p,f,NOW));const first=f.values.get(PENDING_KEY);assert(storePending(endpoint,p,f,NOW+10000));assert.equal(f.values.get(PENDING_KEY),first);});
test('successful matching acknowledgement can clear the pending record',()=>{const f=fixture(),p=payload();storePending(endpoint,p,f,NOW);assert(clearPending(endpoint,p,f));assert.equal(f.values.has(PENDING_KEY),false);assert.equal(loadPending(endpoint,f,NOW).payload,null);});
test('clearing another request never deletes a different pending envelope',()=>{const f=fixture(),p=payload();storePending(endpoint,p,f,NOW);const raw=f.values.get(PENDING_KEY);assert.equal(clearPending(endpoint,payload(),f),false);assert.equal(f.values.get(PENDING_KEY),raw);});
test('a separate tab has no implied cross-tab restoration',()=>{const f=fixture();storePending(endpoint,payload(),f,NOW);assert.equal(loadPending(endpoint,fixture(),NOW).payload,null);});
for(const [label,change] of [
 ['expired',r=>{r.createdAt=NOW-PENDING_TTL_MS-1;}],['future timestamp',r=>{r.createdAt=NOW+1;}],['fractional timestamp',r=>{r.createdAt=1.5;}],
 ['wrong endpoint',r=>{r.endpoint=endpoint.replace('AAAA','BBBB');}],['invalid endpoint',r=>{r.endpoint='https://evil.test/';}],
 ['wrong version',r=>{r.version=2;}],['unexpected key',r=>{r.email='private';}],['missing timestamp',r=>{delete r.createdAt;}],
 ['bad request ID',r=>{r.payload.requestId='forged';}],['wrong UUID version',r=>{r.payload.requestId='00000000-0000-1000-8000-000000000001';}],
 ['missing response name',r=>{delete r.payload.responseName;}],['invalid response name',r=>{r.payload.responseName=' ';}],
 ['missing answer',r=>{delete r.payload.answers.question;}],['unknown answer key',r=>{r.payload.answers.email='private';}],
 ['unknown envelope key',r=>{r.payload.origin='https://evil.test';}],['invalid choices',r=>{r.payload.answers.tools=['forged'];}],
 ['duplicate choices',r=>{r.payload.answers.tools=['Claude','Claude'];}],['conflicting exclusive choices',r=>{r.payload.answers.tools=['Claude','I don’t remember'];}],
 ['invalid availability',r=>{r.payload.answers.availability=['session-a','session-b'];}],['oversized written text',r=>{r.payload.answers.question='x'.repeat(3001);}]
])test('invalid persisted '+label+' is never restored or transmitted',()=>{const f=fixture(),record=saved();change(record);put(f,record);const result=loadPending(endpoint,f,NOW);assert.equal(result.payload,null);assert.match(result.notice,/contact the organizer/);assert.equal(result.blocked,true);assert.equal(f.values.get(PENDING_KEY),JSON.stringify(record));});
test('malformed JSON and oversized records are retained and blocked without a fake storage-denial claim',()=>{for(const raw of ['{bad','x'.repeat(25000),'null','[]']){const f=fixture();f.values.set(PENDING_KEY,raw);const result=loadPending(endpoint,f,NOW);assert.equal(result.payload,null);assert.equal(result.storageAvailable,true);assert.match(result.notice,/cannot be safely restored/);assert.equal(result.blocked,true);assert.equal(f.values.get(PENDING_KEY),raw);}});
test('storage getter denial is caught without losing the current in-memory payload',()=>{const p=payload(),f={get sessionStorage(){throw Error('denied');}};assert.equal(storePending(endpoint,p,f,NOW),false);assert.equal(loadPending(endpoint,f,NOW).storageAvailable,false);assert.equal(clearPending(endpoint,p,f),false);assert(validSubmission(p));});
test('quota failure and silent dropped writes never claim a persisted copy',()=>{for(const setItem of [()=>{throw Error('quota');},()=>{}]){const f=fixture();f.sessionStorage.setItem=setItem;assert.equal(storePending(endpoint,payload(),f,NOW),false);}});
test('remove failure is explicit and cannot claim successful clearing',()=>{const f=fixture(),p=payload();storePending(endpoint,p,f,NOW);f.sessionStorage.removeItem=()=>{throw Error('denied');};assert.equal(clearPending(endpoint,p,f),false);assert(f.values.has(PENDING_KEY));});
test('invalid new envelopes are never written',()=>{const f=fixture();const p=payload();p.answers.question=null;assert.equal(storePending(endpoint,p,f,NOW),false);assert.equal(storePending('https://evil.test',payload(),f,NOW),false);assert.equal(f.values.size,0);});
test('strict validation catches sparse or extra-property arrays before persistence',()=>{const p=payload();p.answers.tools=new Array(1);assert(!validSubmission(p));p.answers.tools=['Claude'];p.answers.tools.extra='forged';assert(!validSubmission(p));});

test('storage writer never replaces a different, malformed, expired, or incompatible pending record',()=>{for(const raw of ['{bad',JSON.stringify(saved()),JSON.stringify({...saved(),version:2}),JSON.stringify({...saved(),createdAt:NOW-PENDING_TTL_MS-1})]){const f=fixture();f.values.set(PENDING_KEY,raw);assert.equal(storePending(endpoint,payload(),f,NOW),false);assert.equal(f.values.get(PENDING_KEY),raw);}});

test('confirmed clearing requires the exact payload, endpoint and compatible stored schema',()=>{for(const change of [r=>{r.payload.answers.question='changed';},r=>{r.endpoint=endpoint.replace('AAAA','BBBB');},r=>{r.version=2;},r=>{r.extra='incompatible';}]){const f=fixture(),p=payload(),record=saved(structuredClone(p));change(record);put(f,record);const raw=f.values.get(PENDING_KEY);assert.equal(clearPending(endpoint,p,f),false);assert.equal(f.values.get(PENDING_KEY),raw);}});
