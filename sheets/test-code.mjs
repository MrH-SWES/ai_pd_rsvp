import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {groups, experiences, interests, sampleSessions, emptyAnswer} from '../lib/survey.ts';
import {normalizeResponseName,normalizeResponseEmail} from '../lib/sheets.ts';

const source = await readFile(new URL('./Code.gs', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const valid = (n=1) => ({requestId:id(n),responseName:'Avery 教师',answers:{...copy(emptyAnswer),interest:'interested',experience:'Regularly',availability:['session-a']}});
const NOW = Date.parse('2026-10-15T04:00:00.000Z');
let count=0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }

/** Local deterministic Apps Script mocks: no Google calls, credentials, or writes. */
function harness(options={}) {
 const calls=[];
 const properties=new Map(Object.entries({RSVP_SPREADSHEET_ID:'private-test-spreadsheet-id',...options.properties}));
 const state={now:NOW,locked:false,lockAvailable:true,flushCount:0,failFlushAt:0,failRowWrite:false,failWriteAfterStore:false,dropCell:-1,failRelease:false,failProperties:false,formulaAt:null,consumeEscapes:true,...options.state};
 const sheets=new Map();
 class FakeDate extends Date {
  constructor(...args) { super(...(args.length?args:[state.now])); }
  static now() { return state.now; }
 }
 function assertLocked() { assert.equal(state.locked,true,'all sheet operations must hold script lock'); }
 class Sheet {
  constructor(name,rows=[]) { this.name=name; this.rows=copy(rows); this.maxRows=options.maxRows??1000; this.maxColumns=options.maxColumns??26; }
  getLastRow() { assertLocked(); return this.rows.length; }
  getLastColumn() { assertLocked(); return Math.max(0,...this.rows.map(row=>{let n=row.length;while(n&&row[n-1]==='')n--;return n;})); }
  getMaxRows() { assertLocked(); return this.maxRows; }
  getMaxColumns() { assertLocked(); return this.maxColumns; }
  insertRowsAfter(start,n) { assertLocked(); assert.equal(start,this.maxRows); this.maxRows+=n; calls.push(['growRows',n]); }
  insertColumnsAfter(start,n) { assertLocked(); assert.equal(start,this.maxColumns); this.maxColumns+=n; calls.push(['growColumns',n]); }
  getRange(row,col,numRows=1,numCols=1) {
   assertLocked();
   assert(row>0&&col>0&&numRows>0&&numCols>0);
   assert(row+numRows-1<=this.maxRows,'row bounds');
   assert(col+numCols-1<=this.maxColumns,'column bounds');
   const sheet=this;
   const range={
    getValues() { assertLocked(); calls.push(['read',row,col,numRows,numCols]);return Array.from({length:numRows},(_,r)=>Array.from({length:numCols},(_,c)=>sheet.rows[row+r-1]?.[col+c-1]??'')); },
    getFormulas() { assertLocked();return Array.from({length:numRows},(_,r)=>Array.from({length:numCols},(_,c)=>state.formulaAt?.[0]===row+r&&state.formulaAt?.[1]===col+c?'=FORGED()':'')); },
    setNumberFormat(format) { assertLocked(); assert.equal(format,'@');calls.push(['format',row,format]);return range; },
    setValues(values) {
     assertLocked();calls.push(['write',row,col,copy(values)]);
     assert.equal(values.length,numRows);assert(values.every(v=>v.length===numCols));
     if(row>1&&state.failRowWrite)throw Error('private-test-spreadsheet-id: permission detail');
     for(let r=0;r<numRows;r++){
      const target=sheet.rows[row+r-1]??(sheet.rows[row+r-1]=[]);
      for(let c=0;c<numCols;c++){
       let value=values[r][c];
       if(row>1&&state.dropCell===c)continue;
       if(state.consumeEscapes&&typeof value==='string'&&value.startsWith("'"))value=value.slice(1);
       target[col+c-1]=value;
      }
     }
     if(row>1&&state.failWriteAfterStore)throw Error('private-test-spreadsheet-id: uncertain write');
     return range;
    }
   };
   return range;
  }
 }
 if(options.rows)sheets.set(options.sheetName??'Responses',new Sheet(options.sheetName??'Responses',options.rows));
 const context=vm.createContext({
  console,Date:FakeDate,
  PropertiesService:{getScriptProperties(){calls.push(['properties']);return{
   getProperty(key){return properties.has(key)?properties.get(key):null;},
   setProperties(values,deleteAll){assertLocked();if(state.failProperties)throw Error('property secret');assert.equal(deleteAll,false);for(const [key,value]of Object.entries(values))properties.set(key,value);calls.push(['reserve',copy(values)]);}
  };}},
  LockService:{getScriptLock(){return{
   tryLock(ms){assert.equal(ms,10000);calls.push(['lock']);if(!state.lockAvailable)return false;assert.equal(state.locked,false);state.locked=true;return true;},
   releaseLock(){assertLocked();state.locked=false;calls.push(['release']);if(state.failRelease)throw Error('release failed');}
  };}},
  SpreadsheetApp:{
   openById(spreadsheetId){assertLocked();calls.push(['open',spreadsheetId]);if(options.failOpen)throw Error('private-test-spreadsheet-id: raw API error');return{
    getSheetByName(name){assertLocked();return sheets.get(name)||null;},
    insertSheet(name){assertLocked();assert(!sheets.has(name));calls.push(['insertSheet',name]);const sheet=new Sheet(name);sheets.set(name,sheet);return sheet;}
   };},
   flush(){assertLocked();calls.push(['flush']);state.flushCount++;if(state.flushCount===state.failFlushAt)throw Error('private-test-spreadsheet-id: failed flush');}
  },
  Utilities:{
   DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
   newBlob(text){return{getBytes(){return [...Buffer.from(text,'utf8')];}};},
   computeDigest(algorithm,text,charset){assert.equal(algorithm,'SHA_256');assert.equal(charset,'UTF_8');return [...createHash('sha256').update(text,'utf8').digest()].map(byte=>byte>127?byte-256:byte);}
  },
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput(text){calls.push(['json',text]);return{text,setMimeType(type){assert.equal(type,'application/json');return{text,mimeType:type};}};}},
  HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput(html){calls.push(['inert',html]);return{html};},createTemplateFromFile(file){assert.equal(file,'Bridge');const template={evaluate(){calls.push(['template',copy({parentOriginJson:template.parentOriginJson,channelNonceJson:template.channelNonceJson})]);return{setXFrameOptionsMode(mode){assert.equal(mode,'ALLOWALL');return{mode,template};}};}};return template;}}
 });
 vm.runInContext(source,context,{filename:'Code.gs'});
 context.RSVP_REQUIRE_RECIPIENT_ = options.requireRecipient ?? false;
 return{context,state,properties,calls,sheets,submit(payload){return copy(context.submitResponse(payload));},rows(name='Responses'){return sheets.get(name)?.rows??[];},headers(){return copy(context.RSVP_HEADERS_);}};
}
function saved(result,n=1){assert.deepEqual(result,{ok:true,requestId:id(n)});}
function rejected(result,pattern){assert.equal(result.ok,false);assert.equal(typeof result.error,'string');assert(result.error.length<=250);assert.deepEqual(Object.keys(result).sort(),['error','ok','requestId']);if(pattern)assert.match(result.error,pattern);assert(!result.error.includes('private-test-spreadsheet-id'));}

