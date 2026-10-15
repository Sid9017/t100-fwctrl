const {dayKey,weekSummary}=require('../../lib/t100');
const {isPreview,store,route,recordRows,ensurePlan,currentTheme}=require('../../utils/page');
const {previewSource}=require('../../utils/nutrition-rings');
const reportMotion=require('../../utils/report-motion');
Page({
 ...reportMotion,
 data:{displayedModeIndex:0,modePhase:'',requestedRow:-1,expandedRow:-1,weekPhase:'',weekHeight:'0px',reportModes:[{id:'kcal',label:'KCal'},{id:'kitchen',label:'Kitchen'},{id:'espresso',label:'Espresso'},{id:'pourover',label:'PourOver'}],reportModeIndex:0,themeProfile:3,preview:false,date:dayKey(),today:dayKey(),summary:null,records:[],week:null,month:'',monthTitle:'',calendar:[],calendarRows:[],monthStats:null,weekdays:[{id:0,label:'S'},{id:1,label:'M'},{id:2,label:'T'},{id:3,label:'W'},{id:4,label:'T'},{id:5,label:'F'},{id:6,label:'S'}]},
 onLoad(options={}){this.initMotion();this.preview=isPreview(options);if(!ensurePlan(this.preview)){this.blocked=true;return;}this.journal=store(this.preview);const date=/^\d{4}-\d{2}-\d{2}$/.test(options.date||'')&&options.date<=dayKey()?options.date:dayKey();this.setData({preview:this.preview,date,month:date.slice(0,7)});},
 onShow(){if(this.blocked)return;this.motionActive=true;this.setData({today:dayKey()});this.refresh();this.unsubscribe?.();this.unsubscribe=(this.preview?getApp().getPreviewService():getApp().service)?.onChange(s=>this.setData({themeProfile:currentTheme(s)}));},onHide(){this.unsubscribe?.();this.stopMotion();},onUnload(){this.unsubscribe?.();this.motionActive=false;this.cancelMotion();},
 refresh(){const summary=this.journal.summary(this.data.date);this.setData({summary,records:recordRows(summary.records)});this.calendar();},
 changeReportMode(e){const index=Number(e.detail.value[0]);if(!Number.isInteger(index)||index<0||index>=this.data.reportModes.length||index===this.data.reportModeIndex)return;this.fadeReportMode(index);},
 calendar(){
  const [year,month]=this.data.month.split('-').map(Number),start=new Date(year,month-1,1),last=new Date(year,month,0),calendar=[],summaries=[];
  for(let i=0;i<start.getDay();i++)calendar.push({id:'blank'+i,blank:true});
  for(let i=1;i<=last.getDate();i++){
    const date=dayKey(new Date(year,month-1,i)),s=this.journal.summary(date),future=date>dayKey();if(!future)summaries.push(s);
    calendar.push({id:date,date,day:i,row:Math.floor(calendar.length/7),selected:date===this.data.date,today:date===dayKey(),future,preview:previewSource(s,date===this.data.date),recordCount:s.recordCount});
  }
  while(calendar.length%7)calendar.push({id:'blank'+calendar.length,blank:true});
  const calendarRows=[];
  for(let i=0;i<calendar.length;i+=7){
    const end=new Date(year,month-1,1-start.getDay()+i+6);
    calendarRows.push({id:i/7,days:calendar.slice(i,i+7),end:dayKey(end)});
  }
  const recorded=summaries.filter(s=>s.calorieRecordCount),total=recorded.reduce((sum,s)=>sum+s.consumed,0);
  this.setData({calendar,calendarRows,monthStats:{total,recordedDays:recorded.length,average:recorded.length?Math.round(total/recorded.length):0},monthTitle:start.toLocaleDateString('en-US',{month:'long',year:'numeric'})});
 },
 changeMonth(e){this.settleMotion();const [y,m]=this.data.month.split('-').map(Number),d=new Date(y,m-1+Number(e.currentTarget.dataset.delta),1);this.setData({month:dayKey(d).slice(0,7)});this.calendar();},
 selectDay(e){const date=e.currentTarget.dataset.date;if(!date||date>dayKey())return;this.setData({date});this.refresh();},
 selectCalendarDay(e){const date=e.currentTarget.dataset.date;if(!date||date>dayKey())return;this.selectDay(e);this.openWeek(Number(e.currentTarget.dataset.row));},
 selectWeek(e){const row=Number(e.currentTarget.dataset.row),days=this.data.calendarRows[row]?.days.filter(d=>!d.blank&&!d.future);if(!days?.length)return;if(!days.some(d=>d.date===this.data.date)){this.setData({date:days[days.length-1].date});this.refresh();}this.openWeek(row);},
 openWeek(row){
  const item=this.data.calendarRows[row];if(!item||this.data.modePhase)return;
  const week=weekSummary(this.journal,item.end);
  const maximum=Math.max(0,...week.days.map(day=>Math.max(day.target||0,day.date<=dayKey()?day.consumed:0)));
  const rawStep=(maximum||1500)/3,power=10**Math.floor(Math.log10(rawStep));
  const step=[1,2,5,10].find(value=>value*power>=rawStep)*power,ceiling=step*3;
  week.axis=[0,1,2,3].map(index=>({value:index*step,position:index/3*100}));
  week.days=week.days.map(day=>({...day,future:day.date>dayKey(),height:day.date<=dayKey()?day.consumed/ceiling*100:0,targetHeight:day.target===null?null:day.target/ceiling*100}));
  this.animateWeek(row,week);
 },
 collapseWeek(){if(!this.data.modePhase&&this.data.requestedRow>=0)this.animateWeek(-1,null);},
 noop(){},
 editMeal(e){route('record',this.preview,'id='+e.currentTarget.dataset.id);}
});
