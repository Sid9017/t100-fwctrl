import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {JournalStore,dayKey,weekSummary} from '../src/miniprogram/journal.js';
async function fixture(){
  const journal=new JournalStore(null,{memory:true});journal.data.records=[{id:'A',date:'2026-10-14',time:'12:00',meal:'Lunch',name:'Rice',kcal:400,photos:[]},{id:'B',date:'2026-10-12',time:'08:00',meal:'Breakfast',name:'Toast',kcal:250,photos:[]}];
  let definition;const routes=[];let now=0,seq=0;const timers=new Map();
  const motionModule={exports:{}};
  runInNewContext(await readFile('miniprogram/utils/report-motion.js','utf8'),{module:motionModule,setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)});
  const advance=ms=>{const end=now+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;};
  const ringsModule={exports:{}};runInNewContext(await readFile('miniprogram/utils/nutrition-rings.js','utf8'),{module:ringsModule,Uint8Array,wx:{arrayBufferToBase64:b=>Buffer.from(b).toString('base64')}});
  runInNewContext(await readFile('miniprogram/pages/reports/index.js','utf8'),{Page:d=>definition=d,require:path=>path.endsWith('report-motion')?motionModule.exports:path.endsWith('nutrition-rings')?ringsModule.exports:path.includes('utils')?{ensurePlan:()=>true,isPreview:()=>false,store:()=>journal,recordRows:r=>r,route:(...args)=>routes.push(args)}:{dayKey:date=>date?dayKey(date):'2026-10-14',weekSummary}});
  const p={...definition,data:structuredClone(definition.data),setData:(patch,done)=>{Object.assign(p.data,patch);done?.();},createSelectorQuery:()=>({select(){return this;},boundingClientRect(){return this;},exec(fn){fn([{height:300}]);}})};p.onLoad({});p.refresh();return {p,journal,routes,advance};
}
test('month calendar opens the selected Sunday-to-Saturday row and keeps daily data independent',async()=>{
 const {p,advance}=await fixture();assert.equal(p.data.expandedRow,-1);assert.equal(p.data.monthStats.total,650);
 p.selectCalendarDay({currentTarget:{dataset:{date:'2026-10-12',row:2}}});
 assert.equal(p.data.summary.consumed,250);assert.equal(p.data.records[0].name,'Toast');assert.equal(p.data.expandedRow,2);
 assert.equal(p.data.week.days[0].date,'2026-10-11');assert.equal(p.data.week.days[6].date,'2026-10-17');
 advance(312);assert.equal(p.data.weekHeight,'auto');
 p.selectDay({currentTarget:{dataset:{date:'2026-10-14'}}});assert.equal(p.data.summary.consumed,400);assert.equal(p.data.expandedRow,2);
 p.selectCalendarDay({currentTarget:{dataset:{date:'2026-10-15',row:2}}});assert.equal(p.data.date,'2026-10-14');
 assert.equal(typeof p.addMeal,'undefined');
});
test('every date previews its calorie progress and month navigation clears the expanded row',async()=>{
 const {p,routes,advance}=await fixture();assert.equal(p.data.calendarRows.length,5);
 for(const day of p.data.calendar.filter(d=>!d.blank)){
  const svg=Buffer.from(day.preview.split(',')[1],'base64').toString();assert.equal((svg.match(/<circle/g)||[]).length,day.selected?3:2);assert.match(svg,/stroke="#f0f4e5" stroke-width="24"/);assert.match(svg,/<circle cx="48" cy="14" r="12" fill="#a4ff00" data-start-marker="true"/);
 }
 p.selectWeek({currentTarget:{dataset:{row:0}}});advance(312);
 assert.equal(p.data.week.days[0].date,'2026-09-27');assert.equal(p.data.week.days[6].date,'2026-10-03');
 p.changeMonth({currentTarget:{dataset:{delta:-1}}});advance(1000);
 assert.equal(p.data.month,'2026-09');assert.equal(p.data.expandedRow,-1);assert.equal(p.data.monthStats.total,0);assert.equal(p.data.monthStats.average,0);assert.equal(routes.length,0);
});

test('report mode wheel accepts four categories without changing the selected reporting date',async()=>{
  const {p,routes}=await fixture();const date=p.data.date;
  assert.deepEqual(Array.from(p.data.reportModes,m=>m.id),['kcal','kitchen','espresso','pourover']);
  for(const index of [1,2,3,0]){p.changeReportMode({detail:{value:[index]}});assert.equal(p.data.reportModeIndex,index);assert.equal(p.data.date,date);}
  for(const index of [-1,4,1.5])p.changeReportMode({detail:{value:[index]}});
  assert.equal(p.data.reportModeIndex,0);assert.equal(routes.length,0);
});


