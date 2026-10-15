import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';

// One permanent, top-down storymap. Coordinates belong to the scenes, not to
// the navigation order. In particular Yes travels east and No travels south.
export const sceneMap:Record<string,[number,number]>={
 '-1':[0,0], '-0.75':[1,0], '-0.5':[2,0],
 '0':[3,0], '-0.25':[3,1], '0.1':[4,0], '0.2':[5,0],
 '1':[6,0], '2':[6,1], '3':[5,1], '4':[4,1], '5':[4,2],
 '6':[5,2], '7':[6,2], '8':[6,3], '9':[5,3], '10':[4,3],
};
export const boardScenes=[-1,-.75,-.5,0,.1,.2,1,2,3,4,5,6,7,8,9,10,-.25];
export const boardPosition=(scene:number):[number,number]=>sceneMap[String(scene)]||[0,0];
export const boardRoutes:[number,number][]=[[-1,-.75],[-.75,-.5],[-.5,0],[0,.1],[0,-.25],[.1,.2],[.2,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10]];
export const PAN_MS=1100;
export default function Board({active,reduced,renderScene}:{active:number,reduced:boolean,renderScene:(scene:number)=>ReactNode}){
 const board=useRef<HTMLDivElement>(null),previous=useRef(active),focusTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [moving,setMoving]=useState(false),[skipMotion,setSkipMotion]=useState(false);
 const [x,y]=boardPosition(active);
 // The joke finishes fading to black before the terminal is revealed. All
 // other scene changes move this same canvas; panels never crossfade.
 const cutToTerminal=active===-.5;
 function focusScene(){board.current?.querySelector<HTMLElement>(`[data-scene="${active}"] h1`)?.focus({preventScroll:true});}
 useEffect(()=>{
  const changed=previous.current!==active;previous.current=active;
  setSkipMotion(false);
  board.current?.querySelector<HTMLElement>(`[data-scene="${active}"]`)?.scrollTo({top:0,behavior:'instant'});
  if(!changed||reduced||cutToTerminal){setMoving(false);focusScene();return;}
  setMoving(true);
  focusTimer.current=setTimeout(()=>{focusTimer.current=null;setMoving(false);focusScene();},PAN_MS+20);
  return()=>{if(focusTimer.current)clearTimeout(focusTimer.current);focusTimer.current=null;};
 },[active,reduced]);
 function skip(){if(focusTimer.current)clearTimeout(focusTimer.current);focusTimer.current=null;setSkipMotion(true);setMoving(false);focusScene();}
 useEffect(()=>{if(!moving)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')skip();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[moving,active]);
 return <div className={'board-viewport '+(cutToTerminal?'terminal-viewport':'')}>
  <div className={'scene-board '+(reduced||skipMotion||cutToTerminal?'board-instant':'')} ref={board} style={{'--camera-x':x,'--camera-y':y} as CSSProperties}>
   <div className="storymap-paper" aria-hidden="true"/>
   <div className="storymap-routes" aria-hidden="true">{boardRoutes.map(([from,to])=>{const [ax,ay]=boardPosition(from),[bx,by]=boardPosition(to);return <div key={`${from}:${to}`} className={'map-route '+(ax===bx?'vertical':'horizontal')} style={{'--route-x':Math.min(ax,bx),'--route-y':Math.min(ay,by),'--route-length':Math.abs(ax-bx)+Math.abs(ay-by)} as CSSProperties}/>;})}</div>
   {boardScenes.map((scene,index)=>{const [sx,sy]=boardPosition(scene),selected=scene===active;return <div key={scene} className={'board-panel '+(selected?'is-active':'')+(scene===-.5?' terminal-panel':'')} data-scene={scene} style={{'--scene-x':sx,'--scene-y':sy} as CSSProperties} inert={!selected} aria-hidden={!selected||undefined}>
    {scene!==-.5&&scene!==-1&&<div className="panel-registration" aria-hidden="true"><span>{String(index+1).padStart(2,'0')}</span><i/><span>{sx} / {sy}</span></div>}
    {renderScene(scene)}
   </div>;})}
  </div>
  {moving&&!reduced&&!cutToTerminal&&<button className="skip-animation pan-skip" onClick={skip}>Skip movement</button>}
 </div>;
}