// Contract parity and complete success paths.
test('all approved survey options exactly match the baseline',()=>{
 const h=harness();
 for(const key of ['tools','uses','beliefs','blockers'])assert.deepEqual(copy(h.context.RSVP_OPTIONS_[key]),groups[key].flatMap(group=>group.slice(1)));
 assert.deepEqual(copy(h.context.RSVP_OPTIONS_.interest),interests.map(x=>x.id));
 assert.deepEqual(copy(h.context.RSVP_OPTIONS_.experience),experiences);
 assert.deepEqual(copy(h.context.RSVP_OPTIONS_.availability),[...sampleSessions.map(s=>s.id),'neither','updates']);
});
test('append includes UTC timestamp, request ID, server hash, name and every answer',()=>{
 const h=harness();const p=valid();p.answers.tools=['ChatGPT','Claude'];p.answers.uses=['Emails & writing'];p.answers.beliefs=['A useful thinking partner'];p.answers.blockers=['Student privacy'];p.answers.example='  Rewriting  ';p.answers.question='  Can it help?  ';
 saved(h.submit(p));const row=h.rows()[1];assert.deepEqual(h.rows()[0],h.headers());assert.equal(row.length,14);assert.equal(row[0],'2026-10-15T04:00:00.000Z');assert.equal(row[1],id(1));assert.match(row[2],/^[a-f0-9]{64}$/);assert.deepEqual(row.slice(3),['Avery 教师','interested','Regularly','["ChatGPT","Claude"]','["Emails & writing"]','["A useful thinking partner"]','["Student privacy"]','Rewriting','Can it help?','["session-a"]','']);
 assert.equal(h.state.locked,false);const write=h.calls.findLastIndex(x=>x[0]==='write');const flush=h.calls.findLastIndex(x=>x[0]==='flush');const verify=h.calls.findLastIndex(x=>x[0]==='read');const release=h.calls.findLastIndex(x=>x[0]==='release');assert(write<flush&&flush<verify&&verify<release);
});
test('new request ID appends another response even with identical answers',()=>{const h=harness();saved(h.submit(valid()));saved(h.submit(valid(2)),2);assert.equal(h.rows().length,3);});
test('all interest options and all four availability choices are accepted',()=>{let n=1;const h=harness();for(const {id:interest}of interests)for(const availability of ['session-a','session-b','neither','updates']){const p=valid(n);p.answers.interest=interest;p.answers.availability=[availability];saved(h.submit(p),n++);}});
test('omitted legacy interest stays blank without inventing a response',()=>{const h=harness();const p=valid();delete p.answers.interest;saved(h.submit(p));assert.equal(h.rows()[1][4],'');});
test('Not yet clears stale tool/use choices but keeps interest',()=>{const h=harness();const p=valid();p.answers.experience='Not yet';p.answers.interest='eager_unsure';p.answers.tools=['ChatGPT'];p.answers.uses=['Emails & writing'];saved(h.submit(p));assert.equal(h.rows()[1][4],'eager_unsure');assert.deepEqual(h.rows()[1].slice(6,8),['[]','[]']);});
test('Unicode names normalize whitespace and remain literal',()=>{const h=harness();const p=valid();p.responseName='  李  Zoë  ';saved(h.submit(p));assert.equal(h.rows()[1][3],'李 Zoë');});
test('server names agree with host normalization for Unicode, controls, and bounds',()=>{
 for(const name of [' 李  Zoë ', 'Óscar', '教师', 'N'.repeat(60), '💙 Teacher', '\u3000Avery\u3000', '', '---', 'N'.repeat(61), 'A\nB', 'A\tB', 'A\u007fB']) {
  const h=harness();const p=valid();p.responseName=name;
  let expected;try{expected=normalizeResponseName(name);}catch{rejected(h.submit(p));continue;}
  saved(h.submit(p));assert.equal(h.rows()[1][3],expected);
 }
});
test('exact maximum written bounds are accepted',()=>{const h=harness();const p=valid();p.responseName='N'.repeat(60);p.answers.example='x'.repeat(500);p.answers.question='y'.repeat(3000);saved(h.submit(p));});
test('maximum valid UTF-8 answer text remains under envelope size',()=>{const h=harness();const p=valid();p.answers.example='字'.repeat(500);p.answers.question='語'.repeat(3000);saved(h.submit(p));});

