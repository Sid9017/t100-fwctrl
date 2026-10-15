import {validateCachedProfile} from './profile-contract.js';
// The phone owns full meal records. BLE only receives the compact display record.
export const JOURNAL_KEY='kcalack.journal.v1';
export const MEALS=['Breakfast','Lunch','Dinner','Snack'];
export const ACTIVITY=[{label:'Mostly sitting',factor:1.2},{label:'Lightly active',factor:1.375},{label:'Moderately active',factor:1.55},{label:'Very active',factor:1.725}];
const num=(v,label,min,max,integer=false)=>{if(String(v).trim()==='')throw new Error(`${label} is required`);const n=Number(v);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error(`${label} must be ${min}–${max}`);return n;};
export function dayKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function estimatePlan(form){
  if(form.source==='server')return validateCachedProfile(form);
  const age=num(form.age,'Age',18,100,true),height=num(form.height,'Height',100,250),weight=num(form.weight,'Weight',30,300);
  if(!['female','male','private'].includes(form.sex))throw new Error('Select your sex or keep it private');
  const activity=Number(form.activity);if(!ACTIVITY[activity])throw new Error('Select an activity level');
  const goal=form.goal;if(!['lose','maintain','gain'].includes(goal))throw new Error('Select a goal');
  const bodyFat=String(form.bodyFat??'').trim()?num(form.bodyFat,'Body fat',1,70):null;
  const goalWeight=goal==='maintain'?weight:num(form.goalWeight,'Goal weight',30,300);
  if((goal==='lose'&&goalWeight>=weight)||(goal==='gain'&&goalWeight<=weight))throw new Error('Goal weight does not match your goal');
  const months=goal==='maintain'?null:num(form.months,'Timeline',1,36,true);
  // Mifflin–St Jeor, AJCN 1990;51:241–247. Activity is an editable estimate.
  const ree=form.sex==='private'?null:10*weight+6.25*height-5*age+(form.sex==='male'?5:-161);
  const manualTdee=!!String(form.tdee||'').trim()&&form.tdeeSource!=='estimate';
  const tdee=manualTdee?num(form.tdee,'TDEE',1,9999,true):ree===null?null:Math.round(ree*ACTIVITY[activity].factor);
  if(tdee===null)throw new Error('Enter TDEE when keeping sex private');
  const target=String(form.target||'').trim()?num(form.target,'Daily target',1,9999,true):tdee;
  const carbs=num(form.carbs??50,'Carbohydrate share',0,100),protein=num(form.protein??25,'Protein share',0,100),fat=num(form.fat??25,'Fat share',0,100);
  if(Math.abs(carbs+protein+fat-100)>.001)throw new Error('Nutrition percentages must total 100%');
  return {age,height,weight,sex:form.sex,activity,goal,goalWeight,months,bodyFat,tdee,target,carbs,protein,fat,fiber:num(form.fiber??30,'Fiber target',0,200),tdeeSource:manualTdee?'manual':'estimate',method:manualTdee?'Manual TDEE':'Mifflin-St Jeor estimate',updatedAt:Date.now()};
}
export function validateMeal(input){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id||''))throw new Error('Invalid record ID');
  const name=String(input.name||'').trim();if(!name||name.length>80)throw new Error('Enter a meal name (up to 80 characters)');
  if(!MEALS.includes(input.meal))throw new Error('Select a meal');
  const date=new Date(`${input.date}T${input.time}:00`);if(!Number.isFinite(date.getTime())||dayKey(date)!==input.date||!/^\d{2}:\d{2}$/.test(input.time))throw new Error('Invalid date or time');
  const weight=String(input.weight??'').trim()?num(input.weight,'Weight',0,99999):null;
  const photos=input.photos||[];if(!Array.isArray(photos)||photos.length>5||photos.some(p=>typeof p!=='string'||!p))throw new Error('Choose up to five photos');
  if(input.dishes!==undefined){
    if(!Array.isArray(input.dishes)||input.dishes.length>5)throw new Error('Invalid dishes');
    const seen=new Set();
    for(const dish of input.dishes){
      if(!dish||!photos.includes(dish.photo)||seen.has(dish.photo)||typeof dish.name!=='string'||dish.name.length>80)throw new Error('Invalid dish');
      seen.add(dish.photo);
      for(const key of ['weight','kcal'])if(dish[key]!==null&&dish[key]!==undefined&&dish[key]!=='')num(dish[key],key,0,99999,key==='kcal');
      for(const key of ['carbs','protein','fat','fiber'])if(dish[key]!==null&&dish[key]!==undefined&&dish[key]!=='')num(dish[key],key,0,9999);
      if(dish.container){if(!dish.container.id||typeof dish.container.name!=='string')throw new Error('Invalid container');num(dish.container.grams,'Container weight',.001,1999.9);}
    }
  }
  const macros={};for(const key of ['carbs','protein','fat','fiber'])macros[key]=String(input[key]??'').trim()?num(input[key],key,0,9999):null;
  return {...input,name,weight,kcal:input.autoSaved&&input.kcal===null?null:num(input.kcal,'Calories',0,99999,true),rating:num(input.rating,'Rating',1,5,true),...macros,photos:[...photos],timestampUtc:Math.floor(date.getTime()/1000),notes:String(input.notes||'').slice(0,400),updatedAt:Date.now()};
}
export const mealContent=r=>JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>!['sync','updatedAt'].includes(k)).sort(([a],[b])=>a.localeCompare(b))));
export class JournalStore {
  constructor(api,{memory=false,storageKey=JOURNAL_KEY}={}){this.api=api;this.storageKey=storageKey;this.memory=memory;this.profileRevision=0;this.listeners=new Set();this.data={version:1,profile:null,plans:[],records:[],containers:[]};this.error='';if(!memory&&storageKey){try{const raw=api.getStorageSync(storageKey);if(raw){const data=typeof raw==='string'?JSON.parse(raw):raw;if(data.version!==1||!Array.isArray(data.records)||!Array.isArray(data.containers)||!Array.isArray(data.plans))throw new Error('Invalid journal');for(const r of data.records)validateMeal(r);for(const p of data.plans){if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date))throw new Error('Invalid plan');estimatePlan(p.profile);}if(data.profile)estimatePlan(data.profile);this.data=data;}}catch{this.error='Your saved journal could not be read. It has not been overwritten.';}}}
  commit(next){if(this.error)throw new Error(this.error);if(!this.memory){if(!this.storageKey)throw new Error('Sign in before saving.');this.api.setStorageSync(this.storageKey,JSON.stringify(next));}this.data=next;for(const fn of this.listeners)fn(this.data);}
  switchOwner(ownerId){if(this.ownerId===ownerId)return;const key=JOURNAL_KEY+':'+ownerId,next=new JournalStore(this.api,{storageKey:key});this.ownerId=ownerId;this.storageKey=key;this.data=next.data;this.error=next.error;this.profileRevision++;for(const fn of this.listeners)fn(this.data);}
  clearProfile(){this.profileRevision++;this.commit({...this.data,profile:null,plans:[]});}
  onChange(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  saveProfile(form){if(this.ownerId&&form.source==='server'&&form.ownerId!==this.ownerId)throw new Error('Profile belongs to another account');this.profileRevision++;const profile=estimatePlan(form),date=dayKey();this.commit({...this.data,profile,plans:[...this.data.plans.filter(p=>p.date!==date),{date,target:profile.target,tdee:profile.tdee,profile}].sort((a,b)=>a.date.localeCompare(b.date))});return profile;}
  planFor(date){const plans=this.data.plans.filter(p=>p.date<=date);return plans[plans.length-1]||null;}
  saveMeal(input){const record=validateMeal(input),previous=this.data.records.find(r=>r.id===record.id);
    if(previous){
      record.sync={...previous.sync,...record.sync};
      if(mealContent(previous)!==mealContent(record))record.sync=Object.fromEntries(Object.keys(record.sync).map(id=>[id,'pending']));
    }
    this.commit({...this.data,records:[...this.data.records.filter(r=>r.id!==record.id),record].sort((a,b)=>b.timestampUtc-a.timestampUtc)});return record;}
  removeMeal(id){const record=this.data.records.find(r=>r.id===id),devices=Object.keys(record?.sync||{});this.commit({...this.data,records:this.data.records.filter(r=>r.id!==id),deletions:[...(this.data.deletions||[]),...devices.map(deviceId=>({id,deviceId}))]});}
  forgetDevice(ids){const removed=new Set(ids);this.commit({...this.data,records:this.data.records.map(record=>({...record,sync:Object.fromEntries(Object.entries(record.sync||{}).filter(([id])=>!removed.has(id)))})),deletions:(this.data.deletions||[]).filter(row=>!removed.has(row.deviceId))});}
  clearDeletion(id,deviceId){this.commit({...this.data,deletions:(this.data.deletions||[]).filter(r=>r.id!==id||r.deviceId!==deviceId)});}
  markSync(id,deviceId,state){const record=this.data.records.find(r=>r.id===id);if(record)this.saveMeal({...record,sync:{...(record.sync||{}),[deviceId]:state}});}
  saveContainer(container){if(!container.photo)throw new Error('Add a container photo');if(!this.data.containers.some(c=>c.id===container.id)&&this.data.containers.length>=50)throw new Error('You can save up to 50 containers');const name=String(container.name||'').trim();if(!name||name.length>64)throw new Error('Enter a container name');const grams=num(container.grams,'Container weight',.001,1999);if(!container.id)throw new Error('Missing container ID');this.commit({...this.data,containers:[...this.data.containers.filter(c=>c.id!==container.id),{id:container.id,name,grams,...(typeof container.photo==='string'&&container.photo?{photo:container.photo}:{})}]});}
  removeContainer(id){this.commit({...this.data,containers:this.data.containers.filter(c=>c.id!==id)});}
  summary(date=dayKey()){
    const records=this.data.records.filter(r=>r.date===date),plan=this.planFor(date),target=plan?.target??null,tdee=plan?.tdee??null;
    const calorieRecordCount=records.filter(r=>r.kcal!==null).length,consumed=records.reduce((sum,r)=>sum+(r.kcal??0),0),remaining=target===null?null:target-consumed;
    const nutrients=['carbs','protein','fat','fiber'].map((key,i)=>{const known=records.filter(r=>r[key]!==null&&r[key]!==undefined),total=known.reduce((s,r)=>s+r[key],0),p=plan?.profile,goal=p?(p.nutrientTargets?.[key]??(key==='fiber'?p.fiber:Math.round(p.target*p[key]/100/(key==='fat'?9:4)))):null;return {key,label:['Carbs','Protein','Fat','Fiber'][i],total:Math.round(total*10)/10,goal,partial:known.length!==records.length,progress:goal?Math.min(100,total/goal*100):0};});
    return {date,records,consumed,target,tdee,remaining,progress:target?Math.min(100,consumed/target*100):0,tone:remaining===null||remaining>=0?'normal':consumed<=tdee?'warning':'danger',nutrients,calorieRecordCount,recordCount:records.length};
  }
}
export function weekSummary(store,end=dayKey()){
  const anchor=new Date(`${end}T12:00:00`),days=[];for(let i=6;i>=0;i--){const d=new Date(anchor);d.setDate(d.getDate()-i);const summary=store.summary(dayKey(d));days.push({...summary,label:['S','M','T','W','T','F','S'][d.getDay()],day:d.getDate()});}
  const recorded=days.filter(d=>d.calorieRecordCount),maximum=Math.max(1,...days.map(d=>Math.max(d.consumed,d.target||0)))*1.15;
  return {days:days.map(d=>({...d,height:d.calorieRecordCount?Math.max(2,d.consumed/maximum*100):0,targetHeight:d.target===null?null:d.target/maximum*100})),recordedDays:recorded.length,average:recorded.length?Math.round(recorded.reduce((s,d)=>s+d.consumed,0)/recorded.length):null,total:recorded.reduce((s,d)=>s+d.consumed,0)};
}
