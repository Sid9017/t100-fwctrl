const {dayKey,weekSummary}=require('../../lib/t100');
const {isPreview,store,route,recordRows}=require('../../utils/page');
const {ensurePlan,currentTheme}=require('../../utils/page');
const reportMotion=require('../../utils/report-motion');
Page({
 ...reportMotion,
 data:{displayedModeIndex:0,renderedView:'week',modePhase:'',periodPhase:'',periodHeight:'auto',reportModes:[{id:'kcal',label:'KCal'},{id:'kitchen',label:'Kitchen'},{id:'espresso',label:'Espresso'},{id:'pourover',label:'PourOver'}],reportModeIndex:0,themeProfile:3,preview:false,date:dayKey(),today:dayKey(),view:'week',weekEnd:dayKey(),summary:null,records:[],week:null,month:'',monthTitle:'',calendar:[],weekdays:[{id:0,label:'S'},{id:1,label:'M'},{id:2,label:'T'},{id:3,label:'W'},{id:4,label:'T'},{id:5,label:'F'},{id:6,label:'S'}]},
 onLoad(options){this.initMotion();this.preview=isPreview(options);if(!ensurePlan(this.preview)){this.blocked=true;return;}this.journal=store(this.preview);const date=/^\d{4}-\d{2}-\d{2}$/.test(options.date||'')?options.date:dayKey();this.setData({preview:this.preview,date,weekEnd:date,month:date.slice(0,7)});},
 onShow(){if(this.blocked)return;this.motionActive=true;this.refresh();this.unsubscribe?.();this.unsubscribe=(this.preview?getApp().getPreviewService():getApp().service)?.onChange(s=>this.setData({themeProfile:currentTheme(s)}));},onHide(){this.unsubscribe?.();this.stopMotion();},onUnload(){this.unsubscribe?.();this.motionActive=false;this.cancelMotion();},
 refresh(){const s=this.journal.summary(this.data.date),week=weekSummary(this.journal,this.data.weekEnd);this.setData({summary:s,records:recordRows(s.records),week});this.calendar();},
 // Report categories are independent of the device’s physical weighing mode.
 changeReportMode(e){const index=Number(e.detail.value[0]);if(!Number.isInteger(index)||index<0||index>=this.data.reportModes.length)return;if(index===this.data.reportModeIndex)return;this.fadeReportMode(index);},
 view(e){const view=e.currentTarget.dataset.view;if(!['week','month'].includes(view)||view===this.data.view)return;this.setData(view==='week'?{weekEnd:this.data.date}:{month:this.data.date.slice(0,7)});this.refresh();this.animatePeriod(view);},
 calendar(){const [year,month]=this.data.month.split('-').map(Number),start=new Date(year,month-1,1),last=new Date(year,month,0),calendar=[];for(let i=0;i<start.getDay();i++)calendar.push({id:'blank'+i,blank:true});for(let i=1;i<=last.getDate();i++){const date=dayKey(new Date(year,month-1,i)),s=this.journal.summary(date);calendar.push({id:date,date,day:i,recorded:s.recordCount>0,tone:s.tone,selected:date===this.data.date,future:date>dayKey()});}this.setData({calendar,monthTitle:start.toLocaleDateString('en-US',{month:'long',year:'numeric'})});},
 changeMonth(e){const [y,m]=this.data.month.split('-').map(Number),d=new Date(y,m-1+Number(e.currentTarget.dataset.delta),1);this.setData({month:dayKey(d).slice(0,7)});this.calendar();},
 selectDay(e){if(!e.currentTarget.dataset.date||e.currentTarget.dataset.date>dayKey())return;this.setData({date:e.currentTarget.dataset.date});this.refresh();},
 editMeal(e){route('record',this.preview,'id='+e.currentTarget.dataset.id);}
});
