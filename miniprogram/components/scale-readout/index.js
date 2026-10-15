const OZ=28.349523125;
const format=(grams,unit)=>{const value=Number(grams)/(unit===1?OZ:1),digits=unit===1?2:1;return (Math.sign(value)*Math.round((Math.abs(value)+Number.EPSILON)*10**digits)/10**digits).toFixed(digits);};
Component({
 properties:{value:{type:Number,value:0},total:{type:Number,value:0},totalValid:Boolean,container:{type:Object,value:null},unit:{type:Number,value:0},overload:Boolean},
 data:{editing:false,text:'0.0',digits:[],containerText:'CNTR',totalText:'TOTAL',unitText:'g',displayUnit:0,scaleUnit:1,digitScale:1},
 observers:{'value,total,totalValid,container,unit,overload'(){this.renderValues();}},
 lifetimes:{ready(){this.measure();this.renderValues();}},
 pageLifetimes:{resize(){this.measure();}},
 methods:{
  measure(){this.createSelectorQuery().select('.firmware-scale').boundingClientRect(rect=>{if(rect?.width)this.setData({scaleUnit:rect.width/320});}).exec();},
  renderValues(){
   const p=this.properties,unit=this.data.editing?this.editUnit:p.unit,text=this.data.editing?this.data.text:format(p.value,unit);
   // A frozen/manual net has no live gross: keep TOTAL = net + selected tare.
   const edited=Number(text)*(unit===1?OZ:1),net=this.data.editing&&Number.isFinite(edited)?edited:p.value;
   const total=p.totalValid&&!this.data.editing?p.total:Number(net)+(Number(p.container?.grams)||0);
   this.setData({...(this.data.editing?{}:{text}),digits:text.split('').map((char,index)=>({char,index,decimal:char==='.'})),digitScale:Math.min(1,159/(text.split('').reduce((width,c)=>width+(c==='.'?11:32),0))),displayUnit:unit,containerText:p.container?format(p.container.grams,unit):'CNTR',totalText:p.container?format(total,unit):'TOTAL',unitText:unit===1?'oz':'g'});
  },
  startEdit(){this.editUnit=this.properties.unit;this.setData({editing:true});this.triggerEvent('editstart');},
  input(e){const text=e.detail.value;this.setData({text});this.renderValues();this.triggerEvent('weightinput',{value:text===''?'':Number(text)*(this.editUnit===1?OZ:1)});},
  endEdit(){this.setData({editing:false});this.renderValues();}
 }
});
