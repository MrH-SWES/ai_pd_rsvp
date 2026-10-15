import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {emptyAnswer} from '../lib/survey.ts';
import {PENDING_KEY,PENDING_TTL_MS} from '../lib/pending.ts';
await build({entryPoints:['src/Survey.tsx'],outdir:'.sheets-ui-test',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},jsx:'automatic',plugins:[{name:'controlled-hooks',setup(b){b.onResolve({filter:/^react$/},a=>/\/src\/(Survey|Reveal|Board|Dictation)\.tsx$/.test(a.importer)?{path:'hooks',namespace:'test'}:null);b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const useState=(x)=>globalThis.uiHooks.useState(x),useEffect=(x,d)=>globalThis.uiHooks.useEffect(x,d),useLayoutEffect=(x,d)=>globalThis.uiHooks.useEffect(x,d),useRef=(x)=>globalThis.uiHooks.useRef(x);',loader:'js'}));}}]});
const endpoint='https://script.google.com/macros/s/'+'A'.repeat(40)+'/exec';
const storageValues=new Map();
const storage={getItem:key=>storageValues.get(key)??null,setItem:(key,value)=>storageValues.set(key,value),removeItem:key=>storageValues.delete(key)};
const listeners=new Map(),timers=new Map();let frame,submission,respond,next=0;const requests=[];
globalThis.window={sessionStorage:storage,PD_CONFIG:{apiBase:'',sheetsEndpoint:endpoint},location:{origin:'https://mrh-swes.github.io'},scrollTo(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),addEventListener(t,fn){listeners.set(t,fn);},removeEventListener(t,fn){if(listeners.get(t)===fn)listeners.delete(t);},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
window.top=window;window.parent=window;
window.fetch=(url,options)=>{requests.push({url,options});submission={data:{payload:JSON.parse(options.body)}};return new Promise(resolve=>{respond=resolve;});};
const outer={parent:window},bridge={parent:outer,postMessage(data,origin){submission={data,origin};}};
globalThis.document={hidden:false,addEventListener(){},removeEventListener(){},createElement(){frame={contentWindow:outer,setAttribute(){},addEventListener(){},remove(){}};return frame;},body:{appendChild(){}}};
globalThis.location={hash:'#name=GreetingOnly&recipient='+'a'.repeat(32)};
const {default:Home}=await import('../.sheets-ui-test/Survey.mjs');
let states=[],refs=[],effects=[],i=0,j=0;
globalThis.uiHooks={useState(initial){const k=i++;if(!(k in states))states[k]=typeof initial==='function'?initial():initial;return [states[k],v=>{states[k]=typeof v==='function'?v(states[k]):v}];},useRef(initial){const k=j++;return refs[k]??(refs[k]={current:initial});},useEffect(fn,deps){effects.push({fn,deps});}};
function render(overrides={}){Object.assign(states,overrides);i=0;j=0;effects=[];return Home();}
function scene(s,overrides={}){return render({0:s,5:false,...overrides}).props.renderScene(s);}
function reset({keepStorage=false}={}){if(!keepStorage)storageValues.clear();window.sessionStorage=storage;states=[];refs=[];effects=[];listeners.clear();timers.clear();submission=null;respond=null;requests.length=0;frame=null;location.hash='#name=GreetingOnly&recipient='+'a'.repeat(32);}
function nodes(n){return n==null||typeof n==='boolean'?[]:Array.isArray(n)?n.flatMap(nodes):typeof n==='object'?[n,...nodes(n.props?.children)]:[n];}
const text=n=>nodes(n).filter(x=>typeof x==='string').join(' ').replace(/\s+/g,' ');
const button=(n,label)=>{const result=nodes(n).find(x=>x?.type==='button'&&text(x).trim()===label);assert(result,`button ${label}`);return result;};
const good={...emptyAnswer,interest:'curious',experience:'Not yet',availability:['session-a']};
function ack(ok=true,requestId=submission.data.payload.requestId){
 const bytes=new TextEncoder().encode(JSON.stringify({ok,requestId,...(!ok?{error:'Please retry.'}:{})}));
 respond({type:'cors',ok:true,url:'https://script.googleusercontent.com/macros/echo?user_content_key=public',headers:new Headers({'content-type':'application/json; charset=utf-8'}),body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})});
}
test('configured Sheets enables collection without invite while preserving greeting-only name',()=>{reset();render();for(const e of effects)e.fn();assert.equal(states[4],false);assert.equal(states[5],false);assert.equal(states[2],'GreetingOnly');assert.equal(states[11],'');assert.equal(submission,null);});
test('response name and dictation appear only in review, never restore removed scene',()=>{reset();const board=render({0:9,5:false,4:false});for(const step of [-1,-.75,-.5,0,.1,.2,1,2,3,4,5,6,7,8,9,10,-.25]){const tree=board.props.renderScene(step);const name=nodes(tree).find(n=>n?.props?.id==='response-name');assert.equal(!!name,step===9);assert.doesNotMatch(text(tree),/What should we call you|Change my greeting|Keep my greeting/);}const tree=board.props.renderScene(9);const dictation=nodes(tree).find(n=>n?.props?.targetId==='response-name');assert(dictation);assert.equal(dictation.props.maxLength,60);assert.equal(dictation.props.disabled,false);dictation.props.onText(value=>value+'Taylor');assert.equal(states[11],'Taylor');assert.equal(states[2],'GreetingOnly');const offscreen=render({0:6,5:false,4:false}).props.renderScene(9);assert(nodes(offscreen).find(n=>n?.props?.targetId==='response-name').props.disabled);});
test('blank self-reported name blocks submission without contacting Google',async()=>{reset();const tree=scene(9,{4:false,1:good});await button(tree,'Send my response').props.onClick();assert.match(states[6],/add your name/);assert.equal(frame,null);assert.equal(states[9],false);});
test('success carries self-reported name, excludes greeting, freezes saved response',async()=>{reset();const tree=scene(9,{4:false,1:good,11:'Taylor Smith'}),saving=button(tree,'Send my response').props.onClick();assert.equal(states[8],true);assert.equal(states[9],false);assert.equal(submission.data.payload.responseName,'Taylor Smith');assert(!JSON.stringify(submission.data.payload).includes('GreetingOnly'));ack();await saving;assert.equal(states[9],true);assert.equal(states[12],true);const review=scene(9);assert(button(review,'Response saved').props.disabled);assert(nodes(review).find(n=>n?.props?.id==='response-name').props.disabled);assert.equal(states[2],'GreetingOnly');});
test('uncertain save keeps name and answers fixed, retry reuses exact envelope',async()=>{reset();let tree=scene(9,{4:false,1:good,11:'Taylor'});const first=button(tree,'Send my response').props.onClick();const original=JSON.stringify(submission.data.payload);[...timers.values()][0]();await first;assert.equal(states[9],false);assert.match(states[6],/did not confirm in time/);tree=scene(9);assert(nodes(tree).find(n=>n?.props?.id==='response-name').props.disabled);assert(button(tree,'Back').props.disabled);assert(nodes(tree).filter(n=>n?.props?.['aria-label']?.startsWith('Edit ')).every(n=>n.props.disabled));const retry=button(tree,'Retry saving').props.onClick();assert.equal(JSON.stringify(submission.data.payload),original);ack();await retry;assert.equal(states[9],true);});
test('server error does not become completion and preserves retry request',async()=>{reset();const tree=scene(9,{4:false,1:good,11:'Taylor'}),saving=button(tree,'Send my response').props.onClick();ack(false);await saving;assert.equal(states[9],false);assert.equal(states[12],false);assert.match(states[6],/Please retry/);assert(button(scene(9),'Retry saving'));});

test('a stale double-click handler starts only one save operation',async()=>{reset();const tree=scene(9,{4:false,1:good,11:'Taylor'});const handler=button(tree,'Send my response').props.onClick;const first=handler();await handler();assert.equal(requests.length,1);assert.equal(frame,null);ack();await first;assert.equal(states[9],true);});


test('review discloses same-tab storage before sending and does not save a draft automatically',()=>{
 reset();const tree=scene(9,{4:false,1:good,11:'Taylor'});
 assert.match(text(tree),/temporarily stores your submitted name and answers/);assert.match(text(tree),/same tab for 24 hours/);assert.match(text(tree),/does not transfer your answers to another tab or browser/);assert.equal(storageValues.size,0);
});
test('pending envelope persists before transport begins and clears only on matching confirmation',async()=>{
 reset();const tree=scene(9,{4:false,1:good,11:'Taylor'}),saving=button(tree,'Send my response').props.onClick();
 const pending=JSON.parse(storageValues.get(PENDING_KEY));assert.equal(pending.payload.responseName,'Taylor');assert.equal(pending.endpoint,endpoint);assert.equal(states[9],false);
 assert.deepEqual(pending.payload,submission.data.payload);assert(storageValues.has(PENDING_KEY));assert.equal(states[9],false);ack();await saving;assert(!storageValues.has(PENDING_KEY));assert.equal(states[9],true);assert.equal(states[14],'');
});
test('same-tab reload restores review with exact frozen envelope and never auto-submits',async()=>{
 reset();const tree=scene(9,{4:false,1:{...good,example:'Dictated text.',question:'Keep this question.'},11:'Taylor'}),first=button(tree,'Send my response').props.onClick();
 const original=JSON.stringify(submission.data.payload);[...timers.values()][0]();await first;
 reset({keepStorage:true});render();for(const e of effects)e.fn();assert.equal(states[0],9);assert.equal(states[11],'Taylor');assert.equal(states[1].example,'Dictated text.');assert.equal(states[1].question,'Keep this question.');assert.equal(states[9],false);assert.equal(frame,null);assert.equal(submission,null);assert.match(states[14],/still unconfirmed/);
 const review=scene(9);assert(nodes(review).find(n=>n?.props?.id==='response-name').props.disabled);assert(button(review,'Back').props.disabled);assert(nodes(review).filter(n=>n?.props?.['aria-label']?.startsWith('Edit ')).every(n=>n.props.disabled));
 const retry=button(review,'Retry saving').props.onClick();assert.equal(JSON.stringify(submission.data.payload),original);ack();await retry;assert.equal(states[9],true);assert.equal(storageValues.size,0);
});
test('connection timeout remains unconfirmed with a recoverable same-ID retry',async()=>{
 reset();const first=button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();const raw=storageValues.get(PENDING_KEY);[...timers.values()][0]();await first;assert.match(states[6],/did not confirm in time/);assert.equal(states[9],false);assert.equal(storageValues.get(PENDING_KEY),raw);assert(button(scene(9),'Retry saving'));
});
test('blocked session storage warns truthfully and preserves the current in-memory retry',async()=>{
 reset();window.sessionStorage={...storage,setItem(){throw Error('quota');}};
 const first=button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();const original=JSON.stringify(submission.data.payload);[...timers.values()][0]();await first;
 assert.match(states[14],/could not keep a recovery copy/);assert.match(text(scene(9)),/Reloading or closing it may lose/);assert.equal(storageValues.size,0);const retry=button(scene(9),'Retry saving').props.onClick();assert.equal(JSON.stringify(submission.data.payload),original);ack();await retry;assert.equal(states[9],true);
});
test('clear failure preserves confirmed success and shows a specific warning in completion and review',async()=>{
 reset();window.sessionStorage={...storage,removeItem(){throw Error('denied');}};
 const saving=button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();ack();await saving;
 assert.equal(states[9],true);assert.equal(states[12],true);assert(storageValues.has(PENDING_KEY));assert.match(text(render().props.renderScene(10)),/response is saved, but this browser could not clear/);assert.match(text(scene(9)),/temporary pending copy/);
});
test('malformed, expired, future-clock and endpoint-mismatched pending records block new submission immediately',()=>{
 const p={requestId:'00000000-0000-4000-8000-000000000001',responseName:'Taylor',answers:good};
 const valid={version:1,endpoint,createdAt:Date.now(),payload:p};
 for(const raw of ['{bad',JSON.stringify({...valid,createdAt:Date.now()-PENDING_TTL_MS-1000}),JSON.stringify({...valid,createdAt:Date.now()+60000}),JSON.stringify({...valid,endpoint:endpoint.replace('AAAA','BBBB')})]){
  reset();storageValues.set(PENDING_KEY,raw);render();for(const e of effects)e.fn();const blocked=render();assert.equal(states[9],false);assert.equal(states[11],'');assert.equal(states[0],-1);assert.equal(frame,null);assert.equal(submission,null);assert.match(text(blocked),/pending response to check/);assert.match(text(blocked),/contact the organizer/);assert.equal(nodes(blocked).some(n=>n?.type==='button'),false);assert.equal(storageValues.get(PENDING_KEY),raw);assert.equal(states[13].blocked,true);
 }
});
test('legacy invite paths do not restore a pending public Sheets response',()=>{
 reset();storageValues.set(PENDING_KEY,'{bad');location.hash='#invite=legacy';render();assert.equal(states[13].payload,null);assert.equal(states[14],'');assert(storageValues.has(PENDING_KEY));
});

test('UI uses credential-free POST with no hidden iframe or popup dependency',async()=>{
 reset();const saving=button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();assert.equal(frame,null);assert.equal(requests.length,1);assert.equal(requests[0].url,endpoint);assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.mode,'cors');assert.equal(requests[0].options.method,'POST');ack();await saving;assert.equal(states[9],true);
});
test('mismatched HTTP acknowledgement stays unconfirmed and preserves the exact pending retry',async()=>{
 reset();const saving=button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();const original=requests[0].options.body,raw=storageValues.get(PENDING_KEY);ack(true,crypto.randomUUID());await saving;assert.equal(states[9],false);assert.equal(states[12],false);assert.equal(storageValues.get(PENDING_KEY),raw);assert.match(states[6],/couldn’t confirm/);const retry=button(scene(9),'Retry saving').props.onClick();assert.equal(requests[1].options.body,original);ack();await retry;assert.equal(states[9],true);
});

test('invitation identity uses only opaque recipient ID with no editable email field',async()=>{
 reset();const review=scene(9,{4:false,1:good,11:'Taylor'});assert.equal(nodes(review).some(n=>n?.props?.id==='response-email'),false);assert.match(text(review),/recipient email associated with your individual invitation link/);
 const saving=button(review,'Send my response').props.onClick();assert.equal(submission.data.payload.recipientId,'a'.repeat(32));assert.equal(submission.data.payload.responseEmail,undefined);ack();await saving;
});
test('new missing, malformed or duplicate recipient links cannot send',async()=>{
 for(const fragment of ['#name=GreetingOnly','#recipient=bad','#recipient='+'a'.repeat(32)+'&recipient='+'b'.repeat(32)]){
  reset();location.hash=fragment;await button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();assert.equal(requests.length,0);assert.match(states[6],/individual invitation/);
 }
});
test('legacy pending response may retry without a recipient ID',async()=>{
 reset();location.hash='#name=GreetingOnly';const payload={requestId:crypto.randomUUID(),responseName:'Legacy',answers:good};storageValues.set(PENDING_KEY,JSON.stringify({version:1,endpoint,createdAt:Date.now(),payload}));render();for(const e of effects)e.fn();const saving=button(scene(9),'Retry saving').props.onClick();assert.deepEqual(submission.data.payload,payload);ack();await saving;assert.equal(states[9],true);
});

test('pending recipient A cannot silently restore under B or a generic link; original link recovers',async()=>{
 reset();const first=button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();const original=storageValues.get(PENDING_KEY);[...timers.values()][0]();await first;
 for(const hash of ['#recipient='+'b'.repeat(32),'#name=Generic','#recipient=malformed']){
  reset({keepStorage:true});location.hash=hash;render();for(const e of effects)e.fn();const blocked=render();assert.match(text(blocked),/different invitation/);assert.equal(states[13].blocked,true);assert.equal(states[13].payload,null);assert.equal(requests.length,0);assert.equal(storageValues.get(PENDING_KEY),original);assert.equal(nodes(blocked).some(n=>n?.type==='button'),false);
 }
 reset({keepStorage:true});render();for(const e of effects)e.fn();assert.equal(states[13].blocked,false);assert.equal(states[13].payload.recipientId,'a'.repeat(32));const retry=button(scene(9),'Retry saving').props.onClick();assert.deepEqual(submission.data.payload,JSON.parse(original).payload);ack();await retry;assert.equal(states[9],true);
});
test('legacy pending envelope cannot silently restore under a new individualized link',()=>{
 reset();const payload={requestId:crypto.randomUUID(),responseName:'Legacy',answers:good};const raw=JSON.stringify({version:1,endpoint,createdAt:Date.now(),payload});storageValues.set(PENDING_KEY,raw);render();for(const e of effects)e.fn();assert.equal(states[13].blocked,true);assert.equal(states[13].payload,null);assert.match(text(render()),/different invitation/);assert.equal(storageValues.get(PENDING_KEY),raw);assert.equal(requests.length,0);
});

test('same-document hash navigation cannot retry pending A under B or generic link',async()=>{
 reset();const first=button(scene(9,{4:false,1:good,11:'Taylor'}),'Send my response').props.onClick();const raw=storageValues.get(PENDING_KEY),payload=JSON.parse(raw).payload;[...timers.values()][0]();await first;assert.equal(requests.length,1);
 for(const hash of ['#recipient='+'b'.repeat(32),'#name=Generic','#recipient=bad']){
  location.hash=hash;await button(scene(9),'Retry saving').props.onClick();assert.equal(requests.length,1);assert.match(states[6],/different invitation/);assert.equal(storageValues.get(PENDING_KEY),raw);assert.equal(states[9],false);
 }
 location.hash='#recipient='+'a'.repeat(32);const retry=button(scene(9),'Retry saving').props.onClick();assert.equal(requests.length,2);assert.deepEqual(submission.data.payload,payload);ack();await retry;assert.equal(states[9],true);
});
