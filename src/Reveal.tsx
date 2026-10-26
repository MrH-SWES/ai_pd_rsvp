import {useEffect, useLayoutEffect, useRef, useState, type RefObject} from 'react';
import {TravelArrow} from './Board';

export function cleanName(value:string){return value.trim().replace(/\s+/g,' ').slice(0,60)||'there';}
// Display-only, optional first name; this is never identity or authorization.
export function nameFromFragment(hash:string){
 const params=new URLSearchParams(hash.replace(/^#/, ''));
 if(params.getAll('name').length!==1)return '';
 const value=params.get('name');
 if(!value)return '';
 const name=value.normalize('NFC').trim();
 return name.length<=60&&/^[\p{L}\p{M}]+(?:[ ’'−-][\p{L}\p{M}]+)*$/u.test(name)?name:'';
}
export function prefersReducedMotion(){return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
export function useReducedMotion(){
 const [reduced,setReduced]=useState(prefersReducedMotion);
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;const change=()=>setReduced(media.matches);media.addEventListener?.('change',change);return()=>media.removeEventListener?.('change',change);},[]);
 return reduced;
}
type Point=[number,number];
const center:Point=[51,40];
const edge:Point[]=[[0,0],[42,0],[78,0],[100,0],[100,54],[100,100],[59,100],[18,100],[0,100],[0,47]];
const ring:Point[]=edge.map(([x,y],i)=>[center[0]+(x-center[0])*(i%2?.36:.43),center[1]+(y-center[1])*(i%2?.36:.43)]);
export const shardPolygons:Point[][]=edge.flatMap((p,i)=>{const next=(i+1)%edge.length;return [[center,ring[i],ring[next]],[ring[i],p,edge[next],ring[next]]];});
const crackPaths=[...edge.map((p,i)=>`M${center.join(',')} L${ring[i].join(',')} L${p.join(',')}`),`M${ring.map(p=>p.join(',')).join(' L')} Z`];
function makeCracks(){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('class','crack-map');svg.setAttribute('aria-hidden','true');
 crackPaths.forEach((d,i)=>{const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);path.setAttribute('pathLength','1');path.setAttribute('style',`animation-delay:${i*12}ms`);svg.appendChild(path);});return svg;
}
export const SHATTER_FALLBACK_MS=2400;
// Give the paused fragments a paint opportunity before starting. Finish from
// their actual animation events, not a deadline that can expire before paint.
// Hidden tabs pause the CSS and safety clock together; resizing never skips.
export function playShatter(host:HTMLElement,onComplete:()=>void){
 let disposed=false,started=false,frame=0,cancelFallback=()=>{};
 const pending=new Set<EventTarget>(Array.from(host.querySelectorAll('.form-shard')));
 function dispose(){
  if(disposed)return;disposed=true;
  cancelAnimationFrame(frame);cancelFallback();
  host.classList.remove('shatter-playing');
  host.removeEventListener('animationend',ended);
  document.removeEventListener('visibilitychange',visibility);
 }
 function complete(){if(disposed)return;dispose();onComplete();}
 function ended(event:AnimationEvent){
  if(event.animationName!=='shard-fall'||!event.target||!pending.delete(event.target))return;
  if(!pending.size&&!document.hidden)complete();
 }
 function visibility(){
  if(started&&!document.hidden&&!pending.size){complete();return;}
  host.classList.toggle('shatter-playing',started&&!document.hidden);
  if(started||document.hidden||frame||disposed)return;
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
   frame=0;if(disposed||document.hidden)return;
   started=true;host.classList.add('shatter-playing');
   // A bounded escape hatch if animation events are unavailable or CSS fails.
   cancelFallback=visibleTimeout(complete,SHATTER_FALLBACK_MS);
  });});
 }
 host.addEventListener('animationend',ended);
 document.addEventListener('visibilitychange',visibility);visibility();
 return dispose;
}
// Twenty bounded fragments, each containing an inert copy of the actual form.
// No bitmap capture, external assets, focusable duplicates, or persistent overlay.
export function Shatter({surface,onComplete}:{surface:RefObject<HTMLDivElement|null>,onComplete:()=>void}){
 const layer=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const source=surface.current,host=layer.current;if(!source||!host){onComplete();return;}
  const {width,height}=source.getBoundingClientRect();
  host.style.width=`${width}px`;host.style.height=`${height}px`;host.style.right="auto";host.style.bottom="auto";
  const padding=getComputedStyle(source).padding;
  shardPolygons.forEach((polygon,i)=>{
   const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
   const left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
   const piece=document.createElement('div');piece.className='form-shard';
   piece.style.cssText=`left:${left}%;top:${top}%;width:${w}%;height:${h}%;clip-path:polygon(${polygon.map(([x,y])=>`${(x-left)/w*100}% ${(y-top)/h*100}%`).join(',')});--drift:${(left+w/2-50)*2.2}px;--turn:${((i*17)%29)-14}deg;--delay:${270+(i*31)%95}ms;`;
   const face=document.createElement('div');face.className='shard-face';face.style.cssText=`width:${width}px;height:${height}px;left:${-left/100*width}px;top:${-top/100*height}px;`;
   const copy=source.cloneNode(true) as HTMLElement;copy.removeAttribute('aria-hidden');copy.style.cssText=`width:${width}px;height:${height}px;min-height:0;padding:${padding};`;
   copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
   copy.querySelectorAll('input,button,a,textarea,select').forEach(el=>{el.setAttribute('tabindex','-1');el.removeAttribute('name');if(el instanceof HTMLInputElement||el instanceof HTMLButtonElement)el.disabled=true;});
   face.append(copy,makeCracks());piece.append(face);host.append(piece);
  });
  const cracks=makeCracks();cracks.classList.add('crack-onset');host.append(cracks);
  const stop=playShatter(host,onComplete);
  return()=>{stop();host.replaceChildren();};
 },[]);
 return <div ref={layer} className="shatter-layer" aria-hidden="true" inert />;
}
// Match the existing cadence exactly, including the opening pause and comma beat.
export function typingDelay(count:number,previous?:string){return count===0?850:previous===','?360:previous===' '?105:58+(count%3)*28;}
export const GREETING_HOLD_MS=5000;
export const JOKE_ASIDE_MS=2700;
export const JOKE_READ_MS=5250;
export const BLACK_FADE_MS=900;

