// Local development only. Netlify uses the persistent, strongly consistent store.
export class MemoryStore {
  entries=new Map();revision=0;
  async getWithMetadata(key) {return structuredClone(this.entries.get(key)||null);}
  async get(key) {return structuredClone(this.entries.get(key)?.data??null);}
  async setJSON(key,data,options={}) {
    const old=this.entries.get(key);
    if(options.onlyIfNew&&old || options.onlyIfMatch&&old?.etag!==options.onlyIfMatch)return {modified:false};
    const etag=String(++this.revision);this.entries.set(key,{data:structuredClone(data),etag});return {modified:true,etag};
  }
}
