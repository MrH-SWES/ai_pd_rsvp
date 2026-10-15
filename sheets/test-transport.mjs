import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {validEndpoint,validBridgeOrigin,normalizeResponseName,createSubmission,createSheetsTransport,PARENT_ORIGIN} from '../lib/sheets.ts';
import {emptyAnswer} from '../lib/survey.ts';
const endpoint='https://script.google.com/macros/s/'+'A'.repeat(40)+'/exec';
const googleOrigin='https://n-example-script.googleusercontent.com';
const answer={...emptyAnswer,interest:'curious',experience:'Not yet',availability:['session-a']};
const payload=()=>createSubmission('Taylor Smith',answer);
function fixture(){
 const listeners=new Map(),timers=new Map();let next=0,frame,submission;
 const host={location:{origin:PARENT_ORIGIN},addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};host.top=host;host.parent=host;
 const outer={parent:host};const bridge={parent:outer,postMessage(data,origin){submission={data,origin};}};
 const doc={createElement(){frame={contentWindow:outer,setAttribute(){},addEventListener(){},remove(){frame.removed=true;}};return frame;},body:{appendChild(){}}};
 const send=(data,source=bridge,origin=googleOrigin)=>listeners.get('message')?.({data,source,origin});
 const nonce=()=>new URL(frame.src).searchParams.get('channelNonce');
 const ready=(extra={},source=bridge,origin=googleOrigin)=>send({type:'pd-rsvp-ready',version:1,channelNonce:nonce(),...extra},source,origin);
 const ack=(p,extra={},source=bridge,origin=googleOrigin)=>send({type:'pd-rsvp-ack',version:1,channelNonce:nonce(),requestId:p.requestId,ok:true,...extra},source,origin);
 return {host,doc,bridge,outer,timers,listeners,ready,ack,send,get frame(){return frame;},get submission(){return submission;}};
}
test('endpoint accepts only explicit production Apps Script exec URLs',()=>{assert.equal(validEndpoint(endpoint),endpoint);for(const value of ['',null,'http://script.google.com/macros/s/'+'A'.repeat(40)+'/exec',endpoint+'?x=1',endpoint+'#x',endpoint.replace('/exec','/dev'),endpoint.replace('script.google.com','script.google.com.evil.test'),'https://user:pass@script.google.com/macros/s/'+'A'.repeat(40)+'/exec'])assert.equal(validEndpoint(value),'');});
test('Google bridge origins are bounded and exact HTTPS origins',()=>{for(const s of ['https://script.google.com','https://script.googleusercontent.com',googleOrigin])assert(validBridgeOrigin(s));for(const s of ['null','https://googleusercontent.com','https://foo.googleusercontent.com','https://evil-script.googleusercontent.com.evil.test',googleOrigin+'/path',googleOrigin+':123','http://script.google.com'])assert(!validBridgeOrigin(s));});
test('self-reported name is bounded Unicode text, never a greeting fallback',()=>{assert.equal(normalizeResponseName('  Renée   李 '),'Renée 李');for(const s of ['', '   ','A'.repeat(61),'Name\nOther','<><>'])assert.throws(()=>normalizeResponseName(s));assert.equal(normalizeResponseName('=IMPORTXML(Alex)'),'=IMPORTXML(Alex)');});
test('submission snapshots answers and creates a random UUID',()=>{const a={...answer,tools:[]},p=createSubmission('Alex',a);a.tools.push('Claude');assert.deepEqual(p.answers.tools,[]);assert.match(p.requestId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);});
test('success waits for ready, uses exact nested source/origin, and removes iframe',async()=>{const f=fixture(),p=payload(),saving=createSheetsTransport(endpoint,f.host,f.doc).submit(p);assert(!f.submission);f.ready();assert.deepEqual(f.submission,{data:{type:'pd-rsvp-submit',version:1,channelNonce:new URL(f.frame.src).searchParams.get('channelNonce'),payload:p},origin:googleOrigin});f.ack(p);assert.deepEqual(await saving,{ok:true,requestId:p.requestId});assert(f.frame.removed);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);});
test('spoofed origin, unrelated source and nonce cannot trigger submission',async()=>{const f=fixture(),p=payload(),saving=createSheetsTransport(endpoint,f.host,f.doc).submit(p);f.ready({},f.bridge,'https://evil.test');const unrelated={parent:null};unrelated.parent=unrelated;f.ready({},unrelated);f.ready({channelNonce:'0'.repeat(32)});assert(!f.submission);f.ready();f.ack(p);await saving;});
test('acknowledgement mismatch cannot mark saved; source/origin remain pinned',async()=>{const f=fixture(),p=payload();let settled=false;const saving=createSheetsTransport(endpoint,f.host,f.doc).submit(p).then(x=>{settled=true;return x;});f.ready();f.ack(p,{requestId:crypto.randomUUID()});f.ack(p,{},f.outer);f.ack(p,{},f.bridge,'https://script.google.com');f.ack(p,{channelNonce:'0'.repeat(32)});f.ack(p,{ok:'true'});await Promise.resolve();assert(!settled);f.ack(p);await saving;});
test('explicit save errors reject without claiming success',async()=>{const f=fixture(),p=payload(),saving=createSheetsTransport(endpoint,f.host,f.doc).submit(p);f.ready();f.ack(p,{ok:false,error:'Please try again.'});await assert.rejects(saving,/Please try again/);assert(f.frame.removed);});
test('timeout can safely retry exact same ID and payload in a fresh bridge',async()=>{const f=fixture(),p=payload(),transport=createSheetsTransport(endpoint,f.host,f.doc);const first=transport.submit(p);f.ready();const original=f.submission.data.payload;[...f.timers.values()][0]();await assert.rejects(first,/couldn’t confirm/);const second=transport.submit(p);f.ready();assert.deepEqual(f.submission.data.payload,original);f.ack(p);await second;});
test('wrong parent, embedded parent, blank endpoint and oversize fail before creating frame',async()=>{const f=fixture();await assert.rejects(createSheetsTransport('',f.host,f.doc).submit(payload()),/not connected/);f.host.location.origin='https://evil.test';await assert.rejects(createSheetsTransport(endpoint,f.host,f.doc).submit(payload()),/directly/);f.host.location.origin=PARENT_ORIGIN;f.host.top={};await assert.rejects(createSheetsTransport(endpoint,f.host,f.doc).submit(payload()),/directly/);f.host.top=f.host;await assert.rejects(createSheetsTransport(endpoint,f.host,f.doc).submit({...payload(),responseName:'A'.repeat(20001)}),/shorten/);assert(!f.frame);});
function bridgeFixture(){
 const code=fs.readFileSync(new URL('./Bridge.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= parentOriginJson ?>',JSON.stringify(PARENT_ORIGIN)).replace('<?!= channelNonceJson ?>',JSON.stringify('a'.repeat(32)));
 const messages=[],listeners=new Map();let submitted,success,failure;
 const parent={postMessage(data,origin){messages.push({data,origin});}};
 const window={top:parent,addEventListener(t,fn){listeners.set(t,fn);},removeEventListener(t,fn){if(listeners.get(t)===fn)listeners.delete(t);}};
 const runner={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;},submitResponse(data){submitted=data;}};
 vm.runInNewContext(code,{window,TextEncoder,setInterval(){return 1;},clearInterval(){},setTimeout(){return 2;},clearTimeout(){},google:{script:{run:runner}}});
 const receive=(data,source=parent,origin=PARENT_ORIGIN)=>listeners.get('message')?.({data,source,origin});
 const send=(p,extra={},source=parent,origin=PARENT_ORIGIN)=>receive({type:'pd-rsvp-submit',version:1,channelNonce:'a'.repeat(32),payload:p,...extra},source,origin);
 return {messages,send,get submitted(){return submitted;},success:r=>success(r),failure:()=>failure(Error('private internals')),parent};
}
test('bridge only forwards submissions from expected top window, exact origin and nonce',()=>{const f=bridgeFixture(),p=payload();assert.equal(f.messages[0].data.type,'pd-rsvp-ready');assert.equal(f.messages[0].origin,PARENT_ORIGIN);f.send(p,{}, {},PARENT_ORIGIN);f.send(p,{},f.parent,'https://evil.test');f.send(p,{channelNonce:'b'.repeat(32)});assert(!f.submitted);f.send(p);assert.deepEqual(f.submitted,p);f.success({ok:true,requestId:p.requestId});assert.equal(f.messages.at(-1).data.ok,true);});
test('bridge suppresses duplicate in-flight sends and rejects mismatched server ack',()=>{const f=bridgeFixture(),p=payload();f.send(p);f.send({...p,responseName:'Changed'});assert.equal(f.submitted.responseName,p.responseName);f.success({ok:true,requestId:crypto.randomUUID()});assert.equal(f.messages.at(-1).data.ok,false);assert.equal(f.messages.at(-1).data.requestId,p.requestId);});
test('bridge hides server exceptions and rejects oversized envelopes',()=>{const f=bridgeFixture(),p=payload();f.send(p);f.failure();assert.equal(f.messages.at(-1).data.ok,false);assert.doesNotMatch(f.messages.at(-1).data.error,/private internals/);const g=bridgeFixture();g.send({...p,responseName:'a'.repeat(20001)});assert(!g.submitted);assert.equal(g.messages.at(-1).data.ok,false);});
