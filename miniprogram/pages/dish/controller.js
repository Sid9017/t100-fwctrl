const {isPreview,ensurePlan,store,currentTheme,errorText}=require('../../utils/page');
const {dishesFor,totals,grossGrams}=require('../../utils/dish');
const {NUTRIENTS,FIELDS,nutritionAtWeight}=require('../../utils/food-analysis');
module.exports={
 data:{preview:false,themeProfile:3,meal:'',photo:'',name:'',weight:0,scaleWeight:0,gross:0,unit:0,overloaded:false,kcal:0,container:null,live:false,connected:false,readingValid:false,grossText:'',error:'',syncing:false,containerEditing:false,refresh:0,ready:false,closeReady:false,carbs:0,protein:0,fat:0,fiber:0},
 onLoad(options={}){
  this.preview=isPreview(options);if(!ensurePlan(this.preview)){this.blocked=true;return;}
  this.journal=store(this.preview);this.journalOwner=this.journal.ownerId;this.service=this.preview?getApp().getPreviewService():getApp().service;
  this.recordId=options.id;const record=this.journal.data.records.find(r=>r.id===this.recordId),index=Number(options.photo);
  const dish=record&&dishesFor(record)[index];if(!dish){this.setData({error:'This dish is no longer available.'});return;}
  this.active=true;this.completed=!!dish.completed;
  this.analysis=!this.preview&&dish.analysis?.source==='mock'?null:dish.analysis||null;
  this.manual={weight:!!dish.manual?.weight};
  this.setData({...Object.fromEntries(NUTRIENTS.map(k=>[k,dish[k]??0])),analysisSource:this.analysis?.source||'',preview:this.preview,meal:record.meal,photo:dish.photo,name:dish.name||'',weight:dish.weight===''?0:dish.weight??0,kcal:dish.kcal===''?0:dish.kcal??0,container:dish.container||null,live:true,ready:true});
  if(this.analysis)this.setData({...nutritionAtWeight(this.analysis,this.data.weight,{}),name:this.analysis.name});
  if(!this.preview&&dish.analysis?.source==='mock')this.setData({...Object.fromEntries(FIELDS.filter(k=>!this.manual[k]).map(k=>[k,0])),...(!this.manual.name?{name:''}:{})});
  this.setData({description:this.analysis?.description||'',scaleWeight:Number(this.data.weight)||0,unit:getApp().unitsFor?.(this.preview)?.state.unit??0});
  this.unsubscribe=this.service?.onChange(s=>this.receiveState(s));
  this.updateCompletion();
 },
 onReady(){},
 onShow(){if(this.blocked||!this.data.ready)return;this.active=true;this.receiveState(this.service?.state);},
 onHide(){this.active=false;clearTimeout(this.saveTimer);this.saveTimer=null;this.saveDraft();},
 onUnload(){this.active=false;clearTimeout(this.saveTimer);this.saveTimer=null;this.saveDraft();this.unloaded=true;this.unsubscribe?.();},
 receiveState(state){
  if(this.unloaded||!this.data.ready)return;
  const gross=grossGrams(state);this.gross=gross;
  this.setData({connected:!!state?.connected,themeProfile:currentTheme(state),readingValid:gross!==null,gross:gross??0,unit:state?.connected?state.reading?.unit??this.data.unit:this.data.unit,overloaded:!!state?.connected&&!!state.reading?.overload,grossText:gross===null?'':gross.toFixed(1)});
  this.updateWeight();
  if(this.active&&this.containerRequestPending&&!this.syncingContainer)void this.syncContainer();
 },
 updateWeight(){
  if(!this.active||!this.data.live||this.data.containerEditing||this.gross===null||this.gross===undefined)return;
  const scaleWeight=Number((this.gross-(this.data.container?.grams||0)).toFixed(1)),weight=Math.max(0,scaleWeight).toFixed(1);
  if(this.data.weight===weight&&this.data.scaleWeight===scaleWeight)return;
  this.setData({weight,scaleWeight,...nutritionAtWeight(this.analysis,weight,this.manual)});
  this.updateCompletion();
  // Save a bounded stream of readings, rather than resetting a debounce on every notify.
  if(!this.saveTimer)this.saveTimer=setTimeout(()=>{this.saveTimer=null;if(this.active&&!this.unloaded)this.saveDraft();},400);
 },
 scaleInput(e){this.field({currentTarget:{dataset:{field:'weight'}},detail:{value:e.detail.value===''?'':String(Math.round(e.detail.value*1000000)/1000000)}});},
 field(e){
  const key=e.currentTarget.dataset.field;if(key!=='weight')return;
  this.manual[key]=true;
  this.setData({[key]:e.detail.value,...(key==='weight'?{live:false,scaleWeight:Number(e.detail.value)||0}:{}),error:''});if(key==='weight')this.setData(nutritionAtWeight(this.analysis,this.data.weight,this.manual));this.updateCompletion();this.saveDraft();
 },
 updateCompletion(){
  const weight=this.data.weight;
  this.setData({closeReady:!!this.data.ready&&weight!==''&&weight!==null&&Number.isFinite(Number(weight))&&Number(weight)>=0&&Number(weight)<=1999});
 },
 resumeLive(){this.setData({live:true,error:''});this.updateWeight();},
 pauseLive(){this.setData({live:false});this.saveDraft();},
 async containerSelected(e){
  const container=e.detail.container||null;
  this.setData({container,error:''});this.updateWeight();this.saveDraft();
  // Local selection drives the draft immediately. Device sync is serialized separately.
  this.containerRequest=container;this.containerRequestPending=true;await this.syncContainer();
 },
 async syncContainer(){
  if(this.syncingContainer)return;
  const s=this.service?.state;if(!s?.connected||!s.hasAuth||!(s.status?.flags&1)||s.busy||currentTheme(s)!==3)return;
  this.syncingContainer=true;this.setData({syncing:true});
  try{
   while(this.containerRequestPending&&this.active){
    const container=this.containerRequest;this.containerRequestPending=false;
    await this.service.setContainer(container?.grams??null,container?.id);
   }
  }catch(error){if(!this.unloaded)this.setData({error:errorText(error)});}
  finally{this.syncingContainer=false;if(!this.unloaded)this.setData({syncing:false});}
 },
 containerEditor(e){this.setData({containerEditing:!!e.detail.open});if(!e.detail.open)this.updateWeight();},
 containerRevealed(){this.setData({refresh:this.data.refresh+1});},
 saveDraft(){
  if(!this.data.ready||this.unloaded||this.finishing||this.discarded)return false;
  if(this.journal.ownerId!==this.journalOwner){this.setData({error:'Your account changed. Reopen this meal.'});return false;}
  const record=this.journal.data.records.find(r=>r.id===this.recordId);if(!record||!record.photos.includes(this.data.photo))return false;
  const weight=this.data.weight,kcal=this.data.kcal;
  if(weight!==''&&(!Number.isFinite(Number(weight))||Number(weight)<0||Number(weight)>1999)){this.setData({error:'Weight must be 0–1999 g.'});return false;}
  if(kcal!==''&&(!Number.isInteger(Number(kcal))||Number(kcal)<0||Number(kcal)>99999)){this.setData({error:'Enter calories from 0 to 99999.'});return false;}
  for(const key of NUTRIENTS){const value=this.data[key];if(value!==''&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>9999)){this.setData({error:'Enter '+key+' from 0 to 9999 g.'});return false;}}
  const previous=dishesFor(record).find(d=>d.photo===this.data.photo)||{};
  const dish={...previous,analysis:this.analysis,manual:{...this.manual},...Object.fromEntries(NUTRIENTS.map(k=>[k,this.data[k]===null||this.data[k]===''||(!this.analysis&&!this.manual[k])?null:Number(this.data[k])])),photo:this.data.photo,name:this.data.name.trim(),weight:weight===''?null:Number(weight),kcal:kcal===null||kcal===''||(!this.analysis&&!this.manual.kcal)?null:Number(kcal),container:this.data.container,completed:this.completed};
  const changed=Number(previous.weight||0)!==Number(dish.weight||0);
  if(changed){this.analysis=null;dish.analysis=null;for(const key of FIELDS)dish[key]=null;}
  const updated=changed?{...record,mealAnalysis:null,analysisSignature:null}:record;
  const dishes=dishesFor(updated).map(item=>item.photo===dish.photo?dish:item);
  try{
   this.journal.saveMeal({...updated,dishes,...totals(dishes),autoSaved:true,sync:Object.fromEntries(Object.keys(record.sync||{}).map(id=>[id,'pending']))});
   return true;
  }catch(error){this.setData({error:errorText(error)});return false;}
 },
 previewPhoto(){wx.previewImage({current:this.data.photo,urls:[this.data.photo]});},
 finishClose(){
  this.finishing=true;this.active=false;this.setData({live:false});clearTimeout(this.saveTimer);wx.navigateBack();
 },
 done(){
  if(!this.data.ready||this.finishing)return;
  if(!this.data.closeReady){this.setData({error:'Enter a weight from 0 to 1999 g.'});return;}
  this.completed=true;if(!this.saveDraft())return;this.finishClose();
 }
};
