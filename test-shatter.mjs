import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {build} from 'esbuild';
await build({entryPoints:['src/Reveal.tsx'],outfile:'.test/shatter.mjs',bundle:true,platform:'node',format:'esm',jsx:'automatic'});
const {playShatter,SHATTER_FALLBACK_MS,SHATTER_STATIC_MS}=await import('./.test/shatter.mjs');
function harness({hidden=false,reduced=false,canAnimate=true,animationName="shard-fall",animationDuration="0.9s",animationPlayState="running",styleThrows=false}={}){
 const names=['document','window','performance','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','getComputedStyle'];
 const original=new Map(names.map(n=>[n,globalThis[n]]));
 let now=0,next=0,completed=0;const frames=new Map(),timers=new Map(),visibility=new Set(),listeners=new Map(),classes=new Set();
 const shards=Array.from({length:20},()=>({}));
 const host={querySelectorAll:()=>shards,classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:(n,fn)=>{if(listeners.get(n)===fn)listeners.delete(n)}};
 globalThis.getComputedStyle=()=>{if(styleThrows)throw new Error('Style unavailable');return {animationName,animationDuration,animationPlayState}};
 const resize=new Set();
 globalThis.document={hidden,addEventListener:(n,fn)=>{assert.equal(n,'visibilitychange');visibility.add(fn)},removeEventListener:(n,fn)=>visibility.delete(fn)};
 globalThis.window={addEventListener:(n,fn)=>{assert.equal(n,'resize');resize.add(fn)},removeEventListener:(n,fn)=>resize.delete(fn)};
 globalThis.performance={now:()=>now};globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.setTimeout=(fn,ms)=>{timers.set(++next,{fn,at:now+ms});return next};globalThis.clearTimeout=id=>timers.delete(id);
 const stop=playShatter(host,()=>completed++,{reduced,canAnimate});
 return {shards,frames,timers,visibility,listeners,classes,stop,get completed(){return completed},frame(){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(now)},advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}},hidden(value){document.hidden=value;for(const fn of [...visibility])fn()},end(target,name='shard-fall'){listeners.get('animationend')?.({target,animationName:name})},cancel(target){listeners.get('animationcancel')?.({target,animationName:'shard-fall'})},resize(){for(const fn of resize)fn()},restore(){stop();for(const [n,v] of original)if(v===undefined)delete globalThis[n];else globalThis[n]=v}};
}
function withHarness(fn,options){const h=harness(options);try{fn(h)}finally{h.restore()}}
test('no completion deadline runs before the fragments get a paint opportunity',()=>withHarness(h=>{h.advance(10000);assert.equal(h.completed,0);assert.equal(h.timers.size,0);assert(!h.classes.has('shatter-playing'));h.frame();assert.equal(h.timers.size,0);h.frame();assert(h.classes.has('shatter-playing'));assert.equal(h.timers.size,1)}));
test('all shard animation ends complete once; crack and unrelated events do not',()=>withHarness(h=>{h.frame();h.frame();h.end(h.shards[0],'crack-spread');h.end({});h.shards.slice(0,-1).forEach(s=>h.end(s));h.end(h.shards[0]);assert.equal(h.completed,0);h.end(h.shards.at(-1));assert.equal(h.completed,1);h.end(h.shards.at(-1));h.advance(10000);assert.equal(h.completed,1);assert.equal(h.timers.size,0);assert.equal(h.visibility.size,0);assert.equal(h.listeners.size,0)}));
test('viewport resize does not cancel or restart the shatter',()=>withHarness(h=>{h.frame();h.frame();h.advance(100);h.resize();assert.equal(h.completed,0);assert(h.classes.has('shatter-playing'));h.shards.forEach(s=>h.end(s));assert.equal(h.completed,1)}));
test('hidden tabs pause both CSS animation and the bounded fallback clock',()=>withHarness(h=>{h.frame();h.frame();h.advance(500);h.hidden(true);assert(!h.classes.has('shatter-playing'));h.advance(30000);assert.equal(h.completed,0);h.hidden(false);assert(h.classes.has('shatter-playing'));h.advance(SHATTER_FALLBACK_MS-501);assert.equal(h.completed,0);h.advance(1);assert.equal(h.completed,0);assert(h.classes.has('shatter-static'));h.frame();h.frame();h.advance(SHATTER_STATIC_MS);assert.equal(h.completed,1)}));
test('initially hidden tabs cannot start or complete the animation',()=>withHarness(h=>{assert.equal(h.frames.size,0);h.advance(30000);assert.equal(h.completed,0);h.hidden(false);h.frame();h.hidden(true);h.frame();assert.equal(h.timers.size,0);h.hidden(false);h.frame();h.frame();assert(h.classes.has('shatter-playing'));},{hidden:true}));
test('missing animation events display a static frame before completing',()=>withHarness(h=>{h.frame();h.frame();h.advance(SHATTER_FALLBACK_MS-1);assert.equal(h.completed,0);h.advance(1);assert.equal(h.completed,0);assert(h.classes.has('shatter-static'));assert(!h.classes.has('shatter-playing'));h.advance(10000);assert.equal(h.completed,0);h.frame();h.frame();h.advance(SHATTER_STATIC_MS-1);assert.equal(h.completed,0);h.advance(1);assert.equal(h.completed,1)}));
for(const [label,options] of [['reduced motion',{reduced:true}],['fragment setup failure',{canAnimate:false}],['disabled animation',{animationName:'none'}],['near-zero animation duration',{animationDuration:'0.00001s'}],['paused animation',{animationPlayState:'paused'}],['computed style failure',{styleThrows:true}]]){
 test(label+' holds static fractures for foreground time',()=>withHarness(h=>{
  assert(h.classes.has('shatter-static'));h.frame();h.frame();h.frame();h.frame();
  assert(h.classes.has('shatter-static'));assert(!h.classes.has('shatter-playing'));
  h.shards.forEach(s=>h.end(s));assert.equal(h.completed,0);
  h.advance(400);h.hidden(true);h.advance(30000);assert.equal(h.completed,0);
  h.hidden(false);h.advance(SHATTER_STATIC_MS-401);assert.equal(h.completed,0);
  h.advance(1);assert.equal(h.completed,1);assert.equal(h.visibility.size,0);assert.equal(h.listeners.size,0);
 },options));
}
test('cancelled animation switches to a painted static frame',()=>withHarness(h=>{h.frame();h.frame();h.cancel(h.shards[0]);assert(h.classes.has('shatter-static'));assert.equal(h.completed,0);h.frame();h.frame();h.advance(SHATTER_STATIC_MS);assert.equal(h.completed,1)}));
test('cleanup cancels startup frames, clocks and event listeners without advancing',()=>{withHarness(h=>{h.stop();h.frame();h.advance(10000);assert.equal(h.completed,0);assert.equal(h.frames.size,0);assert.equal(h.visibility.size,0)});withHarness(h=>{h.frame();h.frame();h.stop();h.advance(10000);h.shards.forEach(s=>h.end(s));assert.equal(h.completed,0);assert.equal(h.timers.size,0);assert.equal(h.visibility.size,0);assert.equal(h.listeners.size,0)})});
test('source preserves Skip, static SVG independent of clones, inert copies and scroll-safe focus',()=>{const source=fs.readFileSync('src/Survey.tsx','utf8'),reveal=fs.readFileSync('src/Reveal.tsx','utf8'),css=fs.readFileSync('docs/app.css','utf8');assert.doesNotMatch(source,/if\(reducedMotion\|\|hasRevealed.current\)/);assert.match(source,/reduced=\{reducedMotion\} onComplete=\{completeReveal\}/);assert.match(source,/skipAnimation.current\?\.focus\(\{preventScroll:true\}\)/);assert.match(source,/event.key==='Escape'/);assert.match(reveal,/className="shatter-layer shatter-static" aria-hidden="true" inert/);assert.match(reveal,/className="static-cracks"/);assert.match(css,/\.shatter-layer:not\(\.shatter-playing\) \*\{animation-play-state:paused\}/);assert.doesNotMatch(css,/\.shatter-layer\{display:none\}/);assert.doesNotMatch(reveal,/addEventListener\(["']resize/)});

test('an animation-end queued while hidden cannot advance until the tab is visible',()=>withHarness(h=>{h.frame();h.frame();h.hidden(true);h.shards.forEach(s=>h.end(s));assert.equal(h.completed,0);h.advance(10000);assert.equal(h.completed,0);h.hidden(false);assert.equal(h.completed,1);h.hidden(false);assert.equal(h.completed,1)}));