test('mode fade swaps content only after exit and latest selection wins',async()=>{
  const {p,advance}=await fixture();p.changeReportMode({detail:{value:[1]}});
  assert.equal(p.data.displayedModeIndex,0);assert.equal(p.data.modePhase,'leaving');
  advance(100);p.changeReportMode({detail:{value:[3]}});advance(159);assert.equal(p.data.displayedModeIndex,0);
  advance(1);assert.equal(p.data.displayedModeIndex,3);advance(272);assert.equal(p.data.modePhase,'');
  p.changeReportMode({detail:{value:[0]}});p.onHide();advance(1000);assert.equal(p.data.displayedModeIndex,0);assert.equal(p.data.modePhase,'');assert.equal(p.motionTimers.size,0);
});
test('inline week expands, collapses on outside tap and only the latest requested row survives',async()=>{
 const {p,advance}=await fixture();p.selectWeek({currentTarget:{dataset:{row:2}}});
 assert.equal(p.data.weekHeight,'0px');assert.equal(p.data.weekPhase,'prepared');
 advance(32);assert.equal(p.data.weekHeight,'300px');assert.equal(p.data.weekPhase,'opening');
 advance(280);assert.equal(p.data.weekHeight,'auto');assert.equal(p.data.weekPhase,'');
 p.collapseWeek();advance(16);assert.equal(p.data.weekHeight,'0px');advance(180);assert.equal(p.data.expandedRow,-1);
 p.selectWeek({currentTarget:{dataset:{row:0}}});advance(80);p.selectWeek({currentTarget:{dataset:{row:1}}});advance(30);p.selectWeek({currentTarget:{dataset:{row:2}}});advance(1000);
 assert.equal(p.data.expandedRow,2);assert.equal(p.data.week.days[0].date,'2026-10-11');assert.equal(p.data.weekHeight,'auto');
 p.collapseWeek();p.onHide();advance(1000);assert.equal(p.data.expandedRow,-1);assert.equal(p.motionTimers.size,0);
});

test('date ring previews use daily calorie progress and cap at a complete ring',async()=>{
 const {p,journal}=await fixture();
 journal.data.plans=[{date:'2026-10-01',target:800,tdee:1000,profile:{target:800,carbs:50,protein:25,fat:25,fiber:30}}];
 journal.data.records[0].carbs=100;journal.data.records[1].carbs=25;p.refresh();
 const a=p.data.calendar.find(d=>d.date==='2026-10-12'),b=p.data.calendar.find(d=>d.date==='2026-10-14');
 assert.notEqual(a.preview,b.preview);
 const svg=Buffer.from(a.preview.split(',')[1],'base64').toString();assert.match(svg,/stroke="#a4ff00"/);assert.match(svg,/stroke-dasharray=/);
 assert.equal((svg.match(/<circle/g)||[]).length,2);
 const progress=Number(svg.match(/stroke-dasharray="([0-9.]+)/)[1]);
 assert.ok(Math.abs(progress/(2*Math.PI*34)-250/800)<1e-8);
 journal.data.records[0].kcal=1600;p.refresh();
 const full=Buffer.from(p.data.calendar.find(d=>d.date==='2026-10-14').preview.split(',')[1],'base64').toString();
 const values=full.match(/stroke-dasharray="([0-9.]+) ([0-9.]+)/);assert.equal(values[1],values[2]);
});

test('weekly comparison uses a shared rounded scale and keeps targets visible without records',async()=>{
 const {p,journal,advance}=await fixture();
 journal.data.plans=[{date:'2026-10-01',target:2000,tdee:2200,profile:{target:2000,carbs:50,protein:25,fat:25,fiber:30}}];
 journal.data.records[0].kcal=3500;p.refresh();p.openWeek(2);advance(312);
 const week=p.data.week,top=week.axis.at(-1).value;
 assert.ok(top>=3500);assert.equal(week.axis[0].value,0);
 const actual=week.days.find(d=>d.date==='2026-10-14');assert.equal(actual.height,3500/top*100);assert.equal(actual.targetHeight,2000/top*100);
 const empty=week.days.find(d=>d.date==='2026-10-13');assert.equal(empty.height,0);assert.ok(empty.targetHeight>0);
 p.openWeek(0);advance(1000);
 assert.equal(p.data.week.days[0].targetHeight,null);assert.ok(p.data.week.days.at(-1).targetHeight>0);
});
