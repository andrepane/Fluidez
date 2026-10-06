import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {WebSocket,WebSocketServer} from 'ws';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const assets=new Map([['/','index.html'],...['index.html','style.css','script.js','analysis.mjs','transcriber.worker.js','deepgram-live.mjs','deepgram-capture.worklet.js'].map(f=>['/'+f,f])]);
export function createProxy({key=process.env.DEEPGRAM_API_KEY,connect=(url,options)=>new WebSocket(url,options),appRoot=root}={}){
  let active=0;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
    const host=req.headers.host,port=server.address()?.port;
    if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(host)){res.writeHead(403).end();return;}
    if(req.method!=='GET'){res.writeHead(405).end();return;}
    if(req.url==='/experimental/config'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({configured:!!key}));return;}
    const file=assets.get(req.url);if(!file){res.writeHead(404).end();return;}
    try{const content=await readFile(resolve(appRoot,file));res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(content);}catch{res.writeHead(404).end();}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    const port=server.address().port,origin=req.headers.origin;
    if(req.url!=='/experimental/deepgram'||![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(origin)||req.headers.host!==origin.slice(7)||!key||active>=1){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,client=>wss.emit('connection',client));
  });
  wss.on('connection',client=>{
    active++;let upstream,closing=false,lastAudio=Date.now(),audioBudget=32000;
    const send=data=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(data));};
    const stop=reason=>{if(closing)return;closing=true;send({type:'ProxyError',message:reason});client.close(1011,'Stream stopped');upstream?.terminate();};
    const initial=setTimeout(()=>stop('No se inició el audio'),10000);
    const limit=setTimeout(()=>stop('Límite experimental de cinco minutos'),300000);
    const keep=setInterval(()=>{if(upstream?.readyState===WebSocket.OPEN&&Date.now()-lastAudio>3000)upstream.send(JSON.stringify({type:'KeepAlive'}));},3000);
    client.on('message',(data,binary)=>{
      if(binary){
        if(upstream?.readyState!==WebSocket.OPEN){stop('Audio antes de conectar');return;}
        if(upstream.bufferedAmount>audioBudget){stop('La conexión acumula audio; feedback desactivado');return;}
        lastAudio=Date.now();upstream.send(data,{binary:true});return;
      }
      let message;try{message=JSON.parse(data);}catch{stop('Mensaje no válido');return;}
      if(message.type==='Start'&&!upstream){
        const rate=message.sampleRate;
        if(![16000,22050,24000,32000,44100,48000,96000].includes(rate)){stop('Frecuencia de audio no compatible');return;}
        clearTimeout(initial);audioBudget=rate*2;
        const params=new URLSearchParams({model:'nova-3',language:'es',encoding:'linear16',sample_rate:String(rate),channels:'1',interim_results:'true',endpointing:'300',utterance_end_ms:'1000',vad_events:'true',punctuate:'true',smart_format:'false'});
        try{upstream=connect('wss://api.deepgram.com/v1/listen?'+params,{headers:{Authorization:'Token '+key},handshakeTimeout:10000,maxPayload:1048576,perMessageDeflate:false});}catch{stop('No se pudo conectar con Deepgram');return;}
        upstream.on('open',()=>send({type:'ProxyReady'}));
        upstream.on('message',(bytes)=>{
          if(client.bufferedAmount>200000){stop('Resultados atrasados');return;}
          let result;try{result=JSON.parse(bytes);}catch{return;}
          if(['Results','SpeechStarted','UtteranceEnd'].includes(result.type))send(result);
          else if(result.type==='Metadata')send({type:'Metadata',request_id:result.request_id,duration:result.duration});
          else if(result.type==='Error')stop('Deepgram devolvió un error del servicio');
        });
        // Never relay headers, key, raw HTTP error bodies or audio to logs.
        upstream.on('error',()=>stop('Error de Deepgram; revisa clave, crédito, red y disponibilidad'));
        upstream.on('close',()=>{if(!closing){closing=true;send({type:'ProxyDisconnected'});client.close(1000);}});
      }else if(message.type==='CloseStream'&&upstream?.readyState===WebSocket.OPEN)upstream.send(JSON.stringify({type:'CloseStream'}));
      else stop('Control no permitido');
    });
    client.on('error',()=>stop('Error de conexión local'));
    client.on('close',()=>{active--;clearTimeout(initial);clearTimeout(limit);clearInterval(keep);upstream?.terminate();});
  });
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const server=createProxy();server.listen(8787,'127.0.0.1',()=>console.log('Experimento local: http://127.0.0.1:8787 · clave '+(process.env.DEEPGRAM_API_KEY?'configurada':'NO configurada')));
}
