const {MiniService,JournalStore,PreviewService,renderMiniNotify,dayKey}=require('./lib/t100');
App({
  onLaunch(){
    this.isDevtools=(wx.getDeviceInfo?.()||wx.getSystemInfoSync()).platform==='devtools';
    this.journal=new JournalStore(wx);
    try{this.service=new MiniService(wx);}catch{this.startupError='Bluetooth is unavailable. Use WeChat on your phone.';}
  },
  journalFor(preview){if(!preview)return this.journal;if(!this.isDevtools)throw new Error('Preview is only available in Devtools');if(!this.previewJournal){this.previewJournal=new JournalStore(null,{memory:true});this.previewJournal.saveProfile({age:30,height:170,weight:65,sex:'female',activity:1,goal:'maintain',target:1800,tdee:2100,carbs:50,protein:25,fat:25,fiber:30});for(const [i,name,kcal,time,meal] of [[1,'Breakfast bowl',350,'08:20','Breakfast'],[2,'Rice & vegetables',620,'12:10','Lunch'],[3,'Afternoon snack',180,'15:30','Snack']])this.previewJournal.saveMeal({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,name,kcal,date:dayKey(),time,meal,weight:250,carbs:30,protein:15,fat:8,fiber:4,rating:4,photos:[]});}return this.previewJournal;},
  getPreviewService(){if(!this.isDevtools)throw new Error('Preview is only available in Devtools');if(!this.previewService)this.previewService=new PreviewService({renderNotify:text=>renderMiniNotify(wx,text)});return this.previewService;},
  onHide(){this.service?.flushWeighingState();this.service?.stopScan().catch(()=>{});}
});