// Idempotency and durable acknowledgements.
test('identical retries return the same acknowledgement and never append',()=>{const h=harness();const p=valid();saved(h.submit(p));const writes=h.calls.filter(x=>x[0]==='write').length;saved(h.submit(copy(p)));assert.equal(h.rows().length,2);assert.equal(h.calls.filter(x=>x[0]==='write').length,writes);});
test('object key ordering does not change the payload fingerprint',()=>{const h=harness();const p=valid();saved(h.submit(p));const reordered={answers:Object.fromEntries(Object.entries(p.answers).reverse()),responseName:p.responseName,requestId:p.requestId};saved(h.submit(reordered));assert.equal(h.rows().length,2);});
for(const [label,change]of [
 ['question',p=>p.answers.question='changed'],['name',p=>p.responseName='Other Person'],['interest',p=>p.answers.interest='curious'],['availability',p=>p.answers.availability=['session-b']],['original spacing',p=>p.answers.question=' '],['previously hidden beginner tools',p=>p.answers.tools=['ChatGPT']]
])test(`same request ID with changed ${label} is rejected`,()=>{const h=harness();const p=valid();if(label.includes('beginner'))p.answers.experience='Not yet';saved(h.submit(p));change(p);rejected(h.submit(p),/different answers/);assert.equal(h.rows().length,2);});
test('array order changes count as conflicting reuse',()=>{const h=harness();const p=valid();p.answers.tools=['ChatGPT','Claude'];saved(h.submit(p));p.answers.tools.reverse();rejected(h.submit(p),/different answers/);});
test('new appends cannot report success if row write fails',()=>{const h=harness({state:{failRowWrite:true}});rejected(h.submit(valid()),/couldn’t confirm/);assert.equal(h.rows().length,1);assert.equal(h.state.locked,false);});
test('failed append flush returns failure and retry recovers a committed row',()=>{const h=harness({state:{failFlushAt:2}});const p=valid();rejected(h.submit(p),/couldn’t confirm/);assert.equal(h.rows().length,2);h.state.failFlushAt=0;saved(h.submit(p));assert.equal(h.rows().length,2);});
test('uncertain setValues failure is safely deduplicated on retry',()=>{const h=harness({state:{failWriteAfterStore:true}});const p=valid();rejected(h.submit(p));h.state.failWriteAfterStore=false;saved(h.submit(p));assert.equal(h.rows().length,2);});
test('incomplete read-back never produces a successful acknowledgement',()=>{const h=harness({state:{dropCell:11}});const p=valid();p.answers.question='must be persisted';rejected(h.submit(p),/couldn’t confirm/);rejected(h.submit(p),/couldn’t confirm/);assert.equal(h.rows().length,2);});
test('a formula discovered in a saved row is rejected',()=>{const h=harness();saved(h.submit(valid()));h.state.formulaAt=[2,12];rejected(h.submit(valid()),/organizer check/);});
test('an edited existing response cannot be acknowledged as the original',()=>{const h=harness();saved(h.submit(valid()));h.rows()[1][3]='Edited';rejected(h.submit(valid()),/couldn’t confirm/);});
test('duplicate request ID rows are treated as corruption, never appended over',()=>{const h=harness();saved(h.submit(valid()));h.rows().push([...h.rows()[1]]);rejected(h.submit(valid()),/organizer check/);assert.equal(h.rows().length,3);});
test('lock contention returns a controlled retry error without accessing sheets',()=>{const h=harness({state:{lockAvailable:false}});rejected(h.submit(valid()),/busy/);assert(!h.calls.some(x=>x[0]==='open'));});
test('release errors do not invalidate an already verified commit',()=>{const h=harness({state:{failRelease:true}});saved(h.submit(valid()));});

