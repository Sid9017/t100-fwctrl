const {MiniService,PlanSync,AutoConnect,WeightUnitPreference,JournalStore,PreviewService,renderMiniNotify,dayKey,createDesktopBleApi,WechatGattAdapter}=require('./lib/t100');
const {SkcaleClient}=require('./utils/skcale');
const desktopBleConfig=require('./lib/desktop-ble-config');
App({
  onLaunch(){
    this.isDevtools=(wx.getDeviceInfo?.()||wx.getSystemInfoSync()).platform==='devtools';
    this.journal=new JournalStore(wx,{storageKey:null});
    this.cloud=new SkcaleClient(wx,{journal:this.journal});
    this.cloud.onSessionReady=()=>{if(!this.cloud.profileJob)Promise.resolve().then(()=>this.cloud.restoreProfile()).catch(()=>{});};
    this.cloud.restoreProfile().catch(()=>{});
    try{const adapter=this.isDevtools&&desktopBleConfig?new WechatGattAdapter(createDesktopBleApi(wx,desktopBleConfig)):undefined;this.service=new MiniService(wx,{journal:this.journal,...(adapter?{adapter}:{})});this.units=new WeightUnitPreference(wx,this.service);this.autoConnect=new AutoConnect(this.service);this.planSync=new PlanSync(this.service,this.journal);}catch{this.units=new WeightUnitPreference(wx,null);this.startupError='Bluetooth is unavailable. Use WeChat on your phone.';}
  },
  unitsFor(preview){if(!preview)return this.units;if(!this.previewUnits)this.previewUnits=new WeightUnitPreference(null,this.getPreviewService());return this.previewUnits;},
  journalFor(preview){if(!preview)return this.journal;if(!this.isDevtools)throw new Error('Preview is only available in Devtools');if(!this.previewJournal){this.previewJournal=new JournalStore(null,{memory:true});this.previewJournal.saveProfile({age:30,height:170,weight:65,sex:'female',activity:1,goal:'maintain',target:1800,tdee:2100,carbs:50,protein:25,fat:25,fiber:30});for(const [i,name,kcal,time,meal] of [[1,'Breakfast bowl',350,'08:20','Breakfast'],[2,'Rice & vegetables',620,'12:10','Lunch'],[3,'Afternoon snack',180,'15:30','Snack']])this.previewJournal.saveMeal({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,name,kcal,date:dayKey(),time,meal,weight:250,carbs:30,protein:15,fat:8,fiber:4,rating:4,photos:[]});}return this.previewJournal;},
  getPreviewService(){if(!this.isDevtools)throw new Error('Preview is only available in Devtools');if(!this.previewService)this.previewService=new PreviewService({renderNotify:text=>renderMiniNotify(wx,text)});return this.previewService;},
  onShow(){if(this.cloud&&!this.cloud.profileJob)void this.cloud.restoreProfile().catch(()=>{});if(this.journal?.data.profile){this.autoConnect?.show();this.planSync?.show();}},
  onHide(){this.planSync?.hide();this.autoConnect?.hide();this.service?.flushWeighingState();this.service?.stopScan().catch(()=>{});}
});
