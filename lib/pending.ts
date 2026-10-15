import {validEndpoint,validSubmission,type Submission} from './sheets.ts';

// Only an already-submitted, unconfirmed envelope is kept, in this tab's session.
export const PENDING_KEY='pd-rsvp:pending:v1';
export const PENDING_TTL_MS=24*60*60*1000;
export type PendingRestore={payload:Submission|null;notice:string;storageAvailable:boolean;blocked:boolean};
type StorageHost={sessionStorage:Pick<Storage,'getItem'|'setItem'|'removeItem'>};
function storage(host:StorageHost){return host.sessionStorage;}
export function loadPending(endpoint:string,host:StorageHost=window,now=Date.now()):PendingRestore {
 let s:StorageHost['sessionStorage'],raw:string|null;
 try {s=storage(host);raw=s.getItem(PENDING_KEY);}catch{
  return {payload:null,notice:'Recovery could not be checked in this browser. If you already tried sending a response, keep the original tab open and contact the organizer before starting another. Keep this page open while saving.',storageAvailable:false,blocked:false};
 }
 if(!raw)return {payload:null,notice:'',storageAvailable:true,blocked:false};
 try {
  if(raw.length>22000)throw Error('Invalid stored envelope');
  const saved=JSON.parse(raw);
  if(!saved||typeof saved!=='object'||Array.isArray(saved)||
   Object.keys(saved).sort().join(',')!=='createdAt,endpoint,payload,version'||saved.version!==1||
   saved.endpoint!==validEndpoint(endpoint)||!saved.endpoint||!Number.isSafeInteger(saved.createdAt)||
   saved.createdAt>now||now-saved.createdAt>PENDING_TTL_MS||!validSubmission(saved.payload))throw Error('Invalid stored envelope');
  return {payload:saved.payload,notice:'Your pending response was restored in this tab. Its save is still unconfirmed. Retry with the same answers.',storageAvailable:true,blocked:false};
 } catch {
  return {payload:null,notice:'This tab has an unconfirmed response that cannot be safely restored. Its stored copy has been kept. Keep this tab open and contact the organizer before submitting another response.',storageAvailable:true,blocked:true};
 }
}
export function storePending(endpoint:string,payload:Submission,host:StorageHost=window,now=Date.now()):boolean {
 try {
  if(!validEndpoint(endpoint)||!validSubmission(payload))return false;
  const s=storage(host),old=s.getItem(PENDING_KEY);
  let createdAt=now;
  // Retries do not extend the retention period or alter the exact request.
  if(old){
   try{const previous=JSON.parse(old);if(previous.version!==1||Object.keys(previous).sort().join(',')!=='createdAt,endpoint,payload,version'||previous.endpoint!==endpoint||JSON.stringify(previous.payload)!==JSON.stringify(payload)||!Number.isSafeInteger(previous.createdAt)||previous.createdAt>now||now-previous.createdAt>PENDING_TTL_MS)return false;createdAt=previous.createdAt;}catch{return false;}
  }
  const serialized=JSON.stringify({version:1,endpoint,createdAt,payload});
  s.setItem(PENDING_KEY,serialized);
  return s.getItem(PENDING_KEY)===serialized;
 }catch{return false;}
}
export function clearPending(endpoint:string,payload:Submission,host:StorageHost=window):boolean {
 try {
  const s=storage(host),raw=s.getItem(PENDING_KEY);
  if(!raw)return true;
  const saved=JSON.parse(raw);
  if(!saved||typeof saved!=='object'||saved.version!==1||Object.keys(saved).sort().join(',')!=='createdAt,endpoint,payload,version'||saved.endpoint!==validEndpoint(endpoint)||!saved.endpoint||!Number.isSafeInteger(saved.createdAt)||!validSubmission(saved.payload)||JSON.stringify(saved.payload)!==JSON.stringify(payload))return false;
  s.removeItem(PENDING_KEY);
  return s.getItem(PENDING_KEY)===null;
 }catch{return false;}
}
