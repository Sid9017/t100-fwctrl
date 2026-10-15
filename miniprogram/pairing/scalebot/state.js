const DURATION=2.85;
const ICON_BOUNDS={minX:24,minY:30,maxX:44,maxY:50};
function connectionState(s={}){
  if(s.connecting||s.adding)return 'Connecting';
  if(!s.connected)return 'Disconnected';
  return s.planSyncing||s.busy||s.actionName?'Syncing':'Connected';
}
// Frame the same Rive endpoint over the measured brand icon on every phone size.
function pairingBounds(anchor,viewport){
  const scale=anchor.width/20;
  const minX=34-(anchor.left+anchor.width/2-viewport.left)/scale;
  const minY=40-(anchor.top+anchor.height/2-viewport.top)/scale;
  return {minX,minY,maxX:minX+viewport.width/scale,maxY:minY+viewport.height/scale};
}
module.exports={DURATION,ICON_BOUNDS,connectionState,pairingBounds};
