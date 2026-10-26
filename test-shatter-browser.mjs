// Optional local-only browser regression suite. See SHATTER_VERIFICATION.md.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('docs');
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root+'/'))throw new Error('Outside docs');
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.ttf':'font/ttf'}[extname(path)];
  res.setHeader('Content-Type',type||'application/octet-stream');
  res.end(await readFile(path));
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 await mkdir('.test',{recursive:true});
 const cases=[
  {name:'normal'},
  {name:'reduced',reduced:true,static:true},
  {name:'mobile-reduced',reduced:true,static:true,mobile:true},
  {name:'animations-disabled',static:true,css:'*{animation:none!important;transition:none!important}'},
  {name:'animations-paused',static:true,css:'.form-shard{animation-play-state:paused!important}'},
  {name:'cloning-fails',static:true,inject:()=>{const original=Node.prototype.cloneNode;Node.prototype.cloneNode=function(...args){if(this.classList?.contains('form-scene'))throw Error('Simulated clone failure');return original.apply(this,args);};}},
  {name:'clip-path-unavailable',static:true,inject:()=>{const original=CSS.supports.bind(CSS);CSS.supports=(...args)=>args[0]==='clip-path'?false:original(...args);}},
  {name:'events-missing',fallback:true,inject:()=>document.addEventListener('animationend',e=>e.stopImmediatePropagation(),true)},
  {name:'motion-toggled',static:true,toggle:true},
  {name:'animation-cancelled',static:true,cancel:true},
  {name:'escape',skip:'Escape'},
  {name:'skip-animation',reduced:true,skip:'button'},
  {name:'skip-intro',skip:'intro'},
 ];
 for(const item of cases){
  const context=await browser.newContext({viewport:item.mobile?{width:390,height:844}:{width:1280,height:900},reducedMotion:item.reduced?'reduce':'no-preference'});
  const external=[];const errors=[];
  await context.route('**/*',route=>{
   if(!route.request().url().startsWith(origin+'/')){external.push(route.request().url());return route.abort();}
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  if(item.inject)await page.addInitScript(item.inject);
  await page.goto(origin);await page.locator('#decoy-name').waitFor({state:'visible'});
  if(item.css)await page.addStyleTag({content:item.css});
  if(item.skip==='intro')await page.getByRole('button',{name:'Skip intro',exact:true}).click();
  else{
   await page.locator('#decoy-name').focus();
   await page.locator('.shatter-layer').waitFor({state:'attached'});
   assert.equal(await page.locator('#decoy-name').count(),1);
   assert.equal(await page.locator('.shatter-skip').evaluate(el=>el===document.activeElement),true);
   if(item.skip==='Escape')await page.keyboard.press('Escape');
   else if(item.skip==='button')await page.getByRole('button',{name:'Skip animation',exact:true}).click();
   else{
    if(item.toggle||item.cancel||item.fallback||!item.static){
     await page.locator('.shatter-playing').waitFor({state:'attached'});
     if(item.toggle)await page.emulateMedia({reducedMotion:'reduce'});
     if(item.cancel)await page.addStyleTag({content:'.form-shard{animation:none!important}'});
    }
    if(item.static||item.fallback){
     await page.locator('.shatter-static').waitFor({state:'attached'});
     const state=await page.evaluate(()=>{
      const layer=document.querySelector('.shatter-layer');const svg=layer.querySelector('.static-cracks');const source=document.querySelector('.entry-wrap > .form-scene');
      return {sourceVisible:getComputedStyle(source).visibility,svgVisible:getComputedStyle(svg).display,paths:svg.querySelectorAll('path').length,rect:svg.getBoundingClientRect().toJSON(),playing:layer.classList.contains('shatter-playing'),active:document.querySelector('.board-panel:not([inert])')?.dataset.scene,animations:layer.getAnimations({subtree:true}).filter(a=>a.playState==='running').length};
     });
     assert.equal(state.sourceVisible,'visible');assert.notEqual(state.svgVisible,'none');assert.equal(state.paths,11);assert(state.rect.width>300&&state.rect.height>300);assert.equal(state.playing,false);assert.equal(state.active,'-1');assert.equal(state.animations,0);
     await page.waitForTimeout(350);assert.equal(await page.locator('.shatter-static').count(),1);
    }else{
     assert.equal(await page.locator('.form-shard').count(),20);
     await page.waitForTimeout(450);
     assert.notEqual(await page.locator('.form-shard').first().evaluate(el=>getComputedStyle(el).transform),'none');
    }
    await page.screenshot({path:`.test/shatter-${item.name}.png`});
   }
  }
  await page.locator('.board-panel[data-scene="-0.75"]:not([inert])').waitFor({timeout:6000});
  assert.equal(await page.locator('.shatter-layer').count(),0);
  if(item.reduced||item.toggle)assert.equal(await page.locator('.board-panel[data-scene="-0.75"]').getByRole('button',{name:'Continue',exact:true}).count(),1);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(`PASS ${item.name}: reaches joke, no browser errors or external requests`);
  await context.close();
 }
 console.log(`${cases.length} local Chrome scenarios passed`);
}finally{
 await browser?.close();await new Promise(done=>server.close(done));
}
