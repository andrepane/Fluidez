export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método no permitido'});
  }
  const key=process.env.DEEPGRAM_API_KEY;
  if(!key)return res.status(503).json({error:'Deepgram no está configurado en el servidor'});
  try{
    const response=await fetch('https://api.deepgram.com/v1/auth/grant',{
      method:'POST',
      headers:{Authorization:'Token '+key,'Content-Type':'application/json'},
      body:JSON.stringify({ttl_seconds:60})
    });
    if(!response.ok)return res.status(502).json({error:'Deepgram rechazó la autorización temporal'});
    const data=await response.json();
    if(!data.access_token)return res.status(502).json({error:'Deepgram no devolvió un token temporal'});
    return res.status(200).json({access_token:data.access_token,expires_in:data.expires_in});
  }catch{
    return res.status(502).json({error:'No se pudo contactar con Deepgram'});
  }
}
