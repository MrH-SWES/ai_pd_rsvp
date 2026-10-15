import {useEffect, useLayoutEffect, useRef, useState, type RefObject} from 'react';
import {ArrowRight} from 'lucide-react';

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
  const timer=setTimeout(onComplete,1320);
  const resized=()=>onComplete();
  window.addEventListener("resize",resized);
  return()=>{clearTimeout(timer);window.removeEventListener("resize",resized);host.replaceChildren();};
 },[]);
 return <div ref={layer} className="shatter-layer" aria-hidden="true" inert />;
}
export function Greeting({name,instant,active,onContinue,onChangeName,fromLink=false}:{name:string,instant:boolean,active:boolean,onContinue:()=>void,onChangeName:()=>void,fromLink?:boolean}){
 const greeting=`Hello, ${name}…`,letters=Array.from(greeting);
 const [count,setCount]=useState(0);
 const heading=useRef<HTMLHeadingElement>(null);
 const complete=instant||count>=letters.length;
 function skipTyping(){setCount(letters.length);heading.current?.focus({preventScroll:true});}
 useEffect(()=>{setCount(0);},[name]);
 useEffect(()=>{
  if(!active||complete)return;
  const previous=letters[count-1];
  const delay=count===0?850:previous===','?360:previous===' '?105:58+(count%3)*28;
  const timer=setTimeout(()=>setCount(n=>n+1),delay);return()=>clearTimeout(timer);
 },[count,complete,active,name]);
 useEffect(()=>{if(!active||complete)return;const skip=(e:KeyboardEvent)=>{if(e.key==='Escape')skipTyping();};window.addEventListener('keydown',skip);return()=>window.removeEventListener('keydown',skip);},[complete,active]);
 return <main className="dark-scene greeting-scene">
  {active&&!complete&&<button className="skip-animation" onClick={skipTyping}>Skip typing</button>}
  <section className="cinema-copy greeting-copy">
   <div className={'machine-signature '+(active&&!complete?'is-typing':'')} aria-hidden="true"><span className="robot-head"><i/><i/></span><span className="robot-keys"><i/><i/><i/></span><span>{complete?'READY WHEN YOU ARE':'SOMEONE’S AT THE KEYBOARD'}</span></div>
   <h1 ref={heading} tabIndex={-1} aria-label={greeting} className={'greeting '+(name.length>22?'greeting-long':'')}><span className="greeting-space" aria-hidden="true">{greeting}</span><span className="greeting-typed" aria-hidden="true">{complete?greeting:letters.slice(0,count).join('')}<span className={'typing-caret '+(complete?'finished':'')} /></span></h1>
   <div className={'greeting-controls '+(complete?'ready':'')} aria-hidden={!complete}>
    <button className="primary" disabled={!complete} onClick={onContinue}>Continue <ArrowRight size={20}/></button>
    <button className="back change-name" disabled={!complete} onClick={onChangeName}>{name==='there'?'Add my name':'Change my name'}</button>
   </div>
   {complete&&fromLink&&<p className="name-source">Your invite link included your first name. It’s only used for this greeting.</p>}
  </section>
 </main>;
}
