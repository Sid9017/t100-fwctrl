const {route,errorText}=require('../../utils/page');
const {wxCall}=require('../../lib/t100');
const {ensurePlan,isPreview,store,currentTheme}=require('../../utils/page');
Page({
 data:{isDevtools:false,previewPages:['Home','Home · no device','Pairing animation','Device','Firmware','Meal record','Reports'],themeProfile:3,profile:null,recordCount:0,containerCount:0,pendingDeletes:0,error:'',backupPath:''},
 onLoad(options={}){this.preview=isPreview(options);this.setData({isDevtools:!!getApp().isDevtools});this.journal=store(this.preview);this.blocked=!ensurePlan(this.preview);},
 onShow(){if(this.blocked)return;this.unsubscribe?.();this.unsubscribe=(this.preview?getApp().getPreviewService():getApp().service)?.onChange(s=>this.setData({themeProfile:currentTheme(s)}));const j=this.journal;this.setData({profile:j.data.profile,recordCount:j.data.records.length,containerCount:j.data.containers.length,pendingDeletes:(j.data.deletions||[]).length,error:j.error});},
 onHide(){this.unsubscribe?.();},onUnload(){this.unsubscribe?.();},
 previewPage(e){const i=Number(e.detail.value);if(i===2)wx.navigateTo({url:'/pairing/index?preview=1'});else if(i===1)route('index',true,'device=none');else route(['index',null,null,'device','firmware','record','reports'][i],true);},
 plan(){route('plan',this.preview);},devices(){route('devices',this.preview);},reports(){route('reports',this.preview);},
 async exportJournal(){try{const filePath=wx.env.USER_DATA_PATH+'/KCALACK-journal.json';await wxCall(wx.getFileSystemManager(),'writeFile',{filePath,data:JSON.stringify(getApp().journal.data,null,2),encoding:'utf8'});this.setData({backupPath:filePath,error:''});}catch(e){this.setData({error:errorText(e)});}},
 shareJournal(){wx.shareFileMessage({filePath:this.data.backupPath,fileName:'KCALACK-journal.json',fail:e=>this.setData({error:errorText(e)})});}
});
