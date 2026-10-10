// Some SDK versions treat any conditional-write response except 412 as success.
// Keep permission/network/storage failures from acknowledging a lost publish.
export async function checkedBlobFetch(input,init) {
  const response=await fetch(input,init);
  const method=(init?.method || input?.method || 'GET').toUpperCase();
  if(method==='PUT'&&!response.ok&&response.status!==412) {
    await response.body?.cancel();throw new Error('Blob write failed');
  }
  return response;
}