// Animation clocks count only foreground time. Cleanup cancels both the clock
// and visibility listener; a hidden tab cannot type or advance in the background.
export function visibleTimeout(callback:()=>void,delay:number){
 let timer:ReturnType<typeof setTimeout>|null=null,remaining=delay,started=0,cancelled=false;
 function pause(){if(timer!==null){clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(performance.now()-started));}}
 function resume(){if(cancelled||document.hidden||timer!==null)return;started=performance.now();timer=setTimeout(()=>{timer=null;if(document.hidden){remaining=0;return;}cancelled=true;document.removeEventListener('visibilitychange',visibility);callback();},remaining);}
 function visibility(){if(document.hidden)pause();else resume();}
 document.addEventListener('visibilitychange',visibility);resume();
 return()=>{cancelled=true;pause();document.removeEventListener('visibilitychange',visibility);};
}
export function Joke({active,reduced,onContinue}:{active:boolean,reduced:boolean,onContinue:()=>void}){
 const [aside,setAside]=useState(false),[fading,setFading]=useState(false);
 const next=useRef(onContinue);next.current=onContinue;
 useEffect(()=>{if(!active)return;setAside(reduced);setFading(false);if(reduced)return;const a=visibleTimeout(()=>setAside(true),JOKE_ASIDE_MS);const b=visibleTimeout(()=>setFading(true),JOKE_READ_MS);return()=>{a();b();};},[active,reduced]);
 useEffect(()=>{if(!active||!fading||reduced)return;return visibleTimeout(()=>next.current(),BLACK_FADE_MS);},[active,fading,reduced]);
 return <main className={'dark-scene joke-scene '+(fading?'reveal-fading':'')}><section className="cinema-copy reveal-copy"><h1 tabIndex={-1}>Just kidding.</h1><p className="lead">Low-effort, unformatted Google Forms aren’t necessary for this kind of thing anymore.</p><p className={'joke-aside '+(aside?'aside-visible':'')} aria-hidden={!aside}>(And that goes double for SignUpGenius.)</p>{reduced&&<button className="primary" onClick={()=>next.current()}>Continue <TravelArrow from={-.75} to={-.5} size={20}/></button>}</section></main>;
}
export function greetingText(name:string){return name&&name!=='there'?`Wake up, ${name}...`:'Wake up...';}
export function Greeting({name,instant,reduced,active,onContinue}:{name:string,instant:boolean,reduced:boolean,active:boolean,onContinue:()=>void}){
 const greeting=greetingText(name),letters=Array.from(greeting);
 const [count,setCount]=useState(0);
 const next=useRef(onContinue),advanced=useRef(false);next.current=onContinue;
 const complete=instant||count>=letters.length;
 function advance(){if(!active||!complete||document.hidden||advanced.current)return;advanced.current=true;next.current();}
 useEffect(()=>{setCount(0);},[name]);
 useEffect(()=>{if(active)advanced.current=false;},[active]);
 useEffect(()=>{
  if(!active||complete)return;
  return visibleTimeout(()=>setCount(n=>n+1),typingDelay(count,letters[count-1]));
 },[count,complete,active,name]);
 useEffect(()=>{if(!active||!complete||reduced)return;return visibleTimeout(advance,GREETING_HOLD_MS);},[active,complete,reduced,name]);
 return <main className="dark-scene greeting-scene" role={complete?'button':undefined} tabIndex={active&&complete?0:-1} aria-label={complete?greeting+' Continue invitation.':undefined} onClick={advance} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();advance();}}}>
  <h1 tabIndex={-1} aria-label={greeting+(complete?' Press Enter to continue.':'')} className={'greeting '+(name.length>22?'greeting-long':'')}><span className="greeting-space" aria-hidden="true">{greeting}</span><span className="greeting-typed" aria-hidden="true">{complete?greeting:letters.slice(0,count).join('')}<span className={'typing-caret '+(complete?'finished':'')} /></span></h1>
 </main>;
}