// Malformed/forged data is rejected before taking a lock or touching sheets.
const badCases=[
 ['null envelope',()=>null],['array envelope',()=>[]],['missing request ID',p=>{delete p.requestId;return p;}],
 ['non-UUID ID',p=>({...p,requestId:'not-a-uuid'})],['non-v4 UUID',p=>({...p,requestId:'00000000-0000-1000-8000-000000000001'})],['uppercase UUID',p=>({...p,requestId:'AAAAAAAA-0000-4000-8000-000000000001'})],
 ['extra envelope field',p=>({...p,spreadsheetId:'forged'})],['missing answer',p=>{delete p.answers.question;return p;}],['extra answer field',p=>{p.answers.email='forged';return p;}],['array answers',p=>({...p,answers:[]})],
 ['empty name',p=>({...p,responseName:'   '})],['name missing letters or digits',p=>({...p,responseName:'---'})],['oversized name',p=>({...p,responseName:'N'.repeat(61)})],['name controls',p=>({...p,responseName:'Avery\nTeacher'})],['non-string name',p=>({...p,responseName:42})],
 ['empty interest',p=>{p.answers.interest='';return p;}],['unknown interest',p=>{p.answers.interest='very_eager';return p;}],['null interest',p=>{p.answers.interest=null;return p;}],['invalid experience',p=>{p.answers.experience='Sometimes';return p;}],
 ['unknown tool',p=>{p.answers.tools=['forged'];return p;}],['unknown use',p=>{p.answers.uses=['forged'];return p;}],['unknown belief',p=>{p.answers.beliefs=['forged'];return p;}],['unknown blocker',p=>{p.answers.blockers=['forged'];return p;}],
 ['duplicate tool',p=>{p.answers.tools=['ChatGPT','ChatGPT'];return p;}],['non-array choices',p=>{p.answers.tools='ChatGPT';return p;}],['non-string choice',p=>{p.answers.tools=[3];return p;}],['sparse choices',p=>{p.answers.tools=new Array(1);return p;}],
 ['over two beliefs',p=>{p.answers.beliefs=['A fad','Potentially harmful','I’m still figuring it out'];return p;}],['exclusive remembered tool',p=>{p.answers.tools=['ChatGPT','I don’t remember'];return p;}],['exclusive blocker',p=>{p.answers.blockers=['Student privacy','Nothing in particular'];return p;}],
 ['missing availability',p=>{p.answers.availability=[];return p;}],['both sessions',p=>{p.answers.availability=['session-a','session-b'];return p;}],['forged session',p=>{p.answers.availability=['session-c'];return p;}],['mixed availability',p=>{p.answers.availability=['session-a','neither'];return p;}],['duplicate availability',p=>{p.answers.availability=['updates','updates'];return p;}],
 ['oversized example',p=>{p.answers.example='x'.repeat(501);return p;}],['oversized question',p=>{p.answers.question='x'.repeat(3001);return p;}],['non-string example',p=>{p.answers.example={text:'forged'};return p;}],['non-string question',p=>{p.answers.question=null;return p;}]
];
for(const [label,change]of badCases)test(`reject ${label} before lock or sheet access`,()=>{const h=harness();rejected(h.submit(change(valid())));assert(!h.calls.some(x=>x[0]==='lock'||x[0]==='open'));});
test('total envelope limit is UTF-8 bytes, including normalized-away whitespace',()=>{const h=harness();const p=valid();p.responseName='\u3000'.repeat(6800)+'A';assert(JSON.stringify(p).length<20000);rejected(h.submit(p),/shorten/);assert.equal(h.rows().length,0);});
test('oversized raw envelope is rejected without echoing its ID',()=>{const h=harness();const p=valid();p.requestId='x'.repeat(21000);const result=h.submit(p);rejected(result,/shorten/);assert.equal(result.requestId,'');});
test('circular input fails safely',()=>{const h=harness();const p=valid();p.answers.question=p;rejected(h.submit(p));assert.equal(h.rows().length,0);});

