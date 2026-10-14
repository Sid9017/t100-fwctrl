const KEY='kcalack.t100.devices.v1';
const valid=row=>row&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=256&&typeof row.name==='string'&&/^YD-[0-9a-f]{12}$/i.test(row.name)&&Number.isFinite(row.lastConnectedAt)&&row.lastConnectedAt>0&&row.lastConnectedAt<=8640000000000000;
const firmwareOf=row=>typeof row?.firmware==='string'&&row.firmware.length<=80&&row.firmware!=='--'?{firmware:row.firmware}:{};
const weighing=s=>s&&[0,1,2,3].includes(s.profile)&&[0,1].includes(s.unit)&&Number.isFinite(s.updatedAt)?{profile:s.profile,unit:s.unit,stage:[0,1,2].includes(s.stage)?s.stage:0,valueText:typeof s.valueText==='string'?s.valueText.slice(0,24):'--',unitText:s.unit===1?'oz':'g',updatedAt:s.updatedAt}:null;
/** Connection history belongs to this Mini Program's local storage. */
export class KnownDeviceStore {
  constructor(api){
    this.api=api;this.devices=[];this.loadError='';
    try{
      const data=api.getStorageSync?.(KEY);
      if(data?.version===1&&Array.isArray(data.devices)){
        const unique=new Map();
        for(const row of data.devices.filter(valid))unique.set(row.id,{id:row.id,name:row.name,lastConnectedAt:row.lastConnectedAt,...firmwareOf(row),...(weighing(row.lastWeighing)?{lastWeighing:weighing(row.lastWeighing)}:{})});
        this.devices=[...unique.values()].sort((a,b)=>b.lastConnectedAt-a.lastConnectedAt).slice(0,1);
      }
    }catch{this.loadError='Could not load your saved devices.';}
  }
  list(){return this.devices.map(row=>({...row}));}
  remember(device,now=Date.now()){
    const row={id:device.id,name:device.name,lastConnectedAt:now};
    if(!valid(row))throw new Error('Invalid device identity');
    if(this.devices[0]&&this.devices[0].name.toLowerCase()!==row.name.toLowerCase())throw new Error('Remove your current device before adding another.');
    const previous=this.devices[0];const next=[{...row,...firmwareOf(previous),...firmwareOf(device),...(previous?.lastWeighing?{lastWeighing:previous.lastWeighing}:{})}];
    if(typeof this.api.setStorageSync!=='function')throw new Error('Local device storage is unavailable');
    this.api.setStorageSync(KEY,{version:1,devices:next});this.devices=next;return this.list();
  }
  remove(){this.api.setStorageSync(KEY,{version:1,devices:[]});this.devices=[];return this.list();}
  saveWeighing(snapshot){const lastWeighing=weighing(snapshot);if(!lastWeighing||!this.devices.length)return this.list();const next=[{...this.devices[0],lastWeighing}];this.api.setStorageSync(KEY,{version:1,devices:next});this.devices=next;return this.list();}
}
