const TYPES=[
  {key:'carbs',name:'Carbohydrates',label:'Carbs',color:'#ff126f',tip:'#ff4095',track:'#4e0926',radius:126},
  {key:'protein',name:'Protein',color:'#b8f500',tip:'#d1ff43',track:'#2f3d08',radius:98},
  {key:'fat',name:'Fat',color:'#00ddc3',tip:'#51f4df',track:'#063b35',radius:70},
  {key:'fiber',name:'Fiber',color:'#57a1ff',tip:'#8ac2ff',track:'#142b48',radius:42}
];
// One calendar ring shows calories consumed relative to that day's target.
function previewSource(summary,selected=false){
  const ratio=summary?.target>0?Math.max(0,Number(summary.consumed)||0)/summary.target:0;
  const length=2*Math.PI*34,progress=Math.min(1,ratio)*length;
  // Match nutrition rings: a continuous track with its rounded start cap at zero.
  const track='<circle cx="48" cy="48" r="34" fill="none" stroke="#f0f4e5" stroke-width="24"/>';
  // Paint selection in the same SVG coordinate space so it meets the inner edge
  // at every display size, with a small overlap to avoid antialiasing seams.
  const center=selected?'<circle cx="48" cy="48" r="22.5" fill="#353535"/>':'';
  const ring=center+track+(progress?`<circle cx="48" cy="48" r="34" fill="none" stroke="#a4ff00" stroke-width="24" stroke-linecap="round" stroke-dasharray="${progress} ${length}" transform="rotate(-90 48 48)"/>`:'<circle cx="48" cy="14" r="12" fill="#a4ff00" data-start-marker="true"/>');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${ring}</svg>`;
  const bytes=new Uint8Array(svg.length);for(let i=0;i<svg.length;i++)bytes[i]=svg.charCodeAt(i);
  return 'data:image/svg+xml;base64,'+wx.arrayBufferToBase64(bytes.buffer);
}
module.exports={TYPES,previewSource};
