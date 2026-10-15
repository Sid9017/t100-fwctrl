// Wire contract shared by the plan form and the local cache. Formula results belong to the API.
const activities=['SEDENTARY','LIGHT','MODERATE','VERY_ACTIVE'];
const genders={female:'FEMALE',male:'MALE',private:'UNDISCLOSED'};
function number(value,label,min,max,integer=false){
 if(value==null||String(value).trim()==='')throw new Error(`${label} is required.`);
 const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error(`${label} must be ${min}–${max}${integer?' (whole numbers)':''}.`);return n;
}
export function profileRequest(form,{overrides=false}={}){
 if(overrides){
  const body={targetKcal:number(form.target,'Daily target',100,9999,true),carbPct:number(form.carbs,'Carbs',0,100,true),proteinPct:number(form.protein,'Protein',0,100,true),fatPct:number(form.fat,'Fat',0,100,true),fiberG:number(form.fiber,'Fiber',25,140)};
  if(body.carbPct+body.proteinPct+body.fatPct!==100)throw new Error('Nutrition percentages must total 100%.');return body;
 }
 const birthday=String(form.birthday||''),date=new Date(birthday+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==birthday||date>Date.now())throw new Error('Choose a valid birthday.');
 if(!genders[form.sex])throw new Error('Choose your sex.');
 if(!activities[form.activity])throw new Error('Choose an activity level.');
 if(!['lose','maintain','gain'].includes(form.goal))throw new Error('Choose a goal.');
 const body={birthday,gender:genders[form.sex],heightCm:number(form.height,'Height',60,250,true),weightKg:number(form.weight,'Weight',20,300),activityLevel:activities[form.activity],weightGoal:form.goal.toUpperCase(),language:'en'};
 if(String(form.bodyFat??'').trim())body.bodyFatPct=number(form.bodyFat,'Body fat',3,36);
 if(form.goal!=='maintain'){
  body.targetWeightKg=number(form.goalWeight,'Goal weight',20,300);
  const delta=body.targetWeightKg-body.weightKg;
  if((form.goal==='lose'?delta>=0:delta<=0)||Math.abs(delta)>body.weightKg*.15+1e-9)throw new Error('Goal weight must match your goal and stay within 15% of your current weight.');
  body.paceKgPerWeek=number(form.paceKgPerWeek,'Weekly change',.1,form.goal==='gain'?.5:1);
 }
 return body;
}
export function serverProfile(response){
 const n=response?.nutrition,p=response?.plan;
 if(!n||!p||!response.id)throw new Error('The server has not returned a complete plan.');
 const form={birthday:response.birthday??'',sex:Object.keys(genders).find(k=>genders[k]===response.gender),height:n.heightCm,weight:n.weightKg,bodyFat:n.bodyFatPct??'',activity:activities.indexOf(n.activityLevel),goal:n.weightGoal?.toLowerCase(),goalWeight:n.targetWeightKg??'',paceKgPerWeek:n.paceKgPerWeek??'',carbs:n.carbPct??50,protein:n.proteinPct??25,fat:n.fatPct??25,fiber:p.fiberG,target:p.targetKcal,tdee:p.tdeeKcal};
 profileRequest(form,{overrides:true});
 const nutrientTargets={};for(const key of ['carbs','protein','fat','fiber'])nutrientTargets[key]=number(p[key+'G'],key,0,99999);
 return validateCachedProfile({...form,source:'server',ownerId:response.id,tdeeSource:'server',method:'Server plan',nutrientTargets,serverPlan:{...p},updatedAt:Date.now()});
}
export function validateCachedProfile(profile){
 profileRequest(profile,{overrides:true});number(profile.tdee,'TDEE',0,99999);
 number(profile.height,'Height',60,250,true);number(profile.weight,'Weight',20,300);
 if(!genders[profile.sex]||!activities[profile.activity]||!['lose','maintain','gain'].includes(profile.goal))throw new Error('Incomplete server profile.');
 for(const key of ['carbs','protein','fat','fiber'])number(profile.nutrientTargets?.[key],key,0,99999);
 if(!profile.ownerId)throw new Error('Missing plan owner.');return {...profile};
}
