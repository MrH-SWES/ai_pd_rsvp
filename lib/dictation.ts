/** Browser speech may use a remote provider. No site audio recording or upload. */
export function appendDictation(current:string,spoken:string,limit:number){
 const addition=spoken.trim().replace(/\s+/g,' ');
 if(!addition)return current.slice(0,limit);
 const joined=current+(current&&!/\s$/.test(current)?' ':'')+addition;
 return joined.slice(0,limit).replace(/[\uD800-\uDBFF]$/,'');
}
export function recognitionConstructor(){
 if(typeof window==='undefined'||window.isSecureContext===false)return null;
 return (window as any).SpeechRecognition||(window as any).webkitSpeechRecognition||null;
}
export function speechErrorMessage(code:string){
 if(code==='not-allowed'||code==='service-not-allowed')return 'Microphone access wasn’t allowed. You can type or use your keyboard’s microphone instead.';
 if(code==='audio-capture')return 'No microphone is available. You can type or use your keyboard’s dictation.';
 if(code==='network')return 'The speech service couldn’t connect. Try again, type, or use your keyboard’s microphone.';
 if(code==='no-speech')return 'No speech was detected. Try again when you’re ready, or type your answer.';
 if(code==='language-not-supported')return 'This speech service doesn’t support the selected language. Try your keyboard’s dictation or type.';
 if(code==='aborted')return 'Dictation stopped. You can keep typing or start again.';
 return 'Dictation isn’t available right now. You can type or use your keyboard’s microphone.';
}
export type DictationMode='idle'|'starting'|'listening'|'stopping';
type Callbacks={onMode:(mode:DictationMode)=>void;onText:(text:string)=>void;onMessage:(message:string)=>void};
/** Only start() requests speech. Cancellation detaches events before aborting. */
export function createDictationSession(Recognition:any,callbacks:Callbacks){
 const recognition=new Recognition();
 recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=false;
 let active=false,closed=false,started=false,stopping=false,timer:ReturnType<typeof setTimeout>|undefined;
 const seen=new Set<number>();
 const clear=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
 function detach(){recognition.onstart=null;recognition.onresult=null;recognition.onerror=null;recognition.onend=null;}
 function finish(message:string,abort=false){
  if(closed)return;closed=true;active=false;clear();detach();
  if(abort)try{recognition.abort();}catch{/* Already stopped. */}
  callbacks.onMode('idle');callbacks.onMessage(message);
 }
 recognition.onstart=()=>{if(!active||stopping)return;started=true;clear();callbacks.onMode('listening');callbacks.onMessage('Listening. Speak naturally, then choose Stop dictation.');};
 recognition.onresult=(event:any)=>{
  if(!active)return;const pieces:string[]=[];
  for(let i=event.resultIndex||0;i<event.results.length;i++){
   const result=event.results[i];if(result.isFinal&&!seen.has(i)){seen.add(i);if(typeof result[0]?.transcript==='string')pieces.push(result[0].transcript);}
  }
  if(pieces.length)callbacks.onText(pieces.join(' '));
 };
 recognition.onerror=(event:any)=>finish(speechErrorMessage(event.error),true);
 recognition.onend=()=>finish('Dictation stopped. Review and edit your text before continuing.');
 return {
  start(){
   if(active||closed)return;active=true;callbacks.onMode('starting');callbacks.onMessage('Waiting for the microphone. Your browser may ask for permission.');
   timer=setTimeout(()=>finish('Dictation didn’t start. Try your keyboard’s microphone or type instead.',true),10000);
   try{recognition.start();}catch{finish(speechErrorMessage('unavailable'),true);}
  },
  stop(){
   if(!active||closed||stopping)return;if(!started){finish('Dictation stopped. You can start again when you’re ready.',true);return;}stopping=true;clear();callbacks.onMode('stopping');callbacks.onMessage('Finishing dictation…');
   timer=setTimeout(()=>finish('Dictation stopped. Review and edit your text before continuing.',true),2000);
   try{recognition.stop();}catch{finish(speechErrorMessage('aborted'),true);}
  },
  cancel(){if(closed)return;closed=true;active=false;clear();detach();try{recognition.abort();}catch{/* Already stopped. */}}
 };
}
