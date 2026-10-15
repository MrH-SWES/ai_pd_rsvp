import type {Answer} from './survey';

export const PARENT_ORIGIN='https://mrh-swes.github.io';
export const BRIDGE_VERSION=1;
export const MAX_ENVELOPE_BYTES=20000;
export type Submission={requestId:string;responseName:string;answers:Answer};
export type SaveAck={ok:true;requestId:string};
export function validEndpoint(value:unknown):string {
 if(typeof value!=='string'||!value)return '';
 try {const u=new URL(value);return u.origin==='https://script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function validBridgeOrigin(origin:string):boolean {
 try {const u=new URL(origin);return u.origin===origin&&!u.port&&u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||/^[a-z0-9-]+-script\.googleusercontent\.com$/.test(u.hostname));}catch{return false;}
}
export function normalizeResponseName(value:string):string {
 const name=value.trim().replace(/\s+/gu,' ');
 if(!name||name.length>60||/[\u0000-\u001f\u007f]/u.test(value)||!/[\p{L}\p{N}]/u.test(name))throw Error('Please add your name for the response, using 60 characters or fewer.');
 return name;
}
export function randomHex(bytes=16):string {
 return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
export function createSubmission(responseName:string,answers:Answer):Submission {
 return {requestId:crypto.randomUUID(),responseName:normalizeResponseName(responseName),answers:JSON.parse(JSON.stringify(answers))};
}
export function isBridgeDescendant(source:Window|null,frame:Window|null):boolean {
 if(!source||!frame)return false;
 try {let node:Window=source;for(let i=0;i<8;i++){if(node===frame)return true;const parent=node.parent;if(parent===node)return false;node=parent;}}catch{/* Fail closed on unsupported WindowProxy access. */}
 return false;
}
export function createSheetsTransport(endpoint:string,host:Window=window,doc:Document=document,timeoutMs=60000){
 const url=validEndpoint(endpoint);
 return {submit(payload:Submission):Promise<SaveAck>{
  if(!url)return Promise.reject(Error('Response collection is not connected yet.'));
  if(host.location.origin!==PARENT_ORIGIN||host.top!==host)return Promise.reject(Error('Please open the invitation directly on the staff-session website.'));
  if(new TextEncoder().encode(JSON.stringify(payload)).length>MAX_ENVELOPE_BYTES)return Promise.reject(Error('Please shorten your response.'));
  return new Promise((resolve,reject)=>{
   const nonce=randomHex(),frame=doc.createElement('iframe');let bridge:Window|null=null,bridgeOrigin='',finished=false,sent=false;
   frame.hidden=true;frame.setAttribute('aria-hidden','true');frame.setAttribute('tabindex','-1');frame.title='Save your response';frame.referrerPolicy='no-referrer';
   const timeout=host.setTimeout(()=>finish(Error('We couldn’t confirm that your response was saved. Retry to check safely; your answers will stay the same.')),timeoutMs);
   function finish(value:Error|SaveAck){if(finished)return;finished=true;host.clearTimeout(timeout);host.removeEventListener('message',receive);frame.remove();value instanceof Error?reject(value):resolve(value);}
   function receive(event:MessageEvent){
    const data=event.data;
    if(!data||typeof data!=='object'||data.version!==BRIDGE_VERSION||data.channelNonce!==nonce)return;
    if(data.type==='pd-rsvp-ready'&&!sent){
     if(!validBridgeOrigin(event.origin)||!isBridgeDescendant(event.source as Window|null,frame.contentWindow))return;
     bridge=event.source as Window;bridgeOrigin=event.origin;sent=true;
     bridge.postMessage({type:'pd-rsvp-submit',version:BRIDGE_VERSION,channelNonce:nonce,payload},bridgeOrigin);return;
    }
    if(!sent||event.source!==bridge||event.origin!==bridgeOrigin||data.type!=='pd-rsvp-ack'||data.requestId!==payload.requestId)return;
    if(data.ok===true)finish({ok:true,requestId:payload.requestId});
    else if(data.ok===false)finish(Error(typeof data.error==='string'&&data.error.length<=250?data.error:'Your response wasn’t confirmed. Please retry.'));
   }
   host.addEventListener('message',receive);
   frame.addEventListener('error',()=>finish(Error('The response service didn’t open. Please retry.')),{once:true});
   const target=new URL(url);target.searchParams.set('channelNonce',nonce);frame.src=target.href;
   doc.body.appendChild(frame);
  });
 }};
}
