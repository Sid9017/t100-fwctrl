const {ACTIVITY,profileRequest,serverProfile,dayKey}=require('../../lib/t100');
const {route,errorText,isPreview,store}=require('../../utils/page');
const defaults={birthday:'',height:'',weight:'',bodyFat:'',sex:'',activity:0,goal:'maintain',goalWeight:'',paceKgPerWeek:'0.5',target:'',tdeeSource:'estimate',tdee:'',carbs:'50',protein:'25',fat:'25',fiber:'30'};
const {currentTheme}=require('../../utils/page');
// A missing birthday starts exactly 30 calendar years before today; saved dates win.
function birthdayWheel(birthday,today,parts){
  const [currentYear,currentMonth,currentDay]=today.split('-').map(Number);
  let [year,month,day]=parts||(/^\d{4}-\d{2}-\d{2}$/.test(birthday||'')?birthday.split('-').map(Number):[currentYear-30,currentMonth,currentDay]);
  year=Math.min(year,currentYear);
  const years=Array.from({length:currentYear-Math.min(1900,year)+1},(_,i)=>currentYear-i);
  const maxMonth=year===currentYear?currentMonth:12;month=Math.max(1,Math.min(month,maxMonth));
  const leapYear=year,leap=leapYear%4===0&&(leapYear%100!==0||leapYear%400===0);
  let maxDay=month?[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]:31;
  if(year===currentYear&&month===currentMonth)maxDay=Math.min(maxDay,currentDay);
  day=Math.max(1,Math.min(day,maxDay));
  const months=Array.from({length:maxMonth},(_,i)=>i+1),days=Array.from({length:maxDay},(_,i)=>i+1);
  return {birthdayYears:years,birthdayMonths:months,birthdayDays:days,birthdayIndices:[years.indexOf(year),months.indexOf(month),days.indexOf(day)],birthdayValue:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
}
function birthdayForm(form,today){
  const wheel=birthdayWheel(form?.birthday,today);
  return {...wheel,form:{...defaults,...(form||{}),birthday:wheel.birthdayValue}};
}
Page({
  data:{birthdayMonthLabels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],...birthdayWheel('',dayKey()),restoring:false,restoreError:'',today:dayKey(),themeProfile:3,preview:false,isDevtools:false,previewPages:['Home','Home · no device','Home · pairing','My device','Meal record','Reports'],step:0,progress:25,editing:false,activity:ACTIVITY.map(a=>a.label),sexes:[{value:'female',label:'Female'},{value:'male',label:'Male'},{value:'private',label:'Prefer not to say'}],goals:[{value:'lose',label:'Lose weight',detail:'A lighter everyday routine'},{value:'maintain',label:'Maintain',detail:'Find a steady balance'},{value:'gain',label:'Gain weight',detail:'Build toward your goal'}],form:{...defaults},plan:null,error:'',loading:false},
  onLoad(options={}){this.required=options.required==='1';this.preview=isPreview(options);this.journal=store(this.preview);const saved=this.journal.data.profile,draft=this.preview?null:wx.getStorageSync('kcalack.plan-draft.v1:'+this.journal.ownerId);this.setData({preview:this.preview,isDevtools:!!getApp().isDevtools,editing:!!saved,...birthdayForm(saved||draft,dayKey())});if(!this.preview)void this.restore();},
  async restore(){
    this.setData({restoring:true,restoreError:''});
    try{
      const profile=await getApp().cloud.restoreProfile();
      this.formOwner=this.journal.ownerId;
      const key='kcalack.plan-draft.v1:'+getApp().journal.ownerId,draft=wx.getStorageSync(key);
      this.setData({editing:!!profile,...birthdayForm(profile||draft,dayKey())});
      if(this.required&&profile)wx.reLaunch({url:'/pages/index/index'});
    }catch(error){this.setData({restoreError:errorText(error)});}finally{this.setData({restoring:false});}
  },
  onShow(){this.unsubscribe?.();this.unsubscribe=(this.preview?getApp().getPreviewService():getApp().service)?.onChange(s=>this.setData({themeProfile:currentTheme(s)}));},onHide(){this.unsubscribe?.();},onUnload(){this.unsubscribe?.();},
  previewPage(e){const i=Number(e.detail.value);if(i===2)route('index',true,'intro=1');else if(i===1)route('index',true,'device=none');else route(['index',null,null,'devices','record','reports'][i],true);},
  onBirthday(e){
    if(this.data.loading||this.data.restoring||this.data.restoreError)return;
    const indices=e.detail.value,columns=[this.data.birthdayYears,this.data.birthdayMonths,this.data.birthdayDays];
    if(!Array.isArray(indices)||indices.length!==3||indices.some((v,i)=>!Number.isInteger(v)||v<0||v>=columns[i].length))return;
    const wheel=birthdayWheel('',this.data.today,indices.map((v,i)=>columns[i][v]));
    this.setData({...wheel,'form.birthday':wheel.birthdayValue,error:''});this.saveDraft();
  },
  onField(e){if(this.data.loading||this.data.restoring||this.data.restoreError)return;this.setData({['form.'+e.currentTarget.dataset.field]:e.detail.value,error:''});this.saveDraft();},
  select(e){if(this.data.loading||this.data.restoring||this.data.restoreError)return;this.setData({['form.'+e.currentTarget.dataset.field]:e.currentTarget.dataset.value,error:''});this.saveDraft();},
  onActivity(e){if(this.data.loading||this.data.restoring||this.data.restoreError)return;this.setData({'form.activity':Number(e.detail.value)});this.saveDraft();},
  saveDraft(){if(this.preview)return;try{wx.setStorageSync('kcalack.plan-draft.v1:'+this.journal.ownerId,this.data.form);}catch{this.setData({error:'Your draft could not be saved.'});}},
  back(){if(this.data.loading||this.data.restoring||this.data.restoreError)return;if(this.data.step>0)this.setData({step:this.data.step-1,progress:this.data.step*25,error:''});},
  async next(){
    if(this.data.loading||this.data.restoring||this.data.restoreError)return;
    try{
      const f=this.data.form;
      if(this.data.step===0&&(!f.sex||!f.birthday))throw new Error('Choose your sex and birthday.');
      if(this.data.step===1&&(!f.height||!f.weight))throw new Error('Enter your height and weight.');
      if(this.data.step===2){
        const body=profileRequest(f);this.setData({loading:true,error:''});
        const profile=await this.submitProfile({...body,targetKcal:null});
        if(this.preview)this.journal.saveProfile(profile);this.setData({plan:profile,form:{...this.data.form,...profile}});
      }
      this.setData({step:Math.min(3,this.data.step+1),progress:Math.min(100,(this.data.step+2)*25),error:''});this.saveDraft();
    }catch(e){this.setData({error:errorText(e)});}finally{this.setData({loading:false});}
  },
  async submitProfile(body){
    if(this.preview){
      // Isolated visual preview; never use a local formula as a production result.
      const f=this.data.form,target=body.targetKcal??2000;
      return serverProfile({id:'preview',birthday:f.birthday,gender:{female:'FEMALE',male:'MALE',private:'UNDISCLOSED'}[f.sex],nutrition:{heightCm:Number(f.height),weightKg:Number(f.weight),bodyFatPct:f.bodyFat===''?null:Number(f.bodyFat),activityLevel:['SEDENTARY','LIGHT','MODERATE','VERY_ACTIVE'][f.activity],weightGoal:f.goal.toUpperCase(),targetWeightKg:f.goal==='maintain'?null:Number(f.goalWeight),paceKgPerWeek:f.goal==='maintain'?null:Number(f.paceKgPerWeek),carbPct:body.carbPct??50,proteinPct:body.proteinPct??25,fatPct:body.fatPct??25},plan:{tdeeKcal:2200,targetKcal:target,carbsG:Math.round(target*(body.carbPct??50)/400),proteinG:Math.round(target*(body.proteinPct??25)/400),fatG:Math.round(target*(body.fatPct??25)/900),fiberG:body.fiberG??30}});
    }
    const cloud=getApp().cloud;if(!cloud)throw new Error('Food service is unavailable.');
    return cloud.saveProfile(body,this.formOwner);
  },
  async save(){
    if(this.data.loading||this.data.restoring||this.data.restoreError)return;
    this.setData({loading:true,error:''});
    try{
      const profile=await this.submitProfile(profileRequest(this.data.form,{overrides:true}));
      if(this.preview)this.journal.saveProfile(profile);if(!this.preview)wx.removeStorageSync('kcalack.plan-draft.v1:'+this.journal.ownerId);
      if(getCurrentPages().length>1)wx.navigateBack();else wx.reLaunch({url:'/pages/index/index'});
    }catch(e){this.setData({error:errorText(e)});}finally{this.setData({loading:false});}
  }
});
