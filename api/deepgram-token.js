// Instance-local brake only: configure distributed limits in Vercel Firewall.
export function createHandler({env=process.env,request=fetch,now=Date.now}={}){
  let windowStart=0,attempts=0;
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método no permitido'});}
    if(!env.DEEPGRAM_API_KEY)return res.status(503).json({error:'El directo no está configurado en el servidor'});
    const time=now();if(time-windowStart>=60000){windowStart=time;attempts=0;}
    if(++attempts>10){res.setHeader('Retry-After','60');return res.status(429).json({error:'Demasiadas solicitudes. Espera un minuto.'});}
    const origin=req.headers?.origin,host=req.headers?.host;
    if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'Origen no permitido'});}catch{return res.status(403).json({error:'Origen no permitido'});}}
    if(!req.headers?.['content-type']?.startsWith('application/json'))return res.status(415).json({error:'Se requiere JSON'});
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