// Formula safety for every user-controlled text column.
for(const attack of ['=IMPORTXML("https://example.invalid","//x")','+SUM(1,2)','-1+1','@SUM(1,2)','\t=1+1','\r\n=1+1','\u200b=1+1','\ufeff=1+1','\u0000=1+1'])test(`free text escapes formula prefix ${JSON.stringify(attack.slice(0,8))}`,()=>{
 const h=harness();const p=valid();p.answers.example=attack;p.answers.question=attack;saved(h.submit(p));const write=h.calls.findLast(x=>x[0]==='write')[3][0];assert(write[10].startsWith("'"));assert(write[11].startsWith("'"));saved(h.submit(p));
});
test('a formula-looking Unicode name is escaped and acknowledged literally',()=>{const h=harness();const p=valid();p.responseName='=IMPORTXML 教师';saved(h.submit(p));assert(h.calls.findLast(x=>x[0]==='write')[3][0][3].startsWith("'"));saved(h.submit(p));});
test('formula read-back also accepts services that retain the escape apostrophe',()=>{const h=harness({state:{consumeEscapes:false}});const p=valid();p.answers.question='=SUM(1,2)';saved(h.submit(p));saved(h.submit(p));});
test('literal leading apostrophes survive a consumed Sheets escape and retries',()=>{for(const text of ["'Yes' is vague","''quoted","'","\u200b'prefixed"]){const h=harness();const p=valid();p.answers.example=text;p.answers.question=text;saved(h.submit(p));assert.equal(h.rows()[1][10],text);assert.equal(h.rows()[1][11],text);assert(h.calls.findLast(x=>x[0]==='write')[3][0][11].startsWith("'"));saved(h.submit(p));}});
test('literal leading apostrophe in a name survives an escaped write',()=>{const h=harness();const p=valid();p.responseName="'Avery";saved(h.submit(p));assert.equal(h.rows()[1][3],"'Avery");saved(h.submit(p));});
test('normal user text remains unchanged apart from intended trimming',()=>{const h=harness();const p=valid();p.answers.example='A + B = C';p.answers.question='First line\nSecond line';saved(h.submit(p));assert.equal(h.rows()[1][10],'A + B = C');assert.equal(h.rows()[1][11],'First line\nSecond line');});

