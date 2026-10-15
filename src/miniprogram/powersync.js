import {Buffer} from 'buffer';

// Read-only adapter for the existing PowerSync HTTP protocol. Each connection starts
// from a fresh snapshot; only a checksum-validated complete checkpoint is published.
// https://github.com/powersync-ja/powersync-service/blob/main/docs/specs/sync-protocol.md
const cmp=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
const opId=value=>{if(typeof value!=='string'||!/^\d+$/.test(value))throw new Error('Invalid sync position.');return value.replace(/^0+(?=\d)/,'');};
const json=value=>typeof value==='string'?JSON.parse(value):value;
export class MealCheckpoint {
  constructor(recordId,scope='meal'){this.scope=scope;this.recordId=recordId;this.buckets=new Map();this.pending=new Map();this.expected=null;this.last=null;this.count=0;this.bytes=0;}
  line(line){
    if(line.checkpoint){this.last=opId(line.checkpoint.last_op_id);this.expected=new Map(line.checkpoint.buckets.map(b=>[b.bucket,b]));}
    if(line.checkpoint_diff){
      if(!this.expected)throw new Error('Missing sync checkpoint.');
      const diff=line.checkpoint_diff;this.last=opId(diff.last_op_id);
      for(const name of diff.removed_buckets)this.expected.delete(name);
      for(const bucket of diff.updated_buckets)this.expected.set(bucket.bucket,bucket);
    }
    if(line.data){
      const {bucket,data}=line.data;
      if(!Array.isArray(data))throw new Error('Invalid sync data.');
      this.count+=data.length;this.bytes+=JSON.stringify(data).length;if(this.bytes>32*1024*1024)throw new Error('The meal sync is too large. Please retry.');if(this.count>250000)throw new Error('The meal sync is too large. Please retry.');
      const ops=this.pending.get(bucket)||[];for(const operation of data){opId(operation.op_id);ops.push(operation);}this.pending.set(bucket,ops);
    }
    if(!line.checkpoint_complete||!this.expected||opId(line.checkpoint_complete.last_op_id)!==this.last)return null;
    const next=new Map();
    for(const [name,expected] of this.expected){
      const old=this.buckets.get(name),state={checksum:old?.checksum||0,after:old?.after??null,rows:new Map(old?.rows)};
      const future=[];
      for(const op of this.pending.get(name)||[]){
        const id=opId(op.op_id);if(cmp(id,this.last)>0){future.push(op);continue;}if(state.after!==null&&cmp(id,state.after)<=0)continue;
        if(!Number.isInteger(op.checksum))throw new Error('Missing sync checksum.');
        const key=JSON.stringify([op.object_type,op.object_id,op.subkey||'']);
        if(op.op==='CLEAR'){state.rows.clear();state.checksum=op.checksum>>>0;}
        else{
          state.checksum=(state.checksum+op.checksum)>>>0;
          if(op.op==='REMOVE')state.rows.delete(key);
          else if(op.op==='PUT'){
            const row=json(op.data);
            if((this.scope==='profile'&&['users','user_profiles','user_plans'].includes(op.object_type)&&op.object_id===this.recordId)||(op.object_type==='intake_records'&&op.object_id===this.recordId)||(op.object_type==='intake_photos'&&row.record_id===this.recordId))state.rows.set(key,{id:op.object_id,type:op.object_type,row,opId:id});
            else state.rows.delete(key);
          }else if(op.op!=='MOVE')throw new Error('Unsupported sync operation.');
        }
        state.after=id;
      }
      if(!Number.isInteger(expected.checksum)||state.checksum!==(expected.checksum>>>0))throw new Error('Meal sync checksum mismatch. Please retry.');
      next.set(name,state);this.pending.set(name,future);
    }
    this.buckets=next;
    for(const name of this.pending.keys())if(!this.expected.has(name))this.pending.delete(name);
    const rows=new Map();for(const bucket of next.values())for(const item of bucket.rows.values()){
      const key=item.type+':'+item.id,previous=rows.get(key);if(!previous||cmp(item.opId,previous.opId)>0)rows.set(key,item);
    }
    if(this.scope==='profile'){
      const camel=row=>row&&Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),value]));
      const user=camel(rows.get('users:'+this.recordId)?.row),nutrition=camel(rows.get('user_profiles:'+this.recordId)?.row),plan=camel(rows.get('user_plans:'+this.recordId)?.row);
      if(!user)throw new Error('Account sync is incomplete. Please retry.');
      return {complete:true,profile:nutrition&&plan?{...user,id:this.recordId,nutrition,plan}:null};
    }
    const record=rows.get('intake_records:'+this.recordId)?.row;if(!record)return null;
    const macro=r=>({carbG:r.carbs_g,proteinG:r.protein_g,fatG:r.fat_g,fiberG:r.fiber_g});
    return {id:this.recordId,analysisId:record.analysis_id,analysisStatus:record.analysis_status,analysisError:record.analysis_error?json(record.analysis_error):null,
      foodName:record.food_name,caloriesRecommended:record.calories_recommended,macro:macro(record),suggestion:record.suggestion,weightQuality:record.weight_quality,
      photos:[...rows.values()].filter(item=>item.type==='intake_photos').sort((a,b)=>a.row.sort_index-b.row.sort_index).map(({id,row})=>({photoId:id,...(row.after_key?{after:{key:row.after_key,...(row.after_weight_g!=null?{weightG:row.after_weight_g}:{}),weightType:row.after_weight_type||'NET',...(row.after_container_id?{containerId:row.after_container_id}:{})}}:{}),before:{key:row.key,foodName:row.food_name,weightG:row.weight_g,intakeWeightG:row.intake_weight_g,calories:row.calories,macro:macro(row),items:row.items?json(row.items):[]}}))};
  }
}

