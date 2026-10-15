const {wxCall,randomUuid}=require('../../lib/t100');
const initial=name=>Array.from(String(name||'').trim())[0]||'C';
const containerRows=items=>items.map(item=>({...item,initial:initial(item.name)}));
const definition=require('../../pages/shared/device-controller')(0);
const methods=Object.fromEntries(Object.entries(definition).filter(([key,value])=>typeof value==='function'&&!['onLoad','onShow','onHide','onUnload'].includes(key)));
Component({options:{styleIsolation:'apply-shared'},properties:{demo:Boolean,selectionMode:Boolean,selectedContainerId:String},data:{...definition.data,pendingContainerId:'',enteringContainerId:'',dockScrollTarget:'',containerSheetMounted:false,containerSheetClosing:false,expandedContainerId:'',editingContainerId:'',containerPhoto:'',containerInitial:'C',defaultContainerName:'Container 1',photoBusy:false,weightManual:false},
 observers:{selectedContainerId(id){if(this.properties.selectionMode)this.setData({expandedContainerId:id||''});},'reading, connected'(){this.updateContainerWeight();},'containerName, defaultContainerName'(){this.setData({containerInitial:initial(this.data.containerName.trim()||this.data.defaultContainerName)});}},
 lifetimes:{ready(){
  this.embedded=true;this.stayOnDeviceInfo=true;this.screen=0;
  definition.onLoad.call(this,{preview:this.properties.demo?'1':undefined});
  if(!this.blocked)this.setData({containerLibrary:containerRows(getApp().journalFor(this.preview).data.containers)});
 },detached(){clearTimeout(this.containerEntryTimer);clearTimeout(this.containerCloseTimer);definition.onUnload.call(this);}},
 methods:{...methods,openDevice(){},
  patchData(patch){
   // Container acknowledgements must not replace a draft's live/manual weight.
   const next={...patch};delete next['form.container'];methods.patchData.call(this,next);
  },
  nextContainerName(){
   const names=new Set(getApp().journalFor(this.preview).data.containers.map(item=>item.name));
   let index=1;while(names.has('Container '+index))index++;
   return 'Container '+index;
  },
  tapContainer(e){
   if(this.data.working)return;
   const id=e.currentTarget.dataset.id;
   if(!getApp().journalFor(this.preview).data.containers.some(c=>c.id===id))return;
   if(this.data.expandedContainerId===id){this.editContainer(e);return;}
   this.setData({expandedContainerId:id});
   if(this.properties?.selectionMode)this.triggerEvent('selectionchange',{container:getApp().journalFor(this.preview).data.containers.find(c=>c.id===id)});
  },
  clearSelection(){if(this.data.working)return;this.setData({expandedContainerId:''});this.triggerEvent('selectionchange',{container:null});},
  editContainer(e){
   if(this.data.working)return;
   const item=getApp().journalFor(this.preview).data.containers.find(c=>c.id===e.currentTarget.dataset.id);
   if(!item)return;
   this.containerOwner=getApp().journalFor(this.preview).ownerId;
   this.triggerEvent?.('editorchange',{open:true});
   clearTimeout(this.containerCloseTimer);
   this.containerDraft=(this.containerDraft||0)+1;
   this.setData({containerSheetMounted:true,containerSheetClosing:false,editingContainerId:item.id,showContainers:true,showSettings:false,containerName:item.name,defaultContainerName:item.name,containerPhoto:item.photo||'',weightManual:true,error:'','form.container':String(item.grams)});
  },
  openContainers(){
   if(this.data.working)return;
   this.containerOwner=getApp().journalFor(this.preview).ownerId;
   this.triggerEvent?.('editorchange',{open:true});
   clearTimeout(this.containerCloseTimer);
   this.containerDraft=(this.containerDraft||0)+1;
   this.setData({containerSheetMounted:true,containerSheetClosing:false,expandedContainerId:'',editingContainerId:'',showContainers:true,showSettings:false,containerName:'',defaultContainerName:this.nextContainerName(),containerPhoto:'',weightManual:false,error:'','form.container':''});
   this.updateContainerWeight();
  },
  closeContainers(){if(this.data.working||this.data.containerSheetClosing)return;this.setData({error:''});this.dismissContainerSheet();},
  dismissContainerSheet(){
   this.triggerEvent?.('editorchange',{open:true});
   clearTimeout(this.containerCloseTimer);
   this.containerDraft=(this.containerDraft||0)+1;
   // Keep the sheet and its fields mounted until the slide-out completes.
   this.setData({showContainers:false,containerSheetClosing:true});
   this.containerCloseTimer=setTimeout(()=>this.finishContainerClose(),280);
  },
  containerSheetAnimationEnd(e){if(e.detail.animationName==='container-sheet-out')this.finishContainerClose();},
  finishContainerClose(){
   if(this.unloaded||!this.data.containerSheetClosing)return;
   clearTimeout(this.containerCloseTimer);
   this.setData({containerSheetMounted:false,containerSheetClosing:false,editingContainerId:'',containerName:'',containerPhoto:''});
   this.triggerEvent?.('editorchange',{open:false});
   const id=this.data.pendingContainerId;
   if(id){
    clearTimeout(this.containerEntryTimer);
    this.setData({pendingContainerId:'',enteringContainerId:id,dockScrollTarget:'container-'+id});
    this.containerEntryTimer=setTimeout(()=>this.finishContainerEntry(id),600);
   }
  },
  finishContainerEntry(id){
   if(this.unloaded||this.data.enteringContainerId!==id)return;
   clearTimeout(this.containerEntryTimer);
   this.setData({enteringContainerId:''});
  },
  containerEntryAnimationEnd(e){if(e.detail.animationName==='container-dock-in')this.finishContainerEntry(e.currentTarget.dataset.id);},
  updateContainerWeight(){
   if(!this.data.showContainers||this.data.weightManual||this.data.working)return;
   const r=this.data.reading,valid=this.data.connected&&r&&!(r.version>=2&&!r.mainValid)&&!r.overload&&Number.isFinite(r.value);
   const gross=valid&&r.profile===3&&r.lower?.kind===2&&r.lower.valid?r.lower.value/1000:null;
   const value=valid?Math.max(0,gross??(r.unit===1?r.value*.28349523125:r.value/1000)).toFixed(1):'';
   if(value!==this.data.form.container)this.setData({'form.container':value});
  },
  containerWeightInput(e){this.setData({weightManual:true,'form.container':e.detail.value,error:''});},
  async chooseContainerPhoto(){
   if(this.data.photoBusy||this.data.working||this.data.containerSheetClosing)return;
   const draft=this.containerDraft;this.setData({photoBusy:true,error:''});
   try{
    const result=await wxCall(wx,'chooseMedia',{count:1,mediaType:['image'],sourceType:['camera','album'],sizeType:['compressed']},120000);
    if(!this.unloaded&&draft===this.containerDraft&&result.tempFiles?.[0])this.setData({containerPhoto:result.tempFiles[0].tempFilePath});
   }catch(error){if(!this.unloaded&&draft===this.containerDraft&&!/cancel/i.test(error.errMsg||error.message||''))this.setData({error:error.message||error.errMsg});}
   finally{if(!this.unloaded)this.setData({photoBusy:false});}
  },
  async saveContainer(){
   if(this.data.working||this.data.photoBusy||this.data.containerSheetClosing)return;
   const journal=getApp().journalFor(this.preview),existing=journal.data.containers.find(c=>c.id===this.data.editingContainerId);
   if(this.containerOwner!==journal.ownerId){this.setData({error:'Your account changed. Reopen this container.'});return;}
   const name=this.data.containerName.trim()||existing?.name||this.nextContainerName(),grams=Number(this.data.form.container),photo=this.data.containerPhoto;
   if(!Number.isFinite(grams)||grams<.001||grams>1999){this.setData({error:'Container weight must be 0.001–1999 g'});return;}
   if(!photo){this.setData({error:'Add a container photo.'});return;}
   if(!existing&&journal.data.containers.length>=50){this.setData({error:'You can save up to 50 containers.'});return;}
   this.setData({working:true,error:''});let savedPath='',committed=false;
   try{
    const id=existing?.id||await randomUuid(wx);if(this.unloaded)return;
    if(!this.preview&&photo&&photo!==existing?.photo){
     const photoId=existing?await randomUuid(wx):id;if(this.unloaded)return;
     savedPath=wx.env.USER_DATA_PATH+'/kcalack-container-'+photoId+'.jpg';
     await wxCall(wx.getFileSystemManager(),'saveFile',{tempFilePath:photo,filePath:savedPath});
     if(this.unloaded)return;
    }
    journal.saveContainer({id,name,grams,photo:savedPath||photo});committed=true;
    if(existing?.photo!==photo)this.removeUnusedContainerPhoto(existing?.photo);
    const apply=!this.properties?.selectionMode&&this.data.canControl&&this.data.profile===3;
    if(this.properties?.selectionMode)this.triggerEvent('selectionchange',{container:journal.data.containers.find(c=>c.id===id)});
    this.setData({containerLibrary:containerRows(journal.data.containers),expandedContainerId:'',pendingContainerId:existing?'':id});
    this.dismissContainerSheet();
    if(apply)await this.service.setContainer(grams,id);
   }catch(error){if(!this.unloaded)this.setData({error:error.message||error.errMsg});}
   finally{
    if(savedPath&&!committed)wx.getFileSystemManager().unlink({filePath:savedPath,fail:()=>{}});
    if(!this.unloaded)this.setData({working:false});
   }
  },
  removeUnusedContainerPhoto(path){
   if(this.preview||!path||!path.startsWith(wx.env.USER_DATA_PATH+'/kcalack-container-'))return;
   if(getApp().journalFor(this.preview).data.containers.some(c=>c.photo===path))return;
   wx.getFileSystemManager().unlink({filePath:path,fail:()=>{}});
  },
  async deleteContainer(){
   if(this.data.working||this.data.photoBusy||this.data.containerSheetClosing)return;
   const journal=getApp().journalFor(this.preview),item=journal.data.containers.find(c=>c.id===this.data.editingContainerId);
   if(!item)return;
   if(this.containerOwner!==journal.ownerId){this.setData({error:'Your account changed. Reopen this container.'});return;}
   this.setData({working:true,error:''});
   try{
    const clear=!this.properties?.selectionMode&&this.data.canControl&&this.data.profile===3&&this.data.containerState?.uuid===item.id;
    journal.removeContainer(item.id);
    if(this.properties?.selectionMode&&this.properties.selectedContainerId===item.id)this.triggerEvent('selectionchange',{container:null});
    this.removeUnusedContainerPhoto(item.photo);
    this.containerDraft=(this.containerDraft||0)+1;
    this.setData({containerLibrary:containerRows(journal.data.containers),expandedContainerId:''});
    this.dismissContainerSheet();
    if(clear)await this.service.setContainer(null);
   }catch(error){if(!this.unloaded)this.setData({error:error.message||error.errMsg});}
   finally{if(!this.unloaded)this.setData({working:false});}
  },
  revealFinished(e){if(e.detail.animationName==='container-expand')this.triggerEvent('revealed');}
 }
});
