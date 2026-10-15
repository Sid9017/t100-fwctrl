// Photos remain the meal's ordered device images; each photo owns its editable dish.
function dishesFor(record){
 const existing=record.dishes||[];
 return (record.photos||[]).map((photo,index)=>existing.find(d=>d.photo===photo)||{
  photo,name:'',weight:!record.dishes&&index===0?record.weight??'':'',kcal:!record.dishes&&index===0?record.kcal??'':'',...Object.fromEntries(['carbs','protein','fat','fiber'].map(key=>[key,!record.dishes&&index===0?record[key]??null:null])),container:null,completed:false
 });
}
function totals(dishes){
 const total=key=>dishes.length&&dishes.every(d=>d[key]!==''&&d[key]!==null&&d[key]!==undefined)?Math.round(dishes.reduce((sum,d)=>sum+Number(d[key]),0)*10)/10:null;
 return Object.fromEntries(['weight','kcal','carbs','protein','fat','fiber'].map(key=>[key,total(key)]));
}
function grossGrams(state){
 const r=state?.reading;
 if(!state?.connected||state.adding||!r||!Number.isFinite(r.value)||r.overload||(r.version>=2&&!r.mainValid))return null;
 // Auxiliary weights are always milligrams, even when the main display is ounces.
 if(r.version>=2){
  if(![0,3].includes(r.profile))return null;
  if(r.profile===3&&r.lower?.kind===2&&r.lower.valid&&Number.isFinite(r.lower.value))return r.lower.value/1000;
  if(r.profile===3&&r.upper?.kind===1&&r.upper.valid&&Number.isFinite(r.upper.value))return (r.unit===1?r.value*.28349523125:r.value/1000)+r.upper.value/1000;
 }
 return r.unit===1?r.value*.28349523125:r.value/1000;
}
module.exports={dishesFor,totals,grossGrams};
