import {oadVersion} from '../web/ota-format.js';
const profiles=['Kitchen','Espresso','PourOver','KCal'];
const infoNames=['','Container','Total','Last add','Time','Flow'];
const infoText=field=>{
  if(!field?.valid)return '--';
  if(field.kind===4)return `${field.value} s`;
  return `${(field.value/1000).toFixed(1)} ${field.kind===5?'g/s':'g'}`;
};
export function viewModel(state) {
  const reading=state.reading,status=state.status;
  const known=state.knownDevices||[],nearby=state.nearbyDevices||[];
  const knownIds=new Set(known.map(row=>row.id));
  const decorate=row=>({...row,shortId:row.id.length>12?`…${row.id.slice(-12)}`:row.id,
    connecting:state.connectingDeviceId===row.id,rssiText:Number.isFinite(row.rssi)?` · ${row.rssi} dBm`:'',
    signal:row.cached?'Previously seen':Number.isFinite(row.rssi)?row.rssi>=-60?'Strong signal':row.rssi>=-80?'Good signal':'Weak signal':'Nearby'});
  const knownDeviceRows=known.map(row=>{
    const broadcast=nearby.find(device=>!device.cached&&(device.id===row.id||device.name.toLowerCase()===row.name.toLowerCase()));
    const connected=state.connected&&(state.device?.id===row.id||state.device?.name?.toLowerCase()===row.name.toLowerCase());
    return {...decorate({...row,...(broadcast?{id:broadcast.id,rssi:broadcast.rssi,cached:false}:{cached:true})}),connected,
      presence:connected?'Connected':broadcast?'Nearby':state.scanning?'Checking…':state.scanComplete?'Not seen in this scan':'Not checked',
      available:connected||!!broadcast,lastConnectedText:new Date(row.lastConnectedAt).toLocaleString()};
  });
  const knownNames=new Set(known.map(row=>row.name.toLowerCase()));
  const newDevices=(state.devices||[]).filter(row=>!knownIds.has(row.id)&&!knownNames.has(row.name.toLowerCase())).map(decorate);
  const profile=state.lastWeighingState?.profile??status?.coffee?.profile??reading?.profile??known[0]?.lastWeighing?.profile??3;
  const bound=status?!!(status.flags&1):false;
  const sameFirmware=!!state.firmwareInfo&&oadVersion(state.firmware)===state.firmwareInfo.version;
  return {...state,profile,bound,canControl:!!(state.connected&&bound&&state.hasAuth&&!state.busy&&!state.connecting),sameFirmware,canOad:!!(state.connected&&bound&&state.hasAuth&&state.firmwareInfo&&!sameFirmware&&oadVersion(state.firmware)&&!state.busy&&!state.firmwareLoading),
    hasPublishedUpdate:!!(state.connected&&state.firmwareSource==='published'&&state.firmwareInfo&&!sameFirmware&&oadVersion(state.firmware)),
    modeIndex:[3,0,1,2].indexOf(profile),unitIndex:reading?.unit??state.lastWeighingState?.unit??0,progressText:Number(state.oadProgress||0).toFixed(1),
    uploadedText:state.firmwareInfo?.uploadedAt?new Date(state.firmwareInfo.uploadedAt).toLocaleString():'Local file',firmwareSize:state.firmwareInfo?`${(state.firmwareInfo.size/1024).toFixed(1)} KB`:'',
    knownDeviceRows,hasKnownDevices:known.length>0,newNearbyDevices:newDevices.filter(row=>!row.cached),previouslySeenDevices:newDevices.filter(row=>row.cached),otherNearbyDevices:nearby.filter(row=>!row.isT100&&!knownIds.has(row.id)).map(decorate),
    stateLabel:state.connecting?'Connecting':state.connected?'Connected':'Disconnected',
    deviceName:state.device?.name||'No device selected',
    weightText:reading?.valueText||'--',unitText:reading?.unitText||'g',
    profileName:profiles[profile]||'--',
    screenName:status?.screenName?.replaceAll('_',' ')||'Waiting for device',
    phaseName:status?.phaseName?.replaceAll('_',' ')||'',
    bindingText:status?((status.flags&1)?'Bound':'Unbound'):'--',
    batteryText:state.battery!==null && state.battery>=0?`${state.battery}%`:'--',
    mtuText:state.mtu===null?'Unknown':String(state.mtu),
    upperLabel:infoNames[reading?.upper?.kind]||'Info',upperText:infoText(reading?.upper),
    lowerLabel:infoNames[reading?.lower?.kind]||'Info',lowerText:infoText(reading?.lower)
  };
}
