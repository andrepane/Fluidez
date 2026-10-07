import {createHash,timingSafeEqual} from 'node:crypto';
// Instance-local brake only: configure distributed limits in Vercel Firewall.
export function createHandler({env=process.env,request=fetch,now=Date.now}={}){
  let windowStart=0,attempts=0;
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método no permitido'});}
    if(!env.DEEPGRAM_API_KEY||!env.FLUIDEZ_ACCESS_CODE||(env.FLUIDEZ_ACCESS_CODE.length<16||env.FLUIDEZ_ACCESS_CODE.length>256))return res.status(503).json({error:'El acceso al directo no está configurado en el servidor'});
    const time=now();if(time-windowStart>=60000){windowStart=time;attempts=0;}
    if(++attempts>10){res.setHeader('Retry-After','60');return res.status(429).json({error:'Demasiadas solicitudes. Espera un minuto.'});}
    const origin=req.headers?.origin,host=req.headers?.host;
    if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'Origen no permitido'});}catch{return res.status(403).json({error:'Origen no permitido'});}}
    if(!req.headers?.['content-type']?.startsWith('application/json'))return res.status(415).json({error:'Se requiere JSON'});
    const code=req.body?.accessCode;
    if(typeof code!=='string'||code.length>256)return res.status(401).json({error:'Código de acceso incorrecto'});
    const digest=value=>createHash('sha256').update(value).digest();
    if(!timingSafeEqual(digest(code),digest(env.FLUIDEZ_ACCESS_CODE)))return res.status(401).json({error:'Código de acceso incorrecto'});
    try{
      const response=await request('https://api.deepgram.com/v1/auth/grant',{method:'POST',headers:{Authorization:'Token '+env.DEEPGRAM_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({ttl_seconds:60}),signal:AbortSignal.timeout(4000)});
      if(!response.ok)return res.status(502).json({error:'No se pudo autorizar el reconocimiento en directo'});
      const data=await response.json();
      if(typeof data.access_token!=='string'||!data.access_token)return res.status(502).json({error:'No se recibió acceso temporal'});
      return res.status(200).json({access_token:data.access_token,expires_in:data.expires_in});
    }catch{return res.status(502).json({error:'No se pudo contactar con el reconocimiento en directo'});}
  };
}
export default createHandler();
