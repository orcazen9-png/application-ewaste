// Native Buffer (Node, and Workers with nodejs_compat) encodes a photo in well under a millisecond; the portable
// loop below costs ~30 ms of CPU for a 500 KB photo, over the Workers free-plan limit.
export function toBase64(bytes){
  if(globalThis.Buffer)return globalThis.Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('base64');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
export function fromBase64(text){
  if(globalThis.Buffer){const b=globalThis.Buffer.from(text,'base64');return new Uint8Array(b.buffer,b.byteOffset,b.byteLength);}
  const binary=atob(text),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}
