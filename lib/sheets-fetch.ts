import {PARENT_ORIGIN,validEndpoint,validSubmission,type Submission,type SaveAck} from './sheets.ts';

export const MAX_ACK_BYTES=2048;
function validResponseUrl(value:string,endpoint:string):boolean {
 try {
  const u=new URL(value),original=new URL(endpoint);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&
   (u.origin==='https://script.googleusercontent.com'||(u.origin===original.origin&&u.pathname===original.pathname));
 }catch{return false;}
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}

/** Credential-free transport verified against the deployed ContentService CORS route. */
export function createSheetsFetchTransport(endpoint:string,host:Window=window,timeoutMs=30000){
 const url=validEndpoint(endpoint);
 return {submit(payload:Submission):Promise<SaveAck>{
  if(!url)return Promise.reject(Error('Response collection is not connected yet.'));
  if(host.location.origin!==PARENT_ORIGIN||host.top!==host)return Promise.reject(Error('Please open the invitation directly on the staff-session website.'));
  if(!validSubmission(payload))return Promise.reject(Error('Please review your response and try again.'));
  // Serialize once. Every retry uses this same immutable request ID and envelope.
  const body=JSON.stringify(payload),requestId=payload.requestId;
  return new Promise((resolve,reject)=>{
   const controller=new AbortController();
   let finished=false,reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
   const unconfirmed='We couldn’t confirm that your response was saved. Keep this page open and retry safely with these same answers.';
   const timer=host.setTimeout(()=>finish(Error('Google’s response service did not confirm in time. Your save is unconfirmed. Retry safely with these same answers.')),timeoutMs);
   function finish(result:Error|SaveAck){
    if(finished)return;finished=true;host.clearTimeout(timer);
    if(result instanceof Error){
     controller.abort();
     try{const canceled=reader?.cancel();canceled?.catch(()=>{});}catch{}
     reject(result);
    }else resolve(result);
   }
   // The independent timer above settles even if fetch/read ignore AbortSignal.
   void (async()=>{
    try{
     const response=await host.fetch(url,{method:'POST',mode:'cors',credentials:'omit',redirect:'follow',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},body,signal:controller.signal,referrerPolicy:'no-referrer'});
     if(finished){try{await response.body?.cancel();}catch{}return;}
     if(response.type!=='cors'||!response.ok||!validResponseUrl(response.url,url)||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')||'')||!response.body)throw Error(unconfirmed);
     const announced=response.headers.get('content-length');
     if(announced&&(!/^\d+$/.test(announced)||Number(announced)>MAX_ACK_BYTES))throw Error(unconfirmed);
     reader=response.body.getReader();
     const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
     while(true){
      const chunk=await reader.read();
      if(finished)return;
      if(chunk.done)break;
      if(!(chunk.value instanceof Uint8Array))throw Error(unconfirmed);
      bytes+=chunk.value.byteLength;if(bytes>MAX_ACK_BYTES)throw Error(unconfirmed);
      text+=decoder.decode(chunk.value,{stream:true});
     }
     text+=decoder.decode();
     const ack:unknown=JSON.parse(text);
     if(!record(ack)||ack.requestId!==requestId||typeof ack.ok!=='boolean')throw Error(unconfirmed);
     const keys=Object.keys(ack).sort().join(',');
     if(ack.ok===true&&keys==='ok,requestId'){finish({ok:true,requestId});return;}
     if(ack.ok===false&&keys==='error,ok,requestId'&&typeof ack.error==='string'&&ack.error.length>0&&ack.error.length<=250){finish(Error(ack.error));return;}
     throw Error(unconfirmed);
    }catch{finish(Error(unconfirmed));}
   })();
  });
 }};
}
