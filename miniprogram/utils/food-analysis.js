const NUTRIENTS=['carbs','protein','fat','fiber'];
const FIELDS=['kcal',...NUTRIENTS];
const INCOMPLETE_MESSAGE='Some nutrition values are unavailable. Retry the analysis.';
function analysisDetails(result){
 const items=Array.isArray(result.items)?result.items:[];
 const ingredients=items.filter(item=>item&&typeof item.name==='string'&&item.name.trim()).map(item=>item.name.trim()+(typeof item.grams==='number'&&Number.isFinite(item.grams)&&item.grams>=0?' '+Math.round(item.grams*10)/10+' g':'')).join(' · ');
 // Older app versions stored the ingredient list in description. Do not repeat it.
 const description=typeof result.description==='string'?result.description.trim():'';
 return {...result,ingredients:ingredients||(typeof result.ingredients==='string'?result.ingredients:''),description:description===ingredients?'':description};
}
function validateAnalysis(result){
 if(!result||typeof result.name!=='string'||!result.name.trim())throw new Error('Invalid food analysis response.');
 const field=result.nutrition?'nutrition':'per100g',values=result[field];if(!values)throw new Error('Invalid food analysis response.');
 const normalized={};for(const key of FIELDS){const n=values[key];if(n===null&&field==='nutrition'){normalized[key]=null;continue;}if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>(field==='nutrition'?(key==='kcal'?99999:9999):(key==='kcal'?1000:100)))throw new Error('Invalid food analysis response.');normalized[key]=n;}
 return analysisDetails({...result,name:result.name.trim().slice(0,80),[field]:normalized,source:result.source==='mock'?'mock':'service'});
}
function nutritionAtWeight(analysis,weight,manual={}){
 if(!analysis||weight===''||weight===null||!Number.isFinite(Number(weight))||Number(weight)<0)return {};
 const values=analysis.nutrition||analysis.per100g;
 const ratio=analysis.source==='service'?1:analysis.nutrition?(analysis.weightG>0?Number(weight)/analysis.weightG:1):Number(weight)/100;
 return Object.fromEntries(FIELDS.filter(k=>!manual[k]).map(k=>[k,values[k]===null?null:Math.round(values[k]*ratio*(k==='kcal'?1:10))/(k==='kcal'?1:10)]));
}
function fromServer(response,photo){
 const slot=response.record.photos?.find(group=>group.before.key===response.photoKeys[photo])?.before;
 if(!slot||!slot.macro)throw new Error('The server did not return this dish’s nutrition.');
 const items=Array.isArray(slot.items)?slot.items:[];
 return validateAnalysis({name:slot.foodName||'Dish',source:'service',photoId:response.record.photos.find(group=>group.before===slot).photoId,weightQuality:response.record.weightQuality,weightG:slot.intakeWeightG>0?slot.intakeWeightG:slot.weightG>0?slot.weightG:null,
  nutrition:{kcal:slot.calories,carbs:slot.macro.carbG,protein:slot.macro.proteinG,fat:slot.macro.fatG,fiber:slot.macro.fiberG},
  description:typeof slot.description==='string'?slot.description:'',
  items,recordId:response.record.id,mealSuggestion:response.record.suggestion||'',mealSignature:response.signature});
}
function mergeMealResult(record,analysis,activePhoto){
 const dishes=(record.dishes||[]).filter(d=>record.photos.includes(d.photo)).map(d=>{
  const result=analysis.mealDishes?.[d.photo];if(!result||d.photo===activePhoto)return d;
  const weight=d.manual?.weight?Number(d.weight)||0:Number(d.weight)||result.weightG||0;
  return {...d,analysis:result,manual:{weight:!!d.manual?.weight},weight,name:result.name,...nutritionAtWeight(result,weight,{})};
 });
 return {...record,dishes,...(analysis.mealSuggestion?{mealAnalysis:{text:analysis.mealSuggestion,source:analysis.source,signature:analysis.mealSignature||'',recordId:analysis.recordId||''}}:{mealAnalysis:null})};
}
// Only photo order and net weights affect the analysis input. Result fields do not.
function mealInputSignature(record){
 return JSON.stringify((record.photos||[]).map(photo=>[photo,Number(record.dishes?.find(d=>d.photo===photo)?.weight)||0]));
}
function applyMealAnalysis(record,result){
 const {dishesFor,totals}=require('./dish');
 // Validate the entire batch before exposing any result.
 const dishes=dishesFor(record).map(dish=>{
  const analysis=validateAnalysis(result.mealDishes?.[dish.photo]);
  const weight=Number(dish.weight)||(!dish.manual?.weight?analysis.weightG:0)||0;
  return {...dish,weight,name:analysis.name,analysis,manual:{weight:!!dish.manual?.weight},completed:true,...nutritionAtWeight(analysis,weight)};
 });
 const next={...record,dishes,...totals(dishes)};
 return {...next,analysisSignature:mealInputSignature(next),mealAnalysis:result.mealSuggestion?{text:result.mealSuggestion,source:result.source,signature:result.mealSignature||'',recordId:result.recordId||''}:null};
}
async function analyzeMeal({record,preview=false,cancelled=()=>false,onPhase=()=>{},correction}){
 if(!record?.photos?.length||record.photos.length>5)throw new Error('Choose 1–5 dish photos.');
 const snapshot=JSON.parse(JSON.stringify(record));
 if(preview){
  onPhase('Calculating…');await new Promise(resolve=>setTimeout(resolve,800));
  if(cancelled())throw new Error('Analysis cancelled.');
  return {source:'mock',mealSuggestion:'Preview only. Meal analysis from the server will appear here.',mealDishes:Object.fromEntries(snapshot.photos.map((photo,index)=>[photo,validateAnalysis({name:'Preview dish '+(index+1),source:'mock',description:'Preview only.',items:[{name:'Rice',grams:100},{name:'Vegetables',grams:80}],weightG:180,per100g:{kcal:160,carbs:18,protein:9,fat:5,fiber:2.4}})]))};
 }
 const app=getApp();if(!app.cloud)throw new Error('Sign in before calculating.');
 const response=await app.cloud.analyze(snapshot,{cancelled,onPhase,...(correction?{correction}:{})});
 return {source:'service',recordId:response.record.id,mealSuggestion:response.record.suggestion||'',mealSignature:response.signature,mealDishes:Object.fromEntries(snapshot.photos.map(photo=>[photo,{...fromServer(response,photo),inputWeight:Number(snapshot.dishes?.find(d=>d.photo===photo)?.weight)||0}]))};
}
// Compatibility for callers that need one selected dish from a complete meal response.
async function analyzeFood({photo,recordId,preview=false,cancelled,onPhase,correction}){
 const record=getApp().journal.data.records.find(r=>r.id===recordId);
 if(!record?.photos.includes(photo))throw new Error('This meal is no longer available.');
 const result=await analyzeMeal({record,preview,cancelled,onPhase,correction:correction?{photo,text:correction}:undefined});
 return {...result.mealDishes[photo],...result};
}
module.exports={analysisDetails,NUTRIENTS,FIELDS,INCOMPLETE_MESSAGE,validateAnalysis,nutritionAtWeight,fromServer,mergeMealResult,mealInputSignature,applyMealAnalysis,analyzeMeal,analyzeFood};
