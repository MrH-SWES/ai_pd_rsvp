export const groups = {
 tools: [ ['Everyday assistants','ChatGPT','Claude','Gemini','Microsoft Copilot'], ['Teaching & creating','MagicSchool','Brisk','Canva AI','Other teaching tools'], ['Also','Something else','I don’t remember'] ],
 uses: [ ['In the classroom','Lesson planning','Worksheets & activities','Adapting reading materials','Feedback & assessment'], ['Around the edges','Emails & writing','Summarizing information','Organizing & admin'], ['Outside school','Answering questions','Personal projects','Images & creative work','Something else'] ],
 beliefs: [['Choose up to two','A useful thinking partner','Mostly a better search engine','Promising, but overhyped','A fad','Potentially harmful','I’m still figuring it out']],
 blockers: [['Choose any that fit','Accuracy & trust','Student privacy','Bias & fairness','Student learning','School policy','Time to learn','Cost or access','Where to start','Something else','Nothing in particular']]
};
export const experiences = ['Regularly','A few times','Once or twice','Not yet','Not sure'];
export type Answer = { experience:string; tools:string[]; uses:string[]; beliefs:string[]; blockers:string[]; example:string; question:string; availability:string[] };
export const emptyAnswer:Answer={experience:'',tools:[],uses:[],beliefs:[],blockers:[],example:'',question:'',availability:[]};
export type Session={id:string;label:string;detail:string};
export const sampleSessions:Session[]=[{id:'session-a',label:'Tuesday, November 3, 2026',detail:'3:30–4:30 p.m. Pacific (PST)'}, {id:'session-b',label:'Thursday, November 5, 2026',detail:'3:30–4:30 p.m. Pacific (PST)'}];
export function validateAnswer(v:unknown,sessions:Session[]):Answer {
 if(!v||typeof v!=='object')throw Error('Please review your answers.');
 const a=v as Answer;if(!experiences.includes(a.experience))throw Error('Choose an experience option.');
 for(const k of ['tools','uses','beliefs','blockers'] as const){const allowed=groups[k].flatMap(g=>g.slice(1));if(!Array.isArray(a[k])||a[k].some(x=>!allowed.includes(x))||new Set(a[k]).size!==a[k].length)throw Error('Invalid selection.');}
 if(a.beliefs.length>2)throw Error('Choose up to two perspectives.');
 if(a.tools.includes('I don’t remember')&&a.tools.length>1)throw Error('Choose named tools or “I don’t remember”.');
 if(a.blockers.includes('Nothing in particular')&&a.blockers.length>1)throw Error('Check your hesitation choices.');
 if(typeof a.example!=='string'||a.example.length>500||typeof a.question!=='string'||a.question.length>3000)throw Error('Please shorten your written response.');
 const ids=[...sessions.map(s=>s.id),'neither','updates'];
 if(!Array.isArray(a.availability)||!a.availability.length||a.availability.some(x=>!ids.includes(x))||new Set(a.availability).size!==a.availability.length)throw Error('Choose a session or another availability option.');
 if(a.availability.length>1)throw Error('Choose one session or one other availability option.');
 return {experience:a.experience,tools:a.experience==='Not yet'?[]:a.tools,uses:a.experience==='Not yet'?[]:a.uses,beliefs:a.beliefs,blockers:a.blockers,example:a.example.trim(),question:a.question.trim(),availability:a.availability};
}