// Configuration, existing-sheet integrity, and bounded abuse protection.
test('missing spreadsheet configuration is controlled and never opens a sheet',()=>{const h=harness({properties:{RSVP_SPREADSHEET_ID:''}});rejected(h.submit(valid()),/not configured/);assert(!h.calls.some(x=>x[0]==='open'));});
test('invalid tab name is rejected without changing existing data',()=>{const h=harness({properties:{RSVP_SHEET_NAME:'bad/name'}});rejected(h.submit(valid()),/not configured/);assert(!h.calls.some(x=>x[0]==='open'));});
test('custom tab name is read only from private properties',()=>{const h=harness({properties:{RSVP_SHEET_NAME:'Staff Responses'}});saved(h.submit(valid()));assert.equal(h.rows('Staff Responses').length,2);assert.equal(h.rows().length,0);});
test('existing incompatible data is never cleared or overwritten',()=>{const rows=[['Existing private data'],['Do not remove']];const h=harness({rows});rejected(h.submit(valid()),/organizer check/);assert.deepEqual(h.rows(),rows);assert(!h.calls.some(x=>x[0]==='write'));});
test('header formula masquerading as a header is rejected',()=>{const h=harness();saved(h.submit(valid()));h.state.formulaAt=[1,1];rejected(h.submit(valid(2)),/organizer check/);assert.equal(h.rows().length,2);});
test('new blank sheet grows columns and response capacity as needed',()=>{const h=harness({maxRows:1,maxColumns:5});saved(h.submit(valid()));assert(h.calls.some(x=>x[0]==='growRows'));assert(h.calls.some(x=>x[0]==='growColumns'));});
test('open errors never disclose raw Google diagnostics or sheet ID',()=>{const h=harness({failOpen:true});rejected(h.submit(valid()),/couldn’t confirm/);assert.equal(h.state.locked,false);});
test('quota property failure prevents a new write and returns controlled failure',()=>{const h=harness({state:{failProperties:true}});rejected(h.submit(valid()));assert.equal(h.rows().length,1);});
test('61st new attempt in a minute is throttled while identical saved retries succeed',()=>{const h=harness();for(let n=1;n<=60;n++)saved(h.submit(valid(n)),n);rejected(h.submit(valid(61)),/wait a minute/);saved(h.submit(valid(1)));assert.equal(h.rows().length,61);assert.equal(h.properties.get('RSVP_RATE_COUNT'),'60');h.state.now+=60000;saved(h.submit(valid(61)),61);assert.equal(h.rows().length,62);});
test('conflicting retries stay rejected even at the throttle limit',()=>{const h=harness();saved(h.submit(valid()));h.properties.set('RSVP_RATE_COUNT','60');const p=valid();p.answers.question='changed';rejected(h.submit(p),/different answers/);});

test('at 10000 responses, saved retries succeed but no new response appends',()=>{const h=harness({maxRows:10002});saved(h.submit(valid()));while(h.rows().length<10001){const row=[...h.rows()[1]];row[1]=id(h.rows().length);h.rows().push(row);}saved(h.submit(valid()));rejected(h.submit(valid(10001)),/reached its limit/);assert.equal(h.rows().length,10001);});
test('last available response slot can append, flush and verify',()=>{const h=harness({maxRows:10001});saved(h.submit(valid()));while(h.rows().length<10000){const row=[...h.rows()[1]];row[1]=id(h.rows().length);h.rows().push(row);}saved(h.submit(valid(10000)),10000);assert.equal(h.rows().length,10001);});
test('oversized existing sheet fails closed before scanning metadata',()=>{const h=harness({maxRows:10002});saved(h.submit(valid()));while(h.rows().length<10002)h.rows().push([...h.rows()[1]]);h.calls.length=0;rejected(h.submit(valid()),/reached its limit/);assert(!h.calls.some(x=>x[0]==='read'&&x[1]===2&&x[2]===2));assert(!h.calls.some(x=>x[0]==='write'));});

