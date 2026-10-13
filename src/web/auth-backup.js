export function mountAuthBackup(api) {
  const byId=id=>document.getElementById(id);
  const dialog=byId('authBackupDialog'),text=byId('authImportText'),status=byId('authBackupStatus');
  const fileButton=byId('authImportFileBtn'),importButton=byId('authImportTextBtn'),exportButton=byId('authExportBtn');
  let busy=false,deviceBusy=false,count=0;
  const update=()=>{
    fileButton.disabled=busy||deviceBusy;
    importButton.disabled=busy||deviceBusy||!text.value.trim();
    exportButton.disabled=busy||!count;
    text.disabled=busy;
  };
  const feedback=(message='',error=false)=>{
    status.textContent=message;status.dataset.state=error?'error':'success';
    text.setAttribute('aria-invalid',String(error));
  };
  const refresh=async()=>{
    const result=await api.authInfo();
    if(!result.ok){count=0;feedback(result.message,true);}
    else{
      count=result.count;
      byId('authBackupCount').textContent=count?`${count} saved ${count===1?'device':'devices'}`:'No saved devices';
    }
    update();
  };
  byId('authBackupBtn').addEventListener('click',()=>{
    feedback();dialog.showModal();void refresh();
  });
  byId('authBackupClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{text.value='';feedback();update();});
  dialog.addEventListener('click',event=>{
    const box=dialog.getBoundingClientRect();
    if(event.target===dialog && (event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))dialog.close();
  });
  text.addEventListener('input',()=>{feedback();update();});
  async function importRecords(fromFile) {
    if(busy||deviceBusy)return;
    busy=true;feedback('Checking credentials…');update();
    try{
      const result=await api.importAuth(fromFile?undefined:text.value);
      if(result.canceled){feedback();return;}
      if(!result.ok){feedback(result.message,true);return;}
      text.value='';await refresh();feedback(result.message);
    }finally{busy=false;update();}
  }
  fileButton.addEventListener('click',()=>void importRecords(true));
  importButton.addEventListener('click',()=>void importRecords(false));
  exportButton.addEventListener('click',()=>{
    const result=api.exportAuth();feedback(result.message,!result.ok);
  });
  api.onActionBusy(({busy:active})=>{deviceBusy=active;update();});
  update();
}
