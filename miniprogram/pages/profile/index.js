const {route}=require('../../utils/page');
const {ensurePlan,isPreview,store,currentTheme}=require('../../utils/page');
Page({
 data:{cloudStatus:'idle',cloudError:'',isDevtools:false,previewPages:['Home','Home · no device','Home · pairing','My device','Meal record','Reports'],unit:0,unitSyncing:false,unitError:'',themeProfile:3,profile:null,containerCount:0,error:''},
 onLoad(options={}){this.preview=isPreview(options);this.setData({preview:this.preview,isDevtools:!!getApp().isDevtools});this.journal=store(this.preview);this.units=getApp().unitsFor(this.preview);this.blocked=!ensurePlan(this.preview);},
 onShow(){if(this.blocked)return;this.unsubscribeCloud?.();if(!this.preview)this.unsubscribeCloud=getApp().cloud?.onChange(s=>this.setData({cloudStatus:s.status,cloudError:s.error}));this.unsubscribeUnits?.();this.unsubscribeUnits=this.units?.onChange(s=>this.setData({unit:s.unit,unitSyncing:s.syncing,unitError:s.error}));this.unsubscribe?.();this.unsubscribe=(this.preview?getApp().getPreviewService():getApp().service)?.onChange(s=>this.setData({themeProfile:currentTheme(s)}));const j=this.journal;this.setData({profile:j.data.profile,containerCount:j.data.containers.length,error:j.error});},
 onHide(){this.unsubscribeCloud?.();this.unsubscribe?.();this.unsubscribeUnits?.();},onUnload(){this.unsubscribeCloud?.();this.unsubscribe?.();this.unsubscribeUnits?.();},
 previewPage(e){const i=Number(e.detail.value);if(i===2)route('index',true,'intro=1');else if(i===1)route('index',true,'device=none');else route(['index',null,null,'devices','record','reports'][i],true);},
 async connectCloud(){try{await getApp().cloud.ensureSession();}catch{}},
 toggleUnit(){this.onUnitChange({detail:{value:this.data.unit===0}});},
 onUnitChange(e){try{this.units.setUnit(e.detail.value?1:0);}catch(error){this.setData({unit:this.units.state.unit,unitError:error.message||'Could not save the weight unit.'});}},
 plan(){route('plan',this.preview);},devices(){route('devices',this.preview);},
});
