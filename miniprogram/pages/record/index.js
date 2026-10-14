const {dayKey,MEALS,randomUuid,wxCall}=require('../../lib/t100');
const {isPreview,store,errorText,route}=require('../../utils/page');
const {ensurePlan,currentTheme}=require('../../utils/page');
const photoSlots=photos=>Array.from({length:5},(_,index)=>({index,path:photos[index]||''}));
const clockFields=()=>{const now=new Date();return {date:dayKey(now),time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`};};
Page({
  data:{themeProfile:3,visible:true,skyReady:false,orbitPaused:false,photoEditing:false,selectedPhotoIndex:-1,deletingPhotoIndex:-1,detailsOpen:false,photoSlots:photoSlots([]),today:dayKey(),preview:false,editing:false,saved:false,canSync:false,meals:MEALS,mealIndex:0,ratingDots:[1,2,3,4,5],form:{id:'',name:'',meal:'Breakfast',date:dayKey(),time:'08:00',weight:'',kcal:'',carbs:'',protein:'',fat:'',fiber:'',notes:'',rating:4,photos:[],sync:{}},error:'',feedback:'',loading:false,summary:false},
  async onLoad(options={}){
    this.preview=isPreview(options);if(!ensurePlan(this.preview)){this.blocked=true;return;}
    this.journal=store(this.preview);this.service=this.preview?getApp().getPreviewService():getApp().service;this.newPhotos=[];this.mealForms={};
    const old=this.journal.data.records.find(r=>r.id===options.id),hour=new Date().getHours();
    const meal=old?.meal||(hour<11?'Breakfast':hour<16?'Lunch':hour<21?'Dinner':'Snack');
    const empty={...this.data.form,...clockFields()};
    this.setData({preview:this.preview,summary:!!old,mealIndex:MEALS.indexOf(meal),'form.meal':meal});
    try{
      for(const kind of MEALS){
        const record=old?.meal===kind?old:!old?this.journal.data.records.find(r=>r.date===dayKey()&&r.meal===kind&&r.autoSaved):null;
        this.mealForms[kind]=record?{...record,...Object.fromEntries(['carbs','protein','fat','fiber','weight','kcal'].map(k=>[k,record[k]??'']))}:{...empty,id:await randomUuid(wx),meal:kind,weight:kind===meal?options.weight||'':'',photos:[],sync:{}};
      }
      if(this.unloaded)return;
      this.showMeal(meal);
    }catch(e){this.setData({error:errorText(e)});}
    this.unsubscribe=this.service?.onChange(s=>this.setData({themeProfile:currentTheme(s),canSync:s.connected&&!!(s.status?.flags&1)&&s.hasAuth&&!s.busy}));
  },
  showMeal(meal){
    const form=this.mealForms[meal],saved=this.journal.data.records.some(r=>r.id===form.id);
    this.setData({form,mealIndex:MEALS.indexOf(meal),photoSlots:photoSlots(form.photos),selectedPhotoIndex:form.photos.length?0:-1,photoEditing:false,detailsOpen:!!form.photos.length||!!form.name,editing:saved,saved,error:''});
  },
  persistMeal(){
    if(!this.data.form.id||this.data.deletingPhotoIndex>=0)return false;
    const form=this.data.form,previous=this.journal.data.records.find(r=>r.id===form.id);
    this.mealForms[form.meal]={...form,photos:[...form.photos]};
    if(previous&&this.data.saved)return true;
    // Simply visiting a meal stop must not create an empty journal entry.
    if(!previous&&!form.photos.length&&!form.name.trim()&&form.weight===''&&form.kcal==='')return true;
    try{
      const record=this.journal.saveMeal({...form,...(!previous?clockFields():{}),autoSaved:true,name:form.name.trim()||form.meal,kcal:form.kcal===''?null:form.kcal,sync:Object.fromEntries(Object.keys(form.sync||{}).map(id=>[id,'pending']))});
      const next={...form,date:record.date,time:record.time,timestampUtc:record.timestampUtc,sync:record.sync,autoSaved:true};
      this.mealForms[form.meal]=next;
      this.setData({form:next,saved:true,editing:true,error:''});
      this.cleanupPhotos(previous?.photos||[]);
      return true;
    }catch(e){this.setData({detailsOpen:true,saved:false,error:errorText(e)});return false;}
  },
  onShow(){this.setData({visible:true});},onHide(){this.finishPhotoRemoval?.();this.persistMeal();this.setData({visible:false});},
  cleanupPhotos(paths){if(this.preview)return;for(const path of paths)if(path.startsWith(wx.env.USER_DATA_PATH+'/kcalack-photo-')&&!this.journal.data.records.some(r=>r.photos.includes(path))&&!(Object.values(this.mealForms||{}).some(form=>form.photos.includes(path))))wx.getFileSystemManager().unlink({filePath:path,fail:()=>{}});},
  onUnload(){this.finishPhotoRemoval?.();this.persistMeal();this.unloaded=true;clearTimeout(this.orbitTimer);clearTimeout(this.photoDeleteTimer);this.unsubscribe?.();this.cleanupPhotos(this.newPhotos||[]);},
  pauseOrbit(){clearTimeout(this.orbitTimer);this.setData({orbitPaused:true});},
  resumeOrbit(){clearTimeout(this.orbitTimer);this.orbitTimer=setTimeout(()=>{if(!this.unloaded)this.setData({orbitPaused:false});},400);},
  toggleDetails(){this.setData({detailsOpen:!this.data.detailsOpen});},
  selectMeal(e){const meal=e.currentTarget.dataset.meal;if(this.data.loading||this.data.deletingPhotoIndex>=0||!this.mealForms?.[meal]||meal===this.data.form.meal)return;if(this.persistMeal()){this.showMeal(meal);this.resumeOrbit();}},
  nextMeal(){this.selectMeal({currentTarget:{dataset:{meal:MEALS[(this.data.mealIndex+1)%MEALS.length]}}});},
  skyLoaded(){this.setData({skyReady:true});},
  skyUnavailable(){this.setData({skyReady:false});},
  field(e){this.setData({['form.'+e.currentTarget.dataset.field]:e.detail.value,saved:false,error:''});this.persistMeal();},
  rating(e){this.setData({'form.rating':Number(e.currentTarget.dataset.value),saved:false});this.persistMeal();},
  async choosePhoto(){
    if(this.data.loading||this.data.deletingPhotoIndex>=0||this.data.form.photos.length>=5)return;
    this.setData({loading:true,error:''});const paths=[];
    try{
      const result=await wxCall(wx,'chooseMedia',{count:1,mediaType:['image'],sourceType:['camera','album'],sizeType:['compressed']},120000);
      if(this.unloaded)return;
      for(const file of result.tempFiles.slice(0,5-this.data.form.photos.length)){
        if(this.preview){paths.push(file.tempFilePath);continue;}
        const id=await randomUuid(wx),path=wx.env.USER_DATA_PATH+'/kcalack-photo-'+id+'.jpg';
        await wxCall(wx.getFileSystemManager(),'saveFile',{tempFilePath:file.tempFilePath,filePath:path});this.newPhotos.push(path);paths.push(path);
        if(this.unloaded){this.cleanupPhotos(paths);return;}
      }
      if(paths.length){const photos=[...this.data.form.photos,...paths];this.setData({'form.photos':photos,photoSlots:photoSlots(photos),selectedPhotoIndex:photos.length-1,photoEditing:true,detailsOpen:true,saved:false});this.persistMeal();}
    }catch(e){this.cleanupPhotos(paths);if(!this.unloaded&&!/cancel/i.test(e.errMsg||e.message||''))this.setData({error:errorText(e)});}
    finally{if(!this.unloaded)this.setData({loading:false});}
  },
  editPhoto(){this.setData({photoEditing:true});this.pauseOrbit();},
  selectPhoto(e){
    const index=Number(e.currentTarget.dataset.index);
    if(this.data.deletingPhotoIndex>=0||!this.data.form.photos[index])return;
    this.setData({selectedPhotoIndex:index,photoEditing:true,detailsOpen:true});this.pauseOrbit();
  },
  removePhoto(e){
    const index=Number(e.currentTarget.dataset.index);
    if(this.data.loading||this.data.deletingPhotoIndex>=0||!this.data.form.photos[index])return;
    this.setData({deletingPhotoIndex:index,photoEditing:true});
    this.finishPhotoRemoval=()=>{
      clearTimeout(this.photoDeleteTimer);this.finishPhotoRemoval=null;
      if(this.unloaded)return;
      const photos=this.data.form.photos.filter((_,i)=>i!==index),previous=this.data.selectedPhotoIndex;
      const selected=photos.length?Math.min(previous>index?previous-1:Math.max(0,previous),photos.length-1):-1;
      this.setData({'form.photos':photos,photoSlots:photoSlots(photos),selectedPhotoIndex:selected,deletingPhotoIndex:-1,photoEditing:photos.length>0,saved:false});
      this.persistMeal();if(!photos.length)this.resumeOrbit();
    };
    this.photoDeleteTimer=setTimeout(this.finishPhotoRemoval,220);
  },
  previewPhoto(e){this.pauseOrbit();wx.previewImage({current:e.currentTarget.dataset.path,urls:this.data.form.photos,complete:()=>this.resumeOrbit()});},
  edit(){this.setData({summary:false,detailsOpen:true,skyReady:false,photoEditing:this.data.form.photos.length>0});},done(){if(getCurrentPages().length>1)wx.navigateBack();else wx.reLaunch({url:'/pages/index/index'});},
  async sync(){if(this.data.loading||!this.data.saved)return;this.setData({loading:true,error:'',feedback:''});try{if(this.data.form.kcal===''||this.data.form.kcal===null)throw new Error('Enter calories before sending to your device.');const s=this.service?.state;if(!s?.connected||!(s.status?.flags&1)||!s.hasAuth)throw new Error('Connect a bound device with saved auth first.');for(const deletion of this.journal.data.deletions||[])if(deletion.deviceId===s.device.id){await this.service.invoke('deleteKcalHist',{uuid:deletion.id});this.journal.clearDeletion(deletion.id,s.device.id);}await this.service.appendHistory({uuid:this.data.form.id,timestampUtc:this.data.form.timestampUtc,kcal:this.data.form.kcal,rating:this.data.form.rating,foodFiles:this.data.form.photos.slice(0,3)});this.journal.markSync(this.data.form.id,s.device.id,'sent');this.setData({feedback:this.preview?'Preview only · nothing was sent.':'Record sent to your device.'});}catch(e){this.setData({error:'Saved locally. '+errorText(e)});}finally{this.setData({loading:false});}},
  async remove(){if(this.data.loading)return;const answer=await wxCall(wx,'showModal',{title:'Delete this meal?',content:'Remove it from your journal. A device copy will be removed when synced to that device.',confirmText:'Delete',confirmColor:'#ad3c32'});if(!answer.confirm)return;this.setData({loading:true,error:''});try{const photos=this.data.form.photos;this.journal.removeMeal(this.data.form.id);delete this.mealForms[this.data.form.meal];this.setData({'form.id':''});this.cleanupPhotos(photos);this.done();}catch(e){this.setData({error:errorText(e)});}finally{this.setData({loading:false});}}
});
