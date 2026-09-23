// Development-only forwarder: POST /api/recognize → the loopback Python recognition service
// (python -m uvicorn ml.api:app --host 127.0.0.1 --port 8766). Photos never leave this machine,
// and a missing or untrained service returns 503 so the app asks the user to choose a category.
export const DEFAULT_RECOGNITION_URL='http://127.0.0.1:8766/predict';

export function createRecognizeHandler({url=process.env.RECOGNITION_URL||DEFAULT_RECOGNITION_URL,fetchImpl=fetch,limitBytes=8*1024*1024,timeoutMs=30000}={}){
  return async function recognize(req,res){
    const chunks=[];let size=0;
    for await(const chunk of req){
      size+=chunk.length;
      if(size>limitBytes){res.writeHead(413,{'Content-Type':'application/json'});res.end('{"detail":"Image must be 8 MB or smaller."}');return;}
      chunks.push(chunk);
    }
    try{
      const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':req.headers['content-type']||'application/octet-stream'},
        body:Buffer.concat(chunks),signal:AbortSignal.timeout(timeoutMs)});
      res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{
      res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end('{"detail":"Recognition service is not running."}');
    }
  };
}
