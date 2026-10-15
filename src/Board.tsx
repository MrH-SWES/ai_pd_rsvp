import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';

// Stable coordinates: each screen stays on one large, serpentine board.
// Navigation moves the board itself, never a remounted/replaced question card.
export const boardScenes = [-1, -.75, -.5, 0, .1, .2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, -.25, -.4];
export function boardPosition(scene:number):[number,number]{
 if(scene===-.25)return [4,0];
 if(scene===-.4)return [2,-1];
 const i=boardScenes.indexOf(scene), row=Math.floor(i/4), column=i%4;
 return [row%2?3-column:column,row];
}
export default function Board({active,reduced,renderScene}:{active:number,reduced:boolean,renderScene:(scene:number)=>ReactNode}){
 const board=useRef<HTMLDivElement>(null),previous=useRef(active),focusTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [moving,setMoving]=useState(false),[skipMotion,setSkipMotion]=useState(false);
 const [x,y]=boardPosition(active);
 function focusScene(){board.current?.querySelector<HTMLElement>(`[data-scene="${active}"] h1`)?.focus({preventScroll:true});}
 useEffect(()=>{
  const changed=previous.current!==active;previous.current=active;
  setSkipMotion(false);
  const panel=board.current?.querySelector<HTMLElement>(`[data-scene="${active}"]`);
  panel?.scrollTo({top:0,behavior:'instant'});
  if(!changed||reduced){setMoving(false);focusScene();return;}
  setMoving(true);
  focusTimer.current=setTimeout(()=>{focusTimer.current=null;setMoving(false);focusScene();},740);
  return()=>{if(focusTimer.current)clearTimeout(focusTimer.current);focusTimer.current=null;};
 },[active,reduced]);
 function skip(){if(focusTimer.current)clearTimeout(focusTimer.current);focusTimer.current=null;setSkipMotion(true);setMoving(false);focusScene();}
 useEffect(()=>{if(!moving)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')skip();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[moving,active]);
 return <div className="board-viewport">
  <div className={'scene-board '+(reduced||skipMotion?'board-instant':'')} ref={board} style={{'--camera-x':x,'--camera-y':y} as CSSProperties}>
   {boardScenes.map(scene=>{const [sx,sy]=boardPosition(scene),selected=scene===active;return <div key={scene} className={'board-panel '+(selected?'is-active':'')} data-scene={scene} style={{'--scene-x':sx,'--scene-y':sy} as CSSProperties} inert={!selected} aria-hidden={!selected||undefined}>{renderScene(scene)}</div>;})}
  </div>
  {moving&&!reduced&&<button className="skip-animation pan-skip" onClick={skip}>Skip movement</button>}
 </div>;
}
