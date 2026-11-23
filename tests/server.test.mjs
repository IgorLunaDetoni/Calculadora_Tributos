import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApp} from '../server.mjs';

test('Local server serves UI, restricts routes and forwards official payloads without fallback',async()=>{
  let received;
  const upstream=createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;
    received={path:req.url,method:req.method,body:text};
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/versao')return res.end('{"versao":"test-fixture"}');
    if(text.includes('fail')){res.writeHead(422);res.end('{"detail":"Entrada inválida"}');return;}
    res.end('{"objetos":[{"estadoItem":"CALCULADO"}]}');
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const app=createApp({regular:`http://127.0.0.1:${upstream.address().port}/api`,simples:`http://127.0.0.1:${upstream.address().port}/api`});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.address().port}`;
  try{
    const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/Calculadora de tributos/);
    assert.equal((await fetch(base+'/package.json')).status,404);
    assert.equal((await fetch(base+'/api/rtc/regular/anything')).status,404);
    assert.equal((await fetch(base+'/api/rtc/regular/calculate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.test'},body:'{}'})).status,403);
    const invalid=await fetch(base+'/api/rtc/regular/calculate',{method:'POST',body:'not json'});assert.equal(invalid.status,400);
    const payload={id:'test',itens:[]};
    const response=await fetch(base+'/api/rtc/regular/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    assert.equal(response.status,200);assert.equal(received.path,'/api/calculadora/observabilidade/regime-geral');assert.deepEqual(JSON.parse(received.body),payload);
    const fail=await fetch(base+'/api/rtc/simples/calculate',{method:'POST',body:'{"id":"fail"}'});assert.equal(fail.status,422);assert.equal((await fail.json()).detail,'Entrada inválida');
    assert.equal(received.path,'/api/calculadora/observabilidade/simples-nacional');
    const status=await(await fetch(base+'/api/status')).json();assert.ok(status.services.every(s=>s.connected));
    await new Promise(resolve=>upstream.close(resolve));
    const unavailable=await fetch(base+'/api/rtc/regular/calculate',{method:'POST',body:'{}'});assert.equal(unavailable.status,502);assert.match((await unavailable.json()).error,/não foi substituído/);
  }finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));upstream.closeAllConnections();upstream.close();}
});
