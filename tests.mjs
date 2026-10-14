import assert from 'node:assert/strict';
import {validateAnswer,emptyAnswer,sampleSessions} from './lib/survey.ts';
let count=0;function test(name,fn){fn();count++;console.log('PASS',name)}
const good={...emptyAnswer,experience:'Regularly',availability:['session-a']};
test('valid named session',()=>assert.equal(validateAnswer(good,sampleSessions).availability[0],'session-a'));
test('reject both dates because sessions are identical',()=>assert.throws(()=>validateAnswer({...good,availability:['session-a','session-b']},sampleSessions),/Choose one session/));
test('reject forged session',()=>assert.throws(()=>validateAnswer({...good,availability:['x']},sampleSessions)));
test('reject exclusive combination',()=>assert.throws(()=>validateAnswer({...good,availability:['neither','session-a']},sampleSessions)));
test('require availability',()=>assert.throws(()=>validateAnswer({...good,availability:[]},sampleSessions)));
test('allow cannot commit',()=>assert.equal(validateAnswer({...good,availability:['updates']},sampleSessions).availability[0],'updates'));
test('reject missing experience',()=>assert.throws(()=>validateAnswer({...good,experience:''},sampleSessions)));
test('reject oversized text',()=>assert.throws(()=>validateAnswer({...good,question:'a'.repeat(3001)},sampleSessions)));
test('reject unknown tool',()=>assert.throws(()=>validateAnswer({...good,tools:['forged']},sampleSessions)));
test('limit two perspectives',()=>assert.throws(()=>validateAnswer({...good,beliefs:['A useful thinking partner','Mostly a better search engine','A fad']},sampleSessions)));
test('clear stale beginner choices',()=>assert.deepEqual(validateAnswer({...good,experience:'Not yet',tools:['ChatGPT'],uses:['Emails & writing']},sampleSessions).tools,[]));
test('exclusive hesitation',()=>assert.throws(()=>validateAnswer({...good,blockers:['Nothing in particular','Student privacy']},sampleSessions)));
test('duplicate selections',()=>assert.throws(()=>validateAnswer({...good,tools:['Claude','Claude']},sampleSessions)));
test('discard extra fields',()=>assert.equal('email' in validateAnswer({...good,email:'ignored'},sampleSessions),false));
test('trim written content',()=>assert.equal(validateAnswer({...good,question:' hi '},sampleSessions).question,'hi'));
test('both approved dates and times are present',()=>assert.deepEqual(sampleSessions,[{id:'session-a',label:'Tuesday, November 3, 2026',detail:'3:30–4:30 p.m. Pacific (PST)'},{id:'session-b',label:'Thursday, November 5, 2026',detail:'3:30–4:30 p.m. Pacific (PST)'}]));
test('either session can be selected on its own',()=>assert.equal(validateAnswer({...good,availability:['session-b']},sampleSessions).availability[0],'session-b'));
test('dates are Tuesday and Thursday in Pacific standard time',()=>{for(const [day,weekday] of [['03','Tuesday'],['05','Thursday']]){const date=new Date(`2026-11-${day}T15:30:00-08:00`);assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',weekday:'long'}).format(date),weekday);assert.match(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',timeZoneName:'shortOffset'}).format(date),/3:30 PM GMT-8/);}});
console.log(`${count} tests passed`);

