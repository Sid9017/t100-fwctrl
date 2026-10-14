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
  runInNewContext(await readFile('miniprogram/pages/reports/index.js','utf8'),{Page:d=>definition=d,require:path=>path.endsWith('report-motion')?motionModule.exports:path.includes('utils')?{ensurePlan:()=>true,isPreview:()=>false,store:()=>journal,recordRows:r=>r,route:(...args)=>routes.push(args)}:{dayKey:date=>date?dayKey(date):'2026-10-14',weekSummary}});
  const p={...definition,data:structuredClone(definition.data),setData:(patch,done)=>{Object.assign(p.data,patch);done?.();},createSelectorQuery:()=>({select(){return this;},boundingClientRect(){return this;},exec(fn){fn([{height:p.data.renderedView==='week'?400:520}]);}})};p.onLoad({});p.refresh();return {p,routes,advance};
}
test('weekly date selection updates the shared day cards without moving the chart range',async()=>{
  const {p}=await fixture();assert.equal(p.data.view,'week');const dates=p.data.week.days.map(d=>d.date);
  p.selectDay({currentTarget:{dataset:{date:'2026-10-12'}}});assert.equal(p.data.view,'week');assert.equal(p.data.summary.consumed,250);assert.equal(p.data.records[0].name,'Toast');assert.deepEqual(p.data.week.days.map(d=>d.date),dates);
  p.view({currentTarget:{dataset:{view:'day'}}});assert.equal(p.data.view,'week');
});
test('calendar selection remains in Month and neither view offers a new-record action',async()=>{
  const {p,routes}=await fixture();p.view({currentTarget:{dataset:{view:'month'}}});p.selectDay({currentTarget:{dataset:{date:'2026-10-12'}}});assert.equal(p.data.view,'month');assert.equal(p.data.calendar.find(d=>d.selected).date,'2026-10-12');assert.equal(p.data.summary.consumed,250);
  assert.equal(typeof p.addMeal,'undefined');assert.equal(routes.length,0);p.selectDay({currentTarget:{dataset:{date:'2026-10-15'}}});assert.equal(p.data.date,'2026-10-12');
  p.view({currentTarget:{dataset:{view:'week'}}});assert.equal(p.data.week.days.at(-1).date,'2026-10-12');
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
test('period switches collapse before replacing content and expand before returning to auto height',async()=>{
  const {p,advance}=await fixture();p.view({currentTarget:{dataset:{view:'month'}}});
  assert.equal(p.data.view,'month');assert.equal(p.data.renderedView,'week');assert.equal(p.data.periodHeight,'400px');
  advance(32);assert.equal(p.data.periodPhase,'closing');assert.equal(p.data.periodHeight,'0px');
  advance(180);assert.equal(p.data.renderedView,'month');assert.equal(p.data.periodPhase,'swapping');
  advance(32);assert.equal(p.data.periodHeight,'520px');assert.equal(p.data.periodPhase,'opening');
  advance(280);assert.equal(p.data.periodHeight,'auto');assert.equal(p.data.periodPhase,'');
  p.view({currentTarget:{dataset:{view:'week'}}});advance(50);p.view({currentTarget:{dataset:{view:'month'}}});advance(1000);assert.equal(p.data.renderedView,'month');assert.equal(p.data.periodHeight,'auto');
});
