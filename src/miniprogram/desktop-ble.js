// Native wx BLE-shaped transport for the development-only Mac loopback bridge.
// The phone always uses wx directly; no global wx API is replaced.
export function createDesktopBleApi(wx,config) {
  if((wx.getDeviceInfo?.()||wx.getSystemInfoSync?.()||{}).platform!=='devtools')throw new Error('Desktop BLE is only available in Devtools');
  if(config?.url!=='http://127.0.0.1:8768/rpc'||typeof config.token!=='string'||config.token.length<32)throw new Error('Invalid desktop BLE configuration');
  const client=`${Date.now()}-${Math.random().toString(36).slice(2)}`,listeners=new Map(),connections=new Set();
  let ready=null,cursor=0,polling=false,closed=false;
  const emit=(name,data)=>{for(const fn of listeners.get(name)||[])fn(data);};
  const decode=data=>({...data,...(Array.isArray(data.value)?{value:Uint8Array.from(data.value).buffer}:{}),
    ...(data.devices?{devices:data.devices.map(d=>({...d,advertisData:Uint8Array.from(d.advertisData||[]).buffer}))}:{})});
  const request=body=>new Promise((resolve,reject)=>wx.request({url:config.url,method:'POST',timeout:17000,
    header:{'content-type':'application/json',Authorization:`Bearer ${config.token}`},data:{...body,client},
    success:r=>{if(r.statusCode===200&&r.data?.ok)resolve(r.data.result);else reject(new Error(r.data?.error||'Desktop BLE bridge rejected the request'));},
    fail:()=>reject(new Error('Mac Bluetooth bridge is unavailable. Run npm run dev:ble, then recompile Devtools.'))}));
  const poll=async()=>{
    if(polling||closed)return;polling=true;
    try{while(!closed){const result=await request({method:'events',cursor});if(closed)break;for(const item of result.events||[]){
      cursor=item.seq;const data=decode(item.data);
      if(item.event==='BLEConnectionStateChange'){if(data.connected)connections.add(data.deviceId);else connections.delete(data.deviceId);}
      emit(item.event,data);
    }}}
    catch(error){ready=null;for(const deviceId of connections)emit('BLEConnectionStateChange',{deviceId,connected:false});connections.clear();console.warn('[Desktop BLE]',error.message);}
    finally{polling=false;}
  };
  const ensure=()=>{if(!ready){closed=false;ready=request({method:'hello'}).then(result=>{cursor=result.cursor;void poll();}).catch(error=>{ready=null;throw error;});}return ready;};
  const api={getDeviceInfo:()=>({platform:'mac'}),desktopBridge:true};
  for(const name of ['BluetoothDeviceFound','BLECharacteristicValueChange','BLEConnectionStateChange']){
    listeners.set(name,new Set());api[`on${name}`]=fn=>listeners.get(name).add(fn);api[`off${name}`]=fn=>listeners.get(name).delete(fn);
  }
  for(const method of ['openBluetoothAdapter','getBluetoothAdapterState','startBluetoothDevicesDiscovery','stopBluetoothDevicesDiscovery','getBluetoothDevices','createBLEConnection','closeBLEConnection','closeBluetoothAdapter','getBLEMTU','getBLEDeviceServices','getBLEDeviceCharacteristics','readBLECharacteristicValue','writeBLECharacteristicValue','notifyBLECharacteristicValueChange']){
    api[method]=(options={})=>{
      const {success,fail,complete,...args}=options;
      if(args.value instanceof ArrayBuffer)args.value=Array.from(new Uint8Array(args.value));
      void ensure().then(()=>request({method,options:args})).then(result=>{
        if(method==='closeBluetoothAdapter'){closed=true;ready=null;}
        const value=decode(result);success?.(value);complete?.(value);
      },error=>{const value={errMsg:error.message};fail?.(value);complete?.(value);});
    };
  }
  return api;
}
