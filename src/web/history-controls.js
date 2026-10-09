/** Native vertical scrolling + snap, with matching keyboard and click selection. */
export function wheel(host, input, items, rowHeight, onSelect = () => {}) {
  let selected = Math.max(0, items.findIndex(item => item.value === input.value));
  const locked = () => input.disabled || Boolean(host.closest('fieldset')?.disabled);
  let drag = null, suppressClick = false;
  const options = items.map((item, index) => {
    const option = document.createElement('div');
    option.id = `${host.id}-option-${index}`;
    option.className = 'history-wheel-option'; option.setAttribute('role','option');
    option.dataset.value = item.value;
    if (item.image) { const img=document.createElement('img');img.src=item.image;img.alt='';img.draggable=false;option.append(img);option.title=item.label; }
    const label=document.createElement('span');label.textContent=item.label;option.append(label);
    option.addEventListener('click', () => { if (!locked() && !suppressClick) choose(index, true); });
    return option;
  });
  host.replaceChildren(...options);
  function choose(index, scroll = false) {
    selected = Math.max(0,Math.min(items.length-1,index));
    const changed = input.value !== items[selected].value;
    input.value = items[selected].value;
    options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===selected)));
    host.setAttribute('aria-activedescendant',options[selected].id);
    if(scroll) host.scrollTo({top:selected*rowHeight,behavior:'instant'});
    if(changed) onSelect(input.value);
  }
  host.addEventListener('scroll',()=>{
    if(locked()) { host.scrollTop=selected*rowHeight;return; }
    choose(Math.round(host.scrollTop/rowHeight));
  });
  host.addEventListener('pointerdown', event => {
    suppressClick = false;
    if (locked() || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
    drag = {id:event.pointerId,y:event.clientY,top:host.scrollTop,moved:false};
    host.focus({preventScroll:true});
    event.preventDefault();
  });
  host.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || locked()) return;
    const dy=event.clientY-drag.y;
    if (!drag.moved && Math.abs(dy)<3) return;
    drag.moved=true; suppressClick=true;
    host.classList.add('is-dragging');host.setPointerCapture(event.pointerId);
    host.scrollTop=drag.top-dy;
    choose(Math.round(host.scrollTop/rowHeight));
  });
  const finishDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const moved=drag.moved;drag=null;
    host.classList.remove('is-dragging');
    if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);
    if(moved)host.scrollTo({top:selected*rowHeight,behavior:'smooth'});
  };
  for(const name of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(name,finishDrag);
  host.addEventListener('pointerleave',()=>{if(drag && !drag.moved)drag=null;});
  host.addEventListener('keydown',event=>{
    if(locked())return;
    let next;
    if(event.key==='ArrowDown')next=selected+1;
    else if(event.key==='ArrowUp')next=selected-1;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=items.length-1;
    else return;
    event.preventDefault(); event.stopPropagation(); choose(next,true);
  });
  choose(selected);
  return {sync:()=>choose(Math.max(0,items.findIndex(item=>item.value===input.value)),true)};
}

export function renderHistoryControls(items) {
  const choices=items.map(item=>({value:item.file,label:item.label,image:item.dataUrl}));
  ['simHistPhoto1','simHistPhoto2','simHistPhoto3'].forEach((id,index)=>{
    wheel(document.getElementById(`historyImageWheel${index+1}`),document.getElementById(id),choices,20);
  });
  const rating=document.getElementById('simHistRating');
  const stars=[...document.querySelectorAll('[data-history-rating]')];
  const paint=()=>stars.forEach(star=>{
    const n=Number(star.dataset.historyRating);
    star.classList.toggle('is-filled',n<=Number(rating.value));
    star.setAttribute('aria-checked',String(n===Number(rating.value)));
    star.tabIndex=n===Number(rating.value)?0:-1;
  });
  stars.forEach((star,index)=>{
    star.addEventListener('click',()=>{rating.value=String(index+1);paint();});
    star.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const next=event.key==='Home'?0:event.key==='End'?4:Math.max(0,Math.min(4,index+(['ArrowRight','ArrowUp'].includes(event.key)?1:-1)));
      stars[next].click();stars[next].focus();
    });
  });
  const group=document.querySelector('.history-rating');
  let gesture=null, blockClick=false;
  const chooseAt=x=>{
    let nearest=0,distance=Infinity;
    stars.forEach((star,i)=>{const r=star.getBoundingClientRect();const d=Math.abs(x-r.x-r.width/2);if(d<distance){distance=d;nearest=i;}});
    rating.value=String(nearest+1);paint();
  };
  group.addEventListener('pointerdown',event=>{
    if(group.closest('fieldset').disabled || event.button!==0 || !event.isPrimary)return;
    event.preventDefault();event.stopPropagation();blockClick=false;
    gesture={id:event.pointerId,x:event.clientX};
    group.setPointerCapture(event.pointerId);chooseAt(event.clientX);
    stars[Number(rating.value)-1].focus({preventScroll:true});
  });
  group.addEventListener('pointermove',event=>{
    if(!gesture || gesture.id!==event.pointerId || group.closest('fieldset').disabled)return;
    if(Math.abs(event.clientX-gesture.x)>3)blockClick=true;
    chooseAt(event.clientX);
  });
  const finishRating=event=>{
    if(!gesture || gesture.id!==event.pointerId)return;
    gesture=null;
    if(group.hasPointerCapture(event.pointerId))group.releasePointerCapture(event.pointerId);
  };
  for(const name of ['pointerup','pointercancel','lostpointercapture'])group.addEventListener(name,finishRating);
  group.addEventListener('click',event=>{if(blockClick && event.detail>0){event.preventDefault();event.stopImmediatePropagation();}},true);
  paint();
}
