const {ACTIVITY,estimatePlan}=require('../../lib/t100');
const {route,errorText,isPreview,store}=require('../../utils/page');
const defaults={age:'',height:'',weight:'',bodyFat:'',sex:'',activity:0,goal:'maintain',goalWeight:'',months:'6',target:'',tdeeSource:'estimate',tdee:'',carbs:'50',protein:'25',fat:'25',fiber:'30'};
const {currentTheme}=require('../../utils/page');
Page({
  data:{themeProfile:3,preview:false,isDevtools:false,previewPages:['Home','Home · no device','Home · pairing','My device','Meal record','Reports'],step:0,progress:25,editing:false,activity:ACTIVITY.map(a=>a.label),sexes:[{value:'female',label:'Female'},{value:'male',label:'Male'},{value:'private',label:'Prefer not to say'}],goals:[{value:'lose',label:'Lose weight',detail:'A lighter everyday routine'},{value:'maintain',label:'Maintain',detail:'Find a steady balance'},{value:'gain',label:'Gain weight',detail:'Build toward your goal'}],form:{...defaults},plan:null,error:'',loading:false},
  onLoad(options){this.preview=isPreview(options);this.journal=store(this.preview);const saved=this.journal.data.profile,draft=this.preview?null:wx.getStorageSync('kcalack.plan-draft.v1');this.setData({preview:this.preview,isDevtools:!!getApp().isDevtools,editing:!!saved,form:{...defaults,...(saved||draft||{})}});},
  onShow(){this.unsubscribe?.();this.unsubscribe=(this.preview?getApp().getPreviewService():getApp().service)?.onChange(s=>this.setData({themeProfile:currentTheme(s)}));},onHide(){this.unsubscribe?.();},onUnload(){this.unsubscribe?.();},
  previewPage(e){const i=Number(e.detail.value);if(i===2)route('index',true,'intro=1');else if(i===1)route('index',true,'device=none');else route(['index',null,null,'devices','record','reports'][i],true);},
  onField(e){this.setData({['form.'+e.currentTarget.dataset.field]:e.detail.value,...(e.currentTarget.dataset.field==='tdee'?{'form.tdeeSource':'manual'}:{}),error:''});this.saveDraft();},
  select(e){this.setData({['form.'+e.currentTarget.dataset.field]:e.currentTarget.dataset.value,error:''});this.saveDraft();},
  onActivity(e){this.setData({'form.activity':Number(e.detail.value)});this.saveDraft();},
  saveDraft(){if(this.preview)return;try{wx.setStorageSync('kcalack.plan-draft.v1',this.data.form);}catch{this.setData({error:'Your draft could not be saved.'});}},
  back(){if(this.data.step>0)this.setData({step:this.data.step-1,progress:this.data.step*25,error:''});},
  next(){try{const f=this.data.form;if(this.data.step===0&&(!f.sex||!f.age))throw new Error('Choose your sex and enter your age.');if(this.data.step===1&&(!f.height||!f.weight))throw new Error('Enter your height and weight.');if(this.data.step===2){const plan=estimatePlan(f);this.setData({plan,'form.tdee':String(plan.tdee),'form.target':String(plan.target)});}this.setData({step:Math.min(3,this.data.step+1),progress:Math.min(100,(this.data.step+2)*25),error:''});this.saveDraft();}catch(e){this.setData({error:errorText(e)});}},
  recalculate(){try{const plan=estimatePlan(this.data.form);this.setData({plan,error:''});}catch(e){this.setData({error:errorText(e)});}},
  save(){if(this.data.loading)return;this.setData({loading:true,error:''});try{this.journal.saveProfile(this.data.form);if(!this.preview)wx.removeStorageSync('kcalack.plan-draft.v1');if(getCurrentPages().length>1)wx.navigateBack();else wx.reLaunch({url:'/pages/index/index'});}catch(e){this.setData({error:errorText(e)});}finally{this.setData({loading:false});}}
});
