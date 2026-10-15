const {WheelMotion,WheelGesture,BASE_SPEED,ANALYSIS_SPEED}=require('../../utils/meal-wheel');
const {analysisDetails,FIELDS,INCOMPLETE_MESSAGE,analyzeMeal,applyMealAnalysis,mealInputSignature}=require('../../utils/food-analysis');
const {dishesFor,totals}=require('../../utils/dish');
const {dayKey,MEALS,randomUuid,wxCall}=require('../../lib/t100');
const {isPreview,store,errorText}=require('../../utils/page');
const {ensurePlan,currentTheme}=require('../../utils/page');
const photoSlots=(photos,previous=[])=>Array.from({length:5},(_,index)=>{const path=photos[index]||'';return {index,path,status:previous.find(slot=>slot.path===path)?.status||'loading'};});
const clockFields=()=>{const now=new Date();return {date:dayKey(now),time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`};};
Page({
  data:{orbitAngle:0,wheelFrozen:true,wheelDragging:false,wheelArmed:false,centerMode:'camera',centerPhase:'idle',calculationView:0,correction:'',analysisPhase:'Calculating…',hasAnalysis:false,analysisDirty:true,selectedDish:null,nutritionOpen:false,analyzing:false,analysisError:'',nutrients:[{key:'carbs',label:'Carbs',color:'#ff0874'},{key:'protein',label:'Protein',color:'#bbef00'},{key:'fat',label:'Fat',color:'#00cdbb'},{key:'fiber',label:'Fiber',color:'#529bff'}],openingDish:false,dishEditor:null,connected:false,containerRevealVersion:0,themeProfile:3,visible:true,skyReady:false,selectedPhotoIndex:-1,deletingPhotoIndex:-1,detailsOpen:false,photoSlots:photoSlots([]),today:dayKey(),preview:false,editing:false,saved:false,mealLocked:false,canSync:false,meals:MEALS,mealIndex:0,ratingDots:[1,2,3,4,5],form:{id:'',name:'',meal:'Breakfast',date:dayKey(),time:'08:00',weight:'',kcal:'',carbs:'',protein:'',fat:'',fiber:'',notes:'',rating:4,photos:[],sync:{}},error:'',feedback:'',loading:false,summary:false},
  async onLoad(options={}){
    this.wheelMotion=new WheelMotion(Date.now());
    this.preview=isPreview(options);if(!ensurePlan(this.preview)){this.blocked=true;return;}
    this.journal=store(this.preview);this.journalOwner=this.journal.ownerId;this.service=this.preview?getApp().getPreviewService():getApp().service;this.newPhotos=[];this.mealForms={};this.retiredMealIds=new Set();
    const old=this.journal.data.records.find(r=>r.id===options.id),hour=new Date().getHours();
    const meal=old?.meal||(hour<11?'Breakfast':hour<16?'Lunch':hour<21?'Dinner':'Snack');
    const empty={...this.data.form,...clockFields()};
    this.setData({preview:this.preview,summary:false,mealLocked:!!options.id,mealIndex:MEALS.indexOf(meal),'form.meal':meal});
    try{
      for(const kind of MEALS){
        const record=old?.meal===kind?old:!old?this.journal.data.records.find(r=>r.date===dayKey()&&r.meal===kind&&r.autoSaved):null;
        this.mealForms[kind]=record?{...record,...Object.fromEntries(['carbs','protein','fat','fiber','weight','kcal'].map(k=>[k,record[k]??'']))}:{...empty,id:await randomUuid(wx),meal:kind,weight:kind===meal?options.weight||'':'',photos:[],sync:{}};
      }
      if(this.unloaded)return;
      this.showMeal(meal);
      if(!this.data.form.photos.length)this.persistMeal();
    }catch(e){this.setData({error:errorText(e)});}
    this.unsubscribe=this.service?.onChange(s=>this.setData({connected:!!s.connected&&!s.adding,themeProfile:currentTheme(s),canSync:s.connected&&!!(s.status?.flags&1)&&s.hasAuth&&!s.busy}));
  },
  showMeal(meal){
    this.ratingGesture=null;this.ratingTapBlockedUntil=0;
    const form=this.mealForms[meal],saved=this.journal.data.records.some(r=>r.id===form.id);
    this.setData({form,mealIndex:MEALS.indexOf(meal),photoSlots:photoSlots(form.photos),selectedPhotoIndex:!this.data.summary&&form.photos.length?0:-1,selectedDish:null,detailsOpen:!!form.photos.length||!!form.name,editing:saved,saved,error:'',analysisError:''});
    this.refreshSelectedDish();
  },
  persistMeal(){
    if(this.journal.ownerId!==this.journalOwner){this.setData({error:'Your account changed. Reopen this meal.'});return false;}
    if(!this.data.form.id||this.data.deletingPhotoIndex>=0)return false;
    const form=this.data.form,previous=this.journal.data.records.find(r=>r.id===form.id);
    if(this.data.saved&&!previous)return false;
    this.mealForms[form.meal]={...form,photos:[...form.photos]};
    // A meal exists only while it contains dishes. Keep the empty wheel as a draft.
    if(!form.photos.length){
      try{
        if(previous){this.journal.removeMeal(form.id);this.retiredMealIds.add(form.id);}
        const empty={...form,name:'',weight:'',kcal:'',carbs:'',protein:'',fat:'',fiber:'',notes:'',dishes:[],photos:[],sync:{},mealAnalysis:null,analysisSignature:null};
        this.mealForms[form.meal]=empty;
        this.setData({form:empty,saved:false,editing:false,summary:false,detailsOpen:false,error:''});
        this.cleanupPhotos(previous?.photos||[]);
        return true;
      }catch(e){this.setData({saved:false,error:errorText(e)});return false;}
    }
    if(previous&&this.data.saved)return true;
    try{
      const record=this.journal.saveMeal({...form,...(!previous?clockFields():{}),autoSaved:true,name:form.name.trim()||form.meal,kcal:form.kcal===''?null:form.kcal,sync:Object.fromEntries(Object.keys(form.sync||{}).map(id=>[id,'pending']))});
      const next={...form,date:record.date,time:record.time,timestampUtc:record.timestampUtc,sync:record.sync,autoSaved:true};
      this.mealForms[form.meal]=next;
      this.setData({form:next,saved:true,editing:true,error:''});
      this.cleanupPhotos(previous?.photos||[]);
      return true;
    }catch(e){this.setData({detailsOpen:true,saved:false,error:errorText(e)});return false;}
  },
  onShow(){
    this.setData({visible:true,openingDish:!!this.data.dishEditor});this.resetCenter();
    if(this.data.dishEditor)return;
    const previousPhotos=this.data.form.photos;
    const record=this.journal?.data.records.find(r=>r.id===this.data.form.id);
    if(record&&this.data.saved){
      const form={...record,weight:record.weight??'',kcal:record.kcal??''};
      this.mealForms[form.meal]=form;
      this.setData({form,photoSlots:photoSlots(form.photos,this.data.photoSlots),selectedPhotoIndex:form.photos.length?Math.min(Math.max(0,this.data.selectedPhotoIndex),form.photos.length-1):-1,saved:true});
      this.cleanupPhotos(previousPhotos);
    }else if(this.data.saved&&this.journal){
      // The dish editor may discard the last photo and remove its meal.
      this.retiredMealIds.add(this.data.form.id);
      this.setData({'form.photos':[],saved:false,photoSlots:photoSlots([]),selectedPhotoIndex:-1});
      this.persistMeal();this.cleanupPhotos(previousPhotos);
    }
    this.refreshSelectedDish();this.startWheel();
  },onHide(){this.stopWheel();this.cancelWheelDrag();this.resetCenter();this.ratingGesture=null;this.finishPhotoRemoval?.();this.persistMeal();this.setData({visible:false});},
  cleanupPhotos(paths){
    if(this.journal?.ownerId!==this.journalOwner)return;if(this.preview)return;for(const path of paths)if(path.startsWith(wx.env.USER_DATA_PATH+'/kcalack-photo-')&&!this.journal.data.records.some(r=>r.photos.includes(path))&&!(Object.values(this.mealForms||{}).some(form=>form.photos.includes(path))))wx.getFileSystemManager().unlink({filePath:path,fail:()=>{}});},
  onUnload(){this.stopWheel();this.cancelWheelDrag();this.resetCenter();this.ratingGesture=null;this.finishPhotoRemoval?.();this.persistMeal();this.unloaded=true;clearTimeout(this.photoDeleteTimer);this.unsubscribe?.();this.cleanupPhotos(this.newPhotos||[]);},
  onReady(){this.wheelReady=true;this.startWheel();},
  startWheel(){
    if(!this.wheelReady||this.wheelRunning||this.unloaded||!this.data.visible||this.data.dishEditor)return;
    this.wheelMotion.resume(Date.now());
    this.wheelMotion.target((this.wheelDirection||1)*(this.data.analyzing?ANALYSIS_SPEED:BASE_SPEED),Date.now());
    this.wheelRunning=true;this.renderWheel();
  },
  renderWheel(dragging=false){
    clearTimeout(this.wheelTimer);
    const version=this.wheelRenderVersion=(this.wheelRenderVersion||0)+1;
    if(!this.wheelReady||this.unloaded||!this.data.visible||this.data.summary)return;
    // One angle feeds both the orbit and all inverse photo rotations. Changing
    // velocity updates this same clock; no long native animation can outlive it.
    const angle=dragging?this.wheelMotion.angle:this.wheelMotion.advance(Date.now());
    this.setData({orbitAngle:angle,wheelFrozen:dragging},()=>{
      if(version!==this.wheelRenderVersion||dragging||!this.wheelRunning||this.unloaded||!this.data.visible||this.data.summary||this.data.dishEditor)return;
      // Wait for the view to consume this small update before queuing another.
      this.wheelTimer=setTimeout(()=>this.renderWheel(),32);
    });
  },
  stopWheel(){
    this.wheelRunning=false;clearTimeout(this.wheelTimer);this.wheelMotion?.pause(Date.now());this.renderWheel(true);
  },
  resetCenter(){
    clearTimeout(this.centerTimer);this.centerTransition=null;
    this.centerTarget=this.data.analyzing?'analysis':'camera';
    this.setData({centerMode:this.centerTarget,centerPhase:'idle'});
  },
  transitionCenter(mode){
    this.centerTarget=mode;
    if(this.unloaded)return;
    if(!this.data.visible){this.resetCenter();return;}
    if(this.centerTransition||this.data.centerMode===mode)return;
    // Finish each shrink/expand cycle before reversing, even on a fast response.
    const token={};this.centerTransition=token;
    this.setData({centerPhase:'shrinking'},()=>{
      if(this.centerTransition!==token)return;
      this.centerTimer=setTimeout(()=>{
        if(this.centerTransition!==token||this.unloaded)return;
        this.setData({centerMode:mode,centerPhase:'expanding'},()=>{
          if(this.centerTransition!==token)return;
          this.centerTimer=setTimeout(()=>{
            if(this.centerTransition!==token||this.unloaded)return;
            this.centerTransition=null;this.setData({centerPhase:'idle'});
            this.transitionCenter(this.centerTarget);
          },260);
        });
      },200);
    });
  },
  wheelTouchStart(e){
    if(e.touches?.length!==1){this.cancelWheelDrag();return;}
    if(this.data.analyzing||this.data.loading||this.data.deletingPhotoIndex>=0)return;
    const touch=e.touches[0],token={};this.wheelTouch=token;
    this.createSelectorQuery().select('.photo-wheel').boundingClientRect(rect=>{
      if(this.wheelTouch!==token||!rect)return;
      this.wheelMotion.target(0,Date.now(),0);
      this.wheelGesture=new WheelGesture(touch.clientX,touch.clientY,rect.left+rect.width/2,rect.top+rect.height/2,Number(e.timeStamp)||Date.now());
      this.setData({wheelDragging:true});this.renderWheel(true);
    }).exec();
  },
  wheelTouchMove(e){
    if(!this.wheelGesture)return;
    if(e.touches?.length!==1){this.cancelWheelDrag();return;}
    const touch=e.touches[0],time=Number(e.timeStamp)||Date.now();
    const delta=this.wheelGesture.move(touch.clientX,touch.clientY,time);
    this.wheelMotion.drag(delta,Date.now());
    const armed=this.wheelGesture.release(time).trigger;
    if(armed&&!this.data.wheelArmed)wx.vibrateShort?.({type:'light',fail:()=>{}});
    this.setData({orbitAngle:this.wheelMotion.angle,wheelArmed:armed});this.renderWheel(true);
  },
  wheelTouchEnd(e){
    if(e.touches?.length){this.cancelWheelDrag();return;}
    const gesture=this.wheelGesture;if(!gesture){this.wheelTouch=null;return;}
    const result=gesture.release(Number(e.timeStamp)||Date.now());
    this.wheelTouch=null;this.wheelGesture=null;
    if(gesture.moved)this.wheelTapBlockedUntil=Date.now()+400;
    this.wheelDirection=Math.sign(result.speed)||this.wheelDirection||1;
    this.wheelMotion.target(result.speed,Date.now(),0);
    this.setData({wheelDragging:false,wheelArmed:false});
    if(result.trigger){void this.calculateMeal();}
    else {this.wheelMotion.target(this.wheelDirection*BASE_SPEED,Date.now(),1000);this.renderWheel();}
  },
  cancelWheelDrag(){
    if(this.wheelGesture?.moved)this.wheelTapBlockedUntil=Date.now()+400;
    this.wheelTouch=null;this.wheelGesture=null;
    this.wheelMotion?.target((this.wheelDirection||1)*(this.data.analyzing?ANALYSIS_SPEED:BASE_SPEED),Date.now(),1000);
    this.setData({wheelDragging:false,wheelArmed:false});if(this.wheelRunning)this.renderWheel();
  },
  centerLongPress(){if(!this.data.form.photos.length||this.data.analyzing)return;this.centerTapBlockedUntil=Date.now()+600;void this.calculateMeal();},
  centerTap(){if(Date.now()<(this.centerTapBlockedUntil||0))return;this.choosePhoto();},
  showWheel(){this.setData({summary:false,calculationView:this.data.calculationView+1},()=>this.renderWheel());},
  dishEditorClosed(){this.setData({dishEditor:null,openingDish:false});this.onShow();},
  containerRevealed(){this.setData({containerRevealVersion:this.data.containerRevealVersion+1});},
  toggleDetails(){this.setData({detailsOpen:!this.data.detailsOpen});},
  selectMeal(e){const meal=e.currentTarget.dataset.meal;if(this.data.mealLocked||this.data.analyzing||this.data.loading||this.data.deletingPhotoIndex>=0||!this.data.form.id||!this.mealForms?.[meal]||meal===this.data.form.meal)return;if(this.persistMeal()){this.showMeal(meal);}},
  nextMeal(){this.selectMeal({currentTarget:{dataset:{meal:MEALS[(this.data.mealIndex+1)%MEALS.length]}}});},
  skyLoaded(){this.setData({skyReady:true});},
  skyUnavailable(){this.setData({skyReady:false});},
  field(e){this.setData({['form.'+e.currentTarget.dataset.field]:e.detail.value,saved:false,error:''});this.persistMeal();},
  async choosePhoto(){
    if(this.data.analyzing||this.data.loading||this.data.deletingPhotoIndex>=0||this.data.form.photos.length>=5)return;
    this.setData({loading:true,error:''});const paths=[];
    try{
      if(this.retiredMealIds.has(this.data.form.id)){const id=await randomUuid(wx);if(this.unloaded)return;this.setData({'form.id':id});this.mealForms[this.data.form.meal]=this.data.form;}
      const result=await wxCall(wx,'chooseMedia',{count:1,mediaType:['image'],sourceType:['camera','album'],sizeType:['compressed']},120000);
      if(this.unloaded)return;
      for(const file of result.tempFiles.slice(0,5-this.data.form.photos.length)){
        if(this.preview){paths.push(file.tempFilePath);continue;}
        const id=await randomUuid(wx),path=wx.env.USER_DATA_PATH+'/kcalack-photo-'+id+'.jpg';
        await wxCall(wx.getFileSystemManager(),'saveFile',{tempFilePath:file.tempFilePath,filePath:path});this.newPhotos.push(path);paths.push(path);
        if(this.unloaded){this.cleanupPhotos(paths);return;}
      }
      if(paths.length){const photos=[...this.data.form.photos,...paths];const dishes=this.data.form.dishes?dishesFor({...this.data.form,photos}):null;this.setData({...dishes?{'form.dishes':dishes,...Object.fromEntries(Object.entries(totals(dishes)).map(([key,value])=>['form.'+key,value??'']))}:{},'form.photos':photos,'form.mealAnalysis':null,'form.analysisSignature':null,openingDish:true,selectedPhotoIndex:photos.length-1,detailsOpen:true,saved:false});if(this.persistMeal())await this.openDish(photos.length-1);else this.setData({openingDish:false,photoSlots:photoSlots(photos,this.data.photoSlots)});}
    }catch(e){this.cleanupPhotos(paths);if(!this.unloaded){if(this.data.openingDish)this.onShow();if(!/cancel/i.test(e.errMsg||e.message||''))this.setData({error:errorText(e)});}}
    finally{if(!this.unloaded)this.setData({loading:false});}
  },
  selectPhoto(e){
    const index=Number(e.currentTarget.dataset.index);
    if(Date.now()<(this.wheelTapBlockedUntil||0)||this.data.analyzing||this.data.deletingPhotoIndex>=0||!this.data.form.photos[index])return;
    this.setData({selectedPhotoIndex:index,detailsOpen:true});
    if(this.data.summary||dishesFor(this.data.form)[index]?.analysis)this.refreshSelectedDish();
    else if(this.persistMeal())this.openDish(index);
  },
  openDish(index){
    if(this.data.dishEditor)return;
    this.stopWheel();this.cancelWheelDrag();
    this.setData({openingDish:true,dishEditor:{id:this.data.form.id,index}});
  },
  removePhoto(e){
    const index=Number(e.currentTarget.dataset.index);
    if(this.data.analyzing||this.data.loading||this.data.deletingPhotoIndex>=0||!this.data.form.photos[index])return;
    this.setData({deletingPhotoIndex:index});
    this.finishPhotoRemoval=()=>{
      clearTimeout(this.photoDeleteTimer);this.finishPhotoRemoval=null;
      if(this.unloaded)return;
      const photos=this.data.form.photos.filter((_,i)=>i!==index),previous=this.data.selectedPhotoIndex;
      const selected=photos.length?Math.min(previous>index?previous-1:Math.max(0,previous),photos.length-1):-1;
      const dishes=this.data.form.dishes?dishesFor(this.data.form).filter(d=>photos.includes(d.photo)):null;
      this.setData({...dishes?{'form.dishes':dishes,...Object.fromEntries(Object.entries(totals(dishes)).map(([key,value])=>['form.'+key,value??'']))}:{},'form.photos':photos,'form.mealAnalysis':null,'form.analysisSignature':null,photoSlots:photoSlots(photos,this.data.photoSlots),selectedPhotoIndex:selected,deletingPhotoIndex:-1,saved:false});
      this.persistMeal();
      this.refreshSelectedDish();
    };
    this.photoDeleteTimer=setTimeout(this.finishPhotoRemoval,220);
  },
  photoLoaded(e){this.setPhotoStatus(e,'ready');},
  photoFailed(e){this.setPhotoStatus(e,'failed');},
  setPhotoStatus(e,status){
    const {index,path}=e.currentTarget.dataset;
    if(this.unloaded||this.data.photoSlots[index]?.path!==path)return;
    const slots=this.data.photoSlots.map((slot,i)=>i===Number(index)?{...slot,status}:slot);
    this.setData({photoSlots:slots,...(status==='failed'?{error:'Could not load this photo. Remove it and try again.'}:{})});
  },
  previewPhoto(e){if(this.wheelGesture?.moved||Date.now()<(this.wheelTapBlockedUntil||0))return;wx.previewImage({current:e.currentTarget.dataset.path,urls:this.data.form.photos});},
  refreshSelectedDish(){
    const photo=this.data.form.photos[this.data.selectedPhotoIndex];
    const savedDish=dishesFor(this.data.form).find(d=>d.photo===photo);
    const dish=savedDish?{...savedDish,...(savedDish.analysis?{analysis:analysisDetails(savedDish.analysis)}:{})}:null;
    if(this.data.selectedDish?.photo!==photo)this.setData({correction:''});
    this.setData({selectedDish:dish,hasAnalysis:dishesFor(this.data.form).some(d=>!!d.analysis),analysisDirty:this.data.form.analysisSignature!==mealInputSignature(this.data.form)});
  },
  editSelectedWeight(){if(!this.data.analyzing&&this.data.selectedDish&&this.persistMeal())this.openDish(this.data.selectedPhotoIndex);},
  toggleNutrition(){this.setData({nutritionOpen:!this.data.nutritionOpen});},
  correctionField(e){this.setData({correction:e.detail.value});},
  recalculate(){
    const text=this.data.correction.trim(),photo=this.data.selectedDish?.photo;
    return this.calculateMeal(text&&photo?{photo,text}:undefined);
  },
  async calculateMeal(correction){
    // bindtap supplies an event; only an explicit correction uses the @edit path.
    if(!correction?.photo)correction=undefined;
    if(this.data.analyzing||this.data.loading||this.data.deletingPhotoIndex>=0||!this.data.form.photos.length)return;
    if(!this.persistMeal()){this.wheelMotion?.target((this.wheelDirection||1)*BASE_SPEED,Date.now(),1000);this.renderWheel();return;}
    const snapshot=JSON.parse(JSON.stringify(this.data.form)),id=snapshot.id,input=mealInputSignature(snapshot);
    let applied=false;
    const current=()=>this.journal.data.records.find(r=>r.id===id);
    const cancelled=()=>this.unloaded||this.journal.ownerId!==this.journalOwner||this.data.form.id!==id||!current()||mealInputSignature(current())!==input;
    this.wheelMotion?.target((this.wheelDirection||1)*ANALYSIS_SPEED,Date.now(),800);

    this.transitionCenter('analysis');
    this.setData({analyzing:true,wheelArmed:false,summary:false,calculationView:this.data.calculationView+1,analysisError:'',error:'',analysisPhase:'Calculating…'},()=>this.renderWheel());
    try{
      const result=await analyzeMeal({record:snapshot,preview:this.preview,correction,cancelled,onPhase:analysisPhase=>{if(!cancelled())this.setData({analysisPhase});}});
      if(cancelled())return;
      const form=applyMealAnalysis(current(),result);
      // One storage transaction publishes every dish and the meal advice together.
      this.setData({form,saved:false});
      if(!this.persistMeal())return;
      applied=true;
      if(correction&&this.data.selectedDish?.photo===correction.photo&&this.data.correction.trim()===correction.text)this.setData({correction:''});
      if(this.data.selectedPhotoIndex<0)this.setData({selectedPhotoIndex:0});
      if(form.dishes.some(d=>FIELDS.some(k=>d[k]===null)))this.setData({analysisError:INCOMPLETE_MESSAGE});
    }catch(error){if(!cancelled())this.setData({analysisError:errorText(error)});}
    finally{
      if(!this.unloaded){
        this.wheelMotion?.target((this.wheelDirection||1)*BASE_SPEED,Date.now(),2400);
        this.setData({analyzing:false});this.transitionCenter('camera');this.renderWheel();
        if(!applied&&cancelled()){
          const latest=this.journal.ownerId===this.journalOwner?current():null;
          if(latest)this.setData({form:latest,saved:true,photoSlots:photoSlots(latest.photos,this.data.photoSlots)});
          else this.setData({saved:false,'form.photos':[],'form.dishes':[],'form.mealAnalysis':null,'form.analysisSignature':null,selectedDish:null,photoSlots:photoSlots([])});
        }
        this.refreshSelectedDish();
      }
    }
  }
});
