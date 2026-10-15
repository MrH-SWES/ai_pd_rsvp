import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetsFetchTransport,MAX_ACK_BYTES} from '../lib/sheets-fetch.ts';
import {PARENT_ORIGIN,createSubmission} from '../lib/sheets.ts';
import {emptyAnswer} from '../lib/survey.ts';
const endpoint='https://script.google.com/macros/s/'+'A'.repeat(40)+'/exec';
const payload=()=>createSubmission('Taylor 教师',{...emptyAnswer,interest:'curious',experience:'Not yet',example:'Dictated text.',availability:['session-a']});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const timers=new Map(),calls=[];let next=0,resolveFetch,rejectFetch;
 const host={location:{origin:PARENT_ORIGIN},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);},fetch(url,options){calls.push({url,options});return new Promise((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject;});}};host.top=host;
 return {host,timers,calls,resolve:r=>resolveFetch(r),reject:e=>rejectFetch(e),timeout(){[...timers.values()][0]();}};
}
function response(ack,options={}){
 const state={canceled:false,reads:0};
 const chunks=options.chunks??[new TextEncoder().encode(typeof ack==='string'?ack:JSON.stringify(ack))];
 const body=new ReadableStream({pull(controller){state.reads++;if(options.hang)return;if(chunks.length)controller.enqueue(chunks.shift());else controller.close();},cancel(){state.canceled=true;}});
 return {type:'cors',ok:true,status:200,url:'https://script.googleusercontent.com/macros/echo?user_content_key=public',headers:new Headers({'content-type':'application/json; charset=utf-8'}),body,...options,state};
}
const ack=p=>({ok:true,requestId:p.requestId});
test('candidate uses exact endpoint, credential-free simple POST, exact body and no URL answers',async()=>{
 const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);
 assert.equal(f.calls.length,1);const {url,options}=f.calls[0];assert.equal(url,endpoint);assert(!url.includes(p.requestId));assert.equal(options.method,'POST');assert.equal(options.mode,'cors');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'follow');assert.equal(options.referrerPolicy,'no-referrer');assert.deepEqual(options.headers,{'Content-Type':'text/plain;charset=UTF-8'});assert.equal(options.body,JSON.stringify(p));assert(options.signal instanceof AbortSignal);
 f.resolve(response(ack(p)));assert.deepEqual(await saving,ack(p));assert.equal(f.timers.size,0);
});
test('POST serializes a frozen snapshot before waiting for a response',async()=>{const f=fixture(),p=payload(),original=JSON.stringify(p),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);p.answers.question='changed after send';assert.equal(f.calls[0].options.body,original);f.resolve(response(ack(p)));await saving;});
test('streamed Unicode JSON acknowledgement is decoded across split code points',async()=>{const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);const raw=new TextEncoder().encode(JSON.stringify({ok:false,requestId:p.requestId,error:'再试一次'}));f.resolve(response(null,{chunks:Array.from(raw,byte=>new Uint8Array([byte]))}));await assert.rejects(saving,/再试一次/);});
for(const [label,make] of [
 ['opaque',p=>response(ack(p),{type:'opaque',status:0,ok:false})],['opaque redirect',p=>response(ack(p),{type:'opaqueredirect'})],['basic non-CORS',p=>response(ack(p),{type:'basic'})],
 ['HTTP failure',p=>response(ack(p),{ok:false,status:500})],['HTML error page',p=>response('<html>Google Drive error</html>',{headers:new Headers({'content-type':'text/html'})})],
 ['account redirect',p=>response(ack(p),{url:'https://accounts.google.com/login'})],['untrusted origin',p=>response(ack(p),{url:'https://evil.test/echo'})],
 ['HTTP final URL',p=>response(ack(p),{url:'http://script.googleusercontent.com/macros/echo'})],['embedded credentials',p=>response(ack(p),{url:'https://user:pass@script.googleusercontent.com/macros/echo'})],
 ['wrong request ID',p=>response({ok:true,requestId:crypto.randomUUID()})],['string success',p=>response({ok:'true',requestId:p.requestId})],['missing request ID',p=>response({ok:true})],
 ['extra success field',p=>response({...ack(p),answers:[]})],['array acknowledgement',p=>response([ack(p)])],['null acknowledgement',p=>response(null)],
 ['malformed JSON',p=>response('{bad')],['empty body',p=>response('')],['missing stream',p=>response(ack(p),{body:null})],
 ['oversized announced body',p=>response(ack(p),{headers:new Headers({'content-type':'application/json','content-length':'2049'})})],
 ['invalid announced length',p=>response(ack(p),{headers:new Headers({'content-type':'application/json','content-length':'invalid'})})],
 ['extra failure field',p=>response({ok:false,requestId:p.requestId,error:'Please retry',answers:[]})],['unbounded server error',p=>response({ok:false,requestId:p.requestId,error:'x'.repeat(251)})],
 ['missing failure message',p=>response({ok:false,requestId:p.requestId})],['empty failure message',p=>response({ok:false,requestId:p.requestId,error:''})]
])test('never reports saved for '+label,async()=>{const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);f.resolve(make(p));await assert.rejects(saving,/couldn’t confirm/);assert(f.calls[0].options.signal.aborted);assert.equal(f.timers.size,0);});
test('actual stream is capped at 2KB even without content-length and canceled when exceeded',async()=>{const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);const r=response(null,{chunks:[new Uint8Array(MAX_ACK_BYTES),new Uint8Array(1),new Uint8Array(10000)]});f.resolve(r);await assert.rejects(saving,/couldn’t confirm/);assert(r.state.canceled);assert(f.calls[0].options.signal.aborted);});
test('invalid UTF-8 is rejected instead of silently decoding replacement characters',async()=>{const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);f.resolve(response(null,{chunks:[new Uint8Array([0xff])]}));await assert.rejects(saving,/couldn’t confirm/);});
test('controlled server error preserves its safe text without claiming success',async()=>{const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);f.resolve(response({ok:false,requestId:p.requestId,error:'Response collection is busy. Please retry.'}));await assert.rejects(saving,/busy/);});
test('network errors expose no private exception details',async()=>{const f=fixture(),saving=createSheetsFetchTransport(endpoint,f.host).submit(payload());f.reject(Error('secret network diagnostic'));await assert.rejects(saving,error=>!error.message.includes('secret')&&/couldn’t confirm/.test(error.message));});
test('independent deadline settles even if fetch completely ignores abort',async()=>{const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p);f.timeout();await assert.rejects(saving,/did not confirm in time/);assert(f.calls[0].options.signal.aborted);assert.equal(f.timers.size,0);f.resolve(response(ack(p)));await tick();});
test('independent deadline also settles a response stream that ignores abort',async()=>{const f=fixture(),p=payload(),saving=createSheetsFetchTransport(endpoint,f.host).submit(p),r=response(null,{hang:true});f.resolve(r);await tick();f.timeout();await assert.rejects(saving,/did not confirm in time/);assert(r.state.canceled);assert.equal(f.timers.size,0);});
test('explicit retry sends the identical envelope, never a new generated ID',async()=>{const f=fixture(),p=payload(),transport=createSheetsFetchTransport(endpoint,f.host);const first=transport.submit(p);f.timeout();await assert.rejects(first);const second=transport.submit(p);assert.equal(f.calls.length,2);assert.equal(f.calls[0].options.body,f.calls[1].options.body);f.resolve(response(ack(p)));await second;});
test('wrong endpoint, parent, embedded surface and malformed payload fail before fetch',async()=>{const f=fixture(),p=payload();await assert.rejects(createSheetsFetchTransport(endpoint+'?payload=x',f.host).submit(p));f.host.location.origin='https://evil.test';await assert.rejects(createSheetsFetchTransport(endpoint,f.host).submit(p));f.host.location.origin=PARENT_ORIGIN;f.host.top={};await assert.rejects(createSheetsFetchTransport(endpoint,f.host).submit(p));f.host.top=f.host;await assert.rejects(createSheetsFetchTransport(endpoint,f.host).submit({...p,answers:{}}));assert.equal(f.calls.length,0);});
