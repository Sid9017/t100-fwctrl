const {dayKey}=require('../../lib/t100');
const {route,recordRows,ensurePlan,isPreview,store}=require('../../utils/page');
const {currentTheme}=require('../../utils/page');
Page({
  data:{pageVisible:false,playIntro:false,hasDevice:false,connecting:false,deviceName:'',themeProfile:3,showDeviceSetup:false,addBusy:false,date:dayKey(),today:dayKey(),profile:null,summary:null,records:[],connected:false,isDevtools:false,preview:false,error:'',syncError:'',syncing:false},
  onLoad(options={}){this.preview=isPreview(options);this.forceIntro=this.preview&&options.intro==='1';this.previewNoDevice=this.preview&&options.device==='none';this.journal=store(this.preview);this.setData({preview:this.preview,isDevtools:!!getApp().isDevtools});},
  onShow(){if(!ensurePlan(this.preview))return;if(!this.preview&&getApp().pendingPairingIntro){this.forceIntro=true;getApp().pendingPairingIntro=false;}if(!this.preview){getApp().autoConnect?.show();getApp().planSync?.show();}this.setData({pageVisible:true,date:dayKey(),today:dayKey()});this.refresh();this.unsubscribeJournal?.();this.unsubscribeJournal=this.journal.onChange?.(()=>{this.refresh();if(!this.journal.data.profile)ensurePlan(this.preview);});this.unsubscribe?.();const service=this.preview?getApp().getPreviewService():getApp().service;if(service)this.unsubscribe=service.onChange(s=>{
    const connected=!this.previewNoDevice&&s.connected&&!s.adding;
    const playIntro=!!connected&&!!this.forceIntro;
    if(playIntro)this.forceIntro=false;
    this.setData({syncing:!!(connected&&(s.planSyncing||s.busy||s.actionName)),syncError:s.planSyncError||'',addBusy:!!(s.busy||s.connecting||s.adding),connecting:!!s.connecting,connected,playIntro:this.data.playIntro||playIntro,hasDevice:!this.previewNoDevice&&(!!s.knownDevices?.length||!!s.connected),deviceName:s.device?.name||s.knownDevices?.[0]?.name||'',themeProfile:currentTheme(s)});
  });},
  onHide(){this.setData({pageVisible:false});this.unsubscribe?.();this.unsubscribeJournal?.();},onUnload(){this.unsubscribe?.();this.unsubscribeJournal?.();},
  refresh(){const journal=this.journal;const summary=journal.summary(this.data.date);this.setData({profile:journal.data.profile,summary,records:recordRows(summary.records),error:journal.error});},
  openProfile(){route('profile',this.preview);},openReports(){route('reports',this.preview,'date='+this.data.date);},
  openAddDevice(){if(this.data.hasDevice||this.data.addBusy)return;this.setupIntroPending=true;this.setData({showDeviceSetup:true,error:''});},closeDeviceSetup(e){this.setupIntroPending=false;this.setData({showDeviceSetup:false,...(e.detail.error?{error:e.detail.error}:{})});},
  deviceAdded(){if(!this.setupIntroPending)return;this.setupIntroPending=false;this.setData({showDeviceSetup:false,playIntro:true});},
  pairingFinished(){this.setData({playIntro:false});},
  newMeal(){route('record',this.preview);},editMeal(e){route('record',this.preview,'id='+e.currentTarget.dataset.id);},

});
