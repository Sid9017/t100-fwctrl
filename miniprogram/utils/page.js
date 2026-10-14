const {dayKey}=require('../lib/t100');
const isPreview=options=>options?.preview==='1'&&getApp().isDevtools;
const store=preview=>getApp().journalFor(preview);
const ensurePlan=(preview=false)=>{const app=getApp();if((preview&&app.isDevtools)||app.journal?.data?.profile)return true;wx.reLaunch({url:'/pages/plan/index?required=1'});return false;};
const route=(page,preview=false,query='')=>{if(page!=='plan'&&!ensurePlan(preview))return;return wx.navigateTo({url:`/pages/${page}/index${preview||query?'?':''}${preview?'preview=1':''}${preview&&query?'&':''}${query}`});};
const errorText=error=>String(error?.message||error?.errMsg||error).replace(/T100/gi,'KCALACK');
function update(patch){this.setData(patch);}
function recordRows(rows){return rows.map(r=>({...r,mealLabel:r.meal,timeLabel:r.time,photo:r.photos?.[0]||'',macroKnown:['carbs','protein','fat','fiber'].every(k=>r[k]!==null)}));}
const currentTheme=state=>state?.lastWeighingState?.profile??state?.status?.coffee?.profile??state?.reading?.profile??state?.knownDevices?.[0]?.lastWeighing?.profile??3;
module.exports={ensurePlan,currentTheme,isPreview,store,route,errorText,dayKey,update,recordRows};