// Public surface and nonce-bound bridge template.
test('only doGet, doPost and submitResponse are public top-level functions',()=>{assert.deepEqual([...source.matchAll(/^function\s+([A-Za-z0-9_]+)\(/gm)].map(x=>x[1]).filter(name=>!name.endsWith('_')).sort(),['doGet','doPost','submitResponse']);});
test('bridge config contains no spreadsheet ID or properties',()=>{const h=harness();assert.deepEqual(copy(h.context.getBridgeConfig_()),{allowedParentOrigin:'https://mrh-swes.github.io',protocolVersion:1});assert.equal(h.calls.length,0);});
test('valid nonce is JSON-injected with the fixed approved parent origin',()=>{const h=harness();const nonce='a'.repeat(32);const output=h.context.doGet({parameter:{channelNonce:nonce,parentOrigin:'https://attacker.invalid'}});assert.equal(output.mode,'ALLOWALL');assert.equal(output.template.channelNonceJson,JSON.stringify(nonce));assert.equal(output.template.parentOriginJson,JSON.stringify('https://mrh-swes.github.io'));assert(!h.calls.some(x=>x[0]==='open'||x[0]==='properties'));});
for(const nonce of [undefined,'','a'.repeat(31),'a'.repeat(33),'A'.repeat(32),'<script>alert(1)</script>'])test(`missing/invalid bridge nonce is inert: ${String(nonce).slice(0,12)}`,()=>{const h=harness();const output=h.context.doGet({parameter:{channelNonce:nonce}});assert.equal(typeof output.html,'string');assert(!output.html.includes('<script'));assert(!h.calls.some(x=>x[0]==='template'));});
test('doGet without event is inert',()=>{const h=harness();assert.equal(typeof h.context.doGet().html,'string');});

// Read-only health route and simple-request POST JSON route.
const postEvent = payload => ({queryString:null,parameter:{},parameters:{},postData:{type:'text/plain;charset=UTF-8',contents:JSON.stringify(payload)}});
const postResult = (h,event) => {const output=h.context.doPost(event);assert.equal(output.mimeType,'application/json');return JSON.parse(output.text);};
test('exact health=1 returns only fixed public JSON without properties, locks, or sheet access',()=>{
 const h=harness();const out=h.context.doGet({queryString:'health=1',parameter:{health:'1'},parameters:{health:['1']}});
 assert.equal(out.mimeType,'application/json');assert.deepEqual(JSON.parse(out.text),{ok:true,service:'staff-rsvp',protocolVersion:2});assert.deepEqual(h.calls.map(x=>x[0]),['json']);
});
for(const event of [
 {queryString:'health=1&payload=x',parameter:{health:'1',payload:'x'}},
 {queryString:'health=1&health=1',parameter:{health:'1'},parameters:{health:['1','1']}},
 {queryString:'health=1',parameter:{health:'1'},parameters:{health:['1','1']}},
 {queryString:'health=1',parameter:{health:'1',requestId:id(1)}},
 {queryString:'health=01',parameter:{health:'01'}},
 {parameter:{health:'1'}},
 {queryString:'payload='+encodeURIComponent(JSON.stringify(valid())),parameter:{payload:JSON.stringify(valid())}}
])test('GET never accepts a payload or ambiguous health query '+String(event.queryString).slice(0,45),()=>{
 const h=harness();const out=h.context.doGet(event);assert.equal(typeof out.html,'string');assert.equal(h.rows().length,0);assert(!h.calls.some(x=>['json','lock','properties','open'].includes(x[0])));
});
test('nonce bridge still cannot submit answers through GET parameters',()=>{
 const h=harness();h.context.doGet({queryString:'channelNonce='+ 'a'.repeat(32)+'&payload=x',parameter:{channelNonce:'a'.repeat(32),payload:JSON.stringify(valid())}});
 assert.deepEqual(h.calls.map(x=>x[0]),['template']);assert.equal(h.rows().length,0);
});
test('text/plain JSON POST returns exact verified acknowledgement and all answers',()=>{const h=harness(),p=valid();saved(postResult(h,postEvent(p)));assert.equal(h.rows().length,2);assert.equal(h.rows()[1][1],p.requestId);});
test('POST application/json is also accepted without changing the contract',()=>{const h=harness(),e=postEvent(valid());e.postData.type='application/json';saved(postResult(h,e));});
test('POST and RPC retries deduplicate across both transports',()=>{const h=harness(),p=valid();saved(h.submit(p));saved(postResult(h,postEvent(p)));saved(h.submit(p));assert.equal(h.rows().length,2);});
test('POST cannot overwrite a conflicting request ID',()=>{const h=harness(),p=valid();saved(postResult(h,postEvent(p)));p.answers.question='changed';rejected(postResult(h,postEvent(p)),/different answers/);assert.equal(h.rows().length,2);});
test('POST never reports saved on an incomplete write',()=>{const h=harness({state:{dropCell:11}}),p=valid();p.answers.question='must persist';rejected(postResult(h,postEvent(p)),/couldn’t confirm/);});
test('POST ambiguous committed write safely recovers with the same request ID',()=>{const h=harness({state:{failWriteAfterStore:true}}),p=valid();rejected(postResult(h,postEvent(p)));h.state.failWriteAfterStore=false;saved(postResult(h,postEvent(p)));assert.equal(h.rows().length,2);});
for(const [label,event] of [
 ['missing event',undefined],['missing post data',{}],['malformed JSON',{postData:{type:'text/plain',contents:'{bad'}}],
 ['form data',{postData:{type:'application/x-www-form-urlencoded',contents:'payload=x'}}],
 ['HTML',{postData:{type:'text/html',contents:'<script>private text</script>'}}],
 ['query payload',{...postEvent(valid()),queryString:'payload=private'}],
 ['array body',postEvent([])],['null body',postEvent(null)],['extra envelope key',postEvent({...valid(),sheetId:'private'})],
 ['missing name',postEvent({...valid(),responseName:''})],
 ['oversized body',{postData:{type:'text/plain',contents:' '.repeat(20001)}}],
 ['oversized UTF-8 body',{postData:{type:'text/plain',contents:'字'.repeat(7000)}}],
 ['invalid body type',{postData:{type:'text/plain',contents:{private:'value'}}}]
])test('POST rejects '+label+' before sheet access and returns only safe JSON',()=>{const h=harness();const r=postResult(h,event);rejected(r);assert.equal(h.rows().length,0);assert(!h.calls.some(x=>x[0]==='lock'||x[0]==='open'));assert(!JSON.stringify(r).includes('private'));});
test('POST retains UTF-8 name and written-text limits at the accepted maximum',()=>{const h=harness(),p=valid();p.answers.example='字'.repeat(500);p.answers.question='語'.repeat(3000);saved(postResult(h,postEvent(p)));});

console.log(`\n${count} Apps Script backend tests passed. No external services were contacted.`);

test('email is validated, appended, deduplicated and included in payload hash',()=>{
 const h=harness();const p={...valid(),responseEmail:' Taylor.Smith+pd@example.org '};saved(h.submit(p));assert.equal(h.rows()[1][13],'Taylor.Smith+pd@example.org');saved(h.submit(p));assert.equal(h.rows().length,2);rejected(h.submit({...p,responseEmail:'other@example.org'}),/different answers/);
 for(const responseEmail of ['',null,12,'missing-at','a@b','a..b@example.org','.a@example.org','a.@example.org','a@-bad.org','a@bad-.org','a@exam ple.org','a@example.org\nBCC:x@y.org','a'.repeat(65)+'@example.org'])rejected(h.submit({...valid(2),responseEmail}),/valid email/);
});
test('exact legacy headers migrate by appending only; old hashes and retries remain valid',()=>{
 const original=harness();const p=valid();saved(original.submit(p));const rows=original.rows().map(row=>row.slice(0,13));const before=copy(rows);const h=harness({rows,maxColumns:13});saved(h.submit(p));assert.equal(h.rows().length,2);assert.equal(h.rows()[0][13],'response_email');assert.deepEqual(h.rows()[1],before[1]);assert.deepEqual(h.rows()[0].slice(0,13),before[0]);
 saved(h.submit({...valid(2),responseEmail:'new@example.org'}),2);assert.equal(h.rows()[2][13],'new@example.org');
});

test('client/server email validation agrees and literal formula-like local parts stay safe',()=>{
 for(const responseEmail of ['name@example.org',' First.Last+pd@example.org ', '=name@example.org', '+tag@example.org', "o'neil@example.org", 'x@sub.example.org', 'a..b@example.org', 'a@b', 'x@'+'a'.repeat(64)+'.org', 'x\n@example.org']){
  const h=harness();let normalized;try{normalized=normalizeResponseEmail(responseEmail);}catch{rejected(h.submit({...valid(),responseEmail}),/valid email/);continue;}
  saved(h.submit({...valid(),responseEmail}));assert.equal(h.rows()[1][13],normalized);
 }
});

test('new submissions require mapped invitation IDs; exact old committed retries survive cutover',()=>{
 const h=harness();const legacy=valid();saved(h.submit(legacy));h.context.RSVP_REQUIRE_RECIPIENT_=true;saved(h.submit(legacy));rejected(h.submit(valid(2)),/individual invitation/);assert.equal(h.rows().length,2);
 const token='a'.repeat(32);h.properties.set('RSVP_RECIPIENT_'+token,'invitee@example.org');const payload={...valid(3),recipientId:token};saved(h.submit(payload),3);assert.equal(h.rows()[2][13],'invitee@example.org');saved(h.submit(payload),3);assert.equal(h.rows().length,3);
 rejected(h.submit({...valid(4),recipientId:'b'.repeat(32)}),/individual invitation/);rejected(h.submit({...valid(4),recipientId:token,responseEmail:'forged@example.org'}),/individual invitation/);rejected(h.submit({...valid(4),recipientId:'bad'}),/individual invitation/);assert.equal(h.rows().length,3);
});
test('new email-only submissions are rejected; committed v3 email envelopes still retry safely',()=>{
 const h=harness();const payload={...valid(),responseEmail:'prior@example.org'};saved(h.submit(payload));h.context.RSVP_REQUIRE_RECIPIENT_=true;saved(h.submit(payload));rejected(h.submit({...valid(2),responseEmail:'new@example.org'}),/individual invitation/);assert.equal(h.rows().length,2);
});
