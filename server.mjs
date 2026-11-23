import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Governance } from './lib/governance.mjs';

const publicDir = fileURLToPath(new URL('./public/',import.meta.url));
const environment = globalThis.process?.env || {};
const defaultTargets = {
  regular: environment.RTC_REGULAR_URL || 'http://127.0.0.1:8080/api',
  simples: environment.RTC_SIMPLES_URL || 'http://127.0.0.1:8082/api'
};
const calculations = {regular:'/calculadora/observabilidade/regime-geral',simples:'/calculadora/observabilidade/simples-nacional'};
const routes = new Set(['/dados-abertos/classificacoes-tributarias/cbs-ibs/class-trib','/dados-abertos/ncm','/dados-abertos/nbs','/dados-abertos/aliquota-uniao','/dados-abertos/aliquota-uf','/dados-abertos/aliquota-municipio']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
function json(res,status,body) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body)); }
async function readBody(req) {
  let buffer = '';
  for await (const chunk of req) { buffer += chunk; if (Buffer.byteLength(buffer)>1000000) {const e=new Error('Requisição excede 1 MB.');e.status=413;throw e;} }
  try { return JSON.stringify(JSON.parse(buffer)); } catch {const e=new Error('JSON inválido.');e.status=400;throw e;}
}
export function createApp(targets = defaultTargets, {governance = new Governance()} = {}) {
  const server = createServer(async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url,'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control','no-store');
        // Same-origin only; proxy targets are server configuration, never client input.
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res,403,{error:'Origem não permitida.'});
        if (url.pathname.startsWith('/api/governance/')) {
          const date=url.searchParams.get('date')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return json(res,400,{error:'Data de referência inválida.'});
          if(url.pathname==='/api/governance/summary'&&req.method==='GET')return json(res,200,await governance.summary(date));
          if(url.pathname==='/api/governance/sync'&&req.method==='POST')return json(res,200,await governance.sync());
          const evidence=url.pathname.match(/^\/api\/governance\/evidence\/([a-z0-9-]+)\/([a-f0-9]{64})$/);
          if(evidence&&req.method==='GET')return json(res,200,await governance.snapshot(evidence[1],evidence[2]));
          const pdf=url.pathname.match(/^\/api\/governance\/pdf\/([a-f0-9]{64})$/);
          if(pdf&&req.method==='GET'){const content=await governance.pdf(pdf[1]);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="ato-${pdf[1].slice(0,12)}.pdf"`});res.end(content);return;}
          const review=url.pathname.match(/^\/api\/governance\/changes\/([\da-f-]{36})\/review$/);
          if(review&&req.method==='POST')return json(res,200,await governance.review(review[1],JSON.parse(await readBody(req))));
          const context=url.pathname.match(/^\/api\/governance\/contexts\/([\da-f-]{36})$/);
          if(context&&req.method==='GET')return json(res,200,await governance.readContext(context[1]));
          return json(res,404,{error:'Rota de monitoramento não encontrada.'});
        }
        if (url.pathname === '/api/status' && req.method === 'GET') {
          const statuses = await Promise.all(Object.entries(targets).map(async ([name,base])=>{
            try { const response=await fetch(`${base.replace(/\/$/,'')}/versao`,{signal:AbortSignal.timeout(4000),redirect:'error'});return {name,connected:response.ok,version:response.ok?await response.json():null,status:response.status}; }
            catch { return {name,connected:false,status:null}; }
          }));
          return json(res,200,{services:statuses});
        }
        const match = url.pathname.match(/^\/api\/rtc\/(regular|simples)(\/.*)?$/);
        if (!match) return json(res,404,{error:'Rota não encontrada.'});
        const [,regime,suffix=''] = match;
        let path;
        if (suffix === '/calculate' && req.method === 'POST') path = calculations[regime];
        else if (req.method === 'GET' && regime === 'regular' && (routes.has(suffix) || /^\/dados-abertos\/classificacoes-tributarias\/cbs-ibs\/class-trib\/\d{6}$/.test(suffix))) path='/calculadora'+suffix;
        else if (req.method === 'GET' && regime === 'simples' && suffix === '/activities') path='/calculadora/simples-nacional/atividades';
        else return json(res,404,{error:'Consulta não permitida.'});
        const requestBody = req.method === 'POST' ? await readBody(req) : undefined;
        // Capture installed-engine identity separately from repository versions.
        let auditContext;
        if(requestBody) {
          let installed=null;
          try{const version=await fetch(`${targets[regime].replace(/\/$/,'')}/versao`,{signal:AbortSignal.timeout(3000),redirect:'error'});if(version.ok)installed=await version.json();}catch{}
          auditContext=await governance.context({regime,reportedBeforeRequest:installed,verifiedWithCalculation:false});
        }
        const response=await fetch(`${targets[regime].replace(/\/$/,'')}${path}${url.search}`,{method:req.method,headers:{Accept:'application/json',...(requestBody?{'Content-Type':'application/json'}:{})},body:requestBody,signal:AbortSignal.timeout(20000),redirect:'error'});
        const text=await response.text();
        if(auditContext)await governance.recordReceipt(auditContext.id,{httpStatus:response.status,versionHeaders:Object.fromEntries([...response.headers].filter(([name])=>/version|versao|warning/i.test(name)))});
        if(auditContext)res.setHeader('x-nexxera-context-id',auditContext.id);
        res.writeHead(response.status,{'Content-Type':'application/json; charset=utf-8',...(response.headers.get('x-warning-dados-simulados')?{'x-warning-dados-simulados':response.headers.get('x-warning-dados-simulados')}:{})});
        res.end(text);return;
      }
      if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Método não permitido.'});
      const allowed = {'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/domain.mjs':'domain.mjs','/monitor.js':'monitor.js','/monitor.css':'monitor.css','/municipalities.mjs':'municipalities.mjs','/municipalities-data.mjs':'municipalities-data.mjs'};
      const file=allowed[url.pathname];
      if (!file) return json(res,404,{error:'Arquivo não encontrado.'});
      const ext=file.slice(file.lastIndexOf('.'));
      const content=await readFile(resolve(publicDir,file));
      res.writeHead(200,{'Content-Type':types[ext],'Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:content);
    } catch(error) { const monitorError=req.url.startsWith('/api/governance/');json(res,error.status||(error.code==='ENOENT'?404:502),{error:error.status||monitorError?error.message:'Não foi possível acessar a instância RTC. Verifique a instalação, a URL e a versão do serviço. O cálculo não foi substituído por uma demonstração.'}); }
  });
  server.on('close',()=>governance.stop());
  return server;
}
const argv = globalThis.process?.argv;
if (argv?.[1] && import.meta.url === pathToFileURL(resolve(argv[1])).href) {
  const port=Number(environment.PORT||3000);
  const governance=new Governance();
  createApp(defaultTargets,{governance}).listen(port,'127.0.0.1',()=>{
    console.log(`Nexxera Tributos disponível em http://127.0.0.1:${port}`);
    if(environment.MONITOR_ENABLED!=='false') {
      const hours=Number(environment.MONITOR_INTERVAL_HOURS||4);
      if(!Number.isFinite(hours)||hours<1)throw new Error('MONITOR_INTERVAL_HOURS deve ser pelo menos 1.');
      void governance.start(hours*3600000);
    }
  });
}