export class SyncLines {
  constructor(receive){this.receive=receive;this.parts=[];this.size=0;}
  push(chunk){
    const bytes=new Uint8Array(chunk);let start=0;
    for(let i=0;i<bytes.length;i++)if(bytes[i]===10){this.part(bytes.subarray(start,i));const text=Buffer.concat(this.parts,this.size).toString('utf8').trim();this.parts=[];this.size=0;if(text)this.receive(JSON.parse(text));start=i+1;}
    this.part(bytes.subarray(start));
  }
  part(bytes){this.size+=bytes.length;if(this.size>16*1024*1024)throw new Error('Sync message is too large.');if(bytes.length)this.parts.push(Buffer.from(bytes));}
}

export class PowerSyncReader {
  constructor(api,{origin,credentials,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeout=45000,attempts=4}={}){Object.assign(this,{api,origin,credentials,wait,timeout,attempts});}
  async readRecord(id,{untilDone=false,jobId,excludeJobId,ownerId,scope='meal',cancelled=()=>false}={}){
    let error;
    for(let i=0;i<this.attempts;i++){
      if(cancelled())throw Object.assign(new Error('Analysis cancelled.'),{code:'CANCELLED'});
      const session=await this.credentials(error?.status===401);
      if(cancelled())throw Object.assign(new Error('Analysis cancelled.'),{code:'CANCELLED'});
      if(ownerId&&session.user?.id!==ownerId)throw new Error('Your account changed. Please retry.');
      try{return await this.connect(id,session.accessToken,{untilDone,jobId,excludeJobId,cancelled,scope});}
      catch(e){error=e;if(e.code==='CANCELLED'||e.code==='ANALYSIS_FAILED'||[400,403,404].includes(e.status))throw e;}
      if(i+1<this.attempts)await this.wait(1000*(i+1));
    }
    throw error;
  }
  connect(id,token,{untilDone,jobId,excludeJobId,cancelled,scope}){
    return new Promise((resolve,reject)=>{
      let task,finished=false,received=false,status=0;
      const checkpoint=new MealCheckpoint(id,scope);
      const finish=(error,value)=>{if(finished)return;finished=true;clearInterval(cancelTimer);task?.abort();error?reject(error):resolve(value);};
      const cancelTimer=setInterval(()=>{if(cancelled())finish(Object.assign(new Error('Analysis cancelled.'),{code:'CANCELLED'}));},250);
      const lines=new SyncLines(line=>{
        if(finished)return;
        if(line.error)throw Object.assign(new Error(line.error.description||'Meal sync failed.'),{status:line.error.status});
        const result=checkpoint.line(line);if(!result)return;
        if(jobId&&result.analysisId!==jobId)return;
        if(excludeJobId!==undefined&&(!result.analysisId||result.analysisId===excludeJobId))return;
        if(untilDone&&result.analysisStatus==='FAILED')return finish(Object.assign(new Error(result.analysisError?.message||'Could not analyze this meal.'),{code:'ANALYSIS_FAILED'}));
        if(!untilDone||result.analysisStatus==='DONE')finish(null,result);
      });
      const consume=data=>{if(finished)return;try{lines.push(data);}catch(error){finish(error);}};
      try{task=this.api.request({url:this.origin+'/powersync/sync/stream',method:'POST',enableChunked:true,responseType:'arraybuffer',dataType:'text',timeout:this.timeout,
        header:{'Content-Type':'application/json',Accept:'application/x-ndjson',Authorization:'Token '+token},
        data:{raw_data:true,include_checksum:true,parameters:{},streams:{include_defaults:false,subscriptions:(scope==='profile'?['users','user_profiles','user_plans']:['intake_records','intake_photos']).map(stream=>({stream,parameters:null,override_priority:null}))}},
        success:response=>{if(finished)return;status=response.statusCode;if(status!==200)return finish(Object.assign(new Error('Meal sync is unavailable ('+status+').'),{status}));if(!received&&response.data)consume(response.data);if(!finished)finish(new Error('Meal sync ended before the result arrived.'));},
        fail:error=>{if(!finished)finish(new Error(error.errMsg||'Meal sync disconnected.'));}
      });
      task.onHeadersReceived?.(response=>{status=response.statusCode;if(status&&status!==200)finish(Object.assign(new Error('Meal sync is unavailable ('+status+').'),{status}));});
      task.onChunkReceived?.(event=>{received=true;consume(event.data);});
      }catch(error){finish(error);}
    });
  }
}
