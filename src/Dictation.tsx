import {useEffect,useRef,useState} from 'react';
import {Mic,Square} from 'lucide-react';
import {appendDictation,createDictationSession,recognitionConstructor,type DictationMode} from '../lib/dictation';
type Props={targetId:string;label:string;value:string;maxLength:number;onText:(update:(current:string)=>string)=>void;disabled?:boolean;compact?:boolean};
export default function Dictation({targetId,label,value,maxLength,onText,disabled=false,compact=false}:Props){
 const [supported]=useState(()=>!!recognitionConstructor());
 const [open,setOpen]=useState(false),[mode,setMode]=useState<DictationMode>('idle'),[message,setMessage]=useState('');
 const toggle=useRef<HTMLButtonElement>(null);
 const session=useRef<ReturnType<typeof createDictationSession>|null>(null);
 const currentValue=useRef(value),updateText=useRef(onText);
 currentValue.current=value;updateText.current=onText;
 const panelId=targetId+'-dictation-info',statusId=targetId+'-dictation-status';
 const active=mode!=='idle';
 useEffect(()=>()=>{session.current?.cancel();session.current=null;},[]);
 useEffect(()=>{if(disabled){session.current?.cancel();session.current=null;setMode('idle');setOpen(false);setMessage('');}},[disabled]);
 function focusField(){document.getElementById(targetId)?.focus();}
 function start(){
  if(disabled||session.current)return;
  const Recognition=recognitionConstructor();if(!Recognition){setMessage('Direct dictation isn’t supported here. Use your keyboard’s microphone or type.');return;}
  setOpen(false);
  try{
   const next=createDictationSession(Recognition,{
    onMode:nextMode=>{setMode(nextMode);if(nextMode==='idle')session.current=null;},
    onMessage:setMessage,
    onText:spoken=>{
     const nextValue=appendDictation(currentValue.current,spoken,maxLength);currentValue.current=nextValue;
     updateText.current(current=>appendDictation(current,spoken,maxLength));
     setMessage(nextValue.length>=maxLength?`The ${maxLength}-character limit is reached. Review or shorten your text.`:'Text added. You can edit it before continuing.');
    }
   });session.current=next;next.start();toggle.current?.focus();
  }catch{setMode('idle');setMessage('Dictation isn’t available right now. Use your keyboard’s microphone or type.');}
 }
 return <div className={'dictation '+(compact?'dictation-compact':'')} data-dictation-for={targetId}>
  <button ref={toggle} type="button" className={'dictation-toggle '+(active?'is-listening':'')} disabled={disabled||mode==='stopping'} aria-label={active?'Stop dictation':supported?`Speak ${label}`:`Dictation options for ${label}`} aria-expanded={active?undefined:open} aria-controls={open?panelId:undefined} aria-describedby={statusId} onClick={()=>active?session.current?.stop():setOpen(v=>!v)}>{active?<Square size={17}/>:<Mic size={17}/>}<span>{active?(mode==='stopping'?'Finishing…':'Stop dictation'):supported?`Speak ${label}`:'Dictation options'}</span></button>
  {open&&<div id={panelId} className="dictation-info">
   {supported?<><p>Dictation uses your browser’s speech service, which may send audio to its provider. Avoid confidential details. You can review and edit the text before continuing.</p><button type="button" className="secondary" disabled={disabled} onClick={start}>Start dictation</button></>:<><p>Direct dictation isn’t supported here. Select the text box, then use your phone or computer keyboard’s microphone or dictation shortcut, if available. You can always type.</p><button type="button" className="secondary" disabled={disabled} onClick={focusField}>Go to text box</button></>}
  </div>}
  <p id={statusId} role="status" aria-live="polite" className="dictation-status">{message}</p>
 </div>;
}
