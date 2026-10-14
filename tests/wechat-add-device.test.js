import test from 'node:test';
import assert from 'node:assert/strict';
import {MiniService} from '../src/miniprogram/service.js';
function fixture(){const calls=[],phases=[];const service={state:{},update(p){Object.assign(this.state,p);phases.push({...this.state});},async connect(id){calls.push(['connect',id]);},async invoke(name){calls.push(['invoke',name]);}};return {service,calls,phases};}
test('explicit device addition connects then invokes the shared bind/emotion/reboot flow',async()=>{
 const f=fixture();await MiniService.prototype.addDevice.call(f.service,'A');
 assert.deepEqual(f.calls,[['connect','A'],['invoke','bindDevice']]);assert.equal(f.phases[0].adding,true);assert.equal(f.phases[1].setupPhase,'binding');assert.equal(f.service.state.adding,false);
});
test('setup failure releases its lock and retries without declaring success',async()=>{
 const f=fixture();f.service.invoke=async()=>{throw new Error('Upload failed');};
 await assert.rejects(MiniService.prototype.addDevice.call(f.service,'A'),/Upload failed/);assert.equal(f.service.state.adding,false);assert.equal(f.service.state.setupPhase,'');
 f.service.invoke=async name=>f.calls.push(['invoke',name]);await MiniService.prototype.addDevice.call(f.service,'A');assert.deepEqual(f.calls.at(-1),['invoke','bindDevice']);
});
test('an in-progress setup rejects duplicate additions before another connection or command',async()=>{
 const f=fixture();f.service.state.adding=true;await assert.rejects(MiniService.prototype.addDevice.call(f.service,'A'),/Wait for device setup/);assert.deepEqual(f.calls,[]);
});
