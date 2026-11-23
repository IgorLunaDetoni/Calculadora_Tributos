import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';

const root=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const execute=promisify(execFile);
const environment=globalThis.process?.env||{};
const calibrePdf='C:/Program Files/Calibre2/app/bin/pdftotext.exe';
const hosts=new Set(['www.gov.br','www2.camara.leg.br','www.planalto.gov.br','planalto.gov.br','normas.receita.fazenda.gov.br','normasinternet2.receita.fazenda.gov.br','www.in.gov.br','pesquisa.in.gov.br','www.cgibs.gov.br','api.github.com','raw.githubusercontent.com','github.com']);
const emptyState=()=>({schemaVersion:1,lastRun:null,sources:{},discovered:[],changes:[],runs:[]});
function decode(value) {return value.replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n;return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n]));}
export function assertPublicSource(value) {const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.has(url.hostname))throw new Error('A fonte deve usar HTTPS e pertencer à lista de domínios oficiais permitidos.');return url;}
export function extractPage(html,base) {
  if(/(?:access denied|verify you are human|just a moment|captcha)/i.test(html.slice(0,1500)))throw new Error('A fonte retornou uma barreira de acesso; nenhuma versão foi substituída.');
  // Indexes contain several article elements; selecting the first would miss acts.
  const article=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if(!article)throw new Error('Página sem conteúdo reconhecível. Revise o conector.');
  const text=decode(article.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[^]*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();
  if(text.length<100)throw new Error('Conteúdo vazio ou insuficiente. A última coleta válida foi preservada.');
  const links=new Map();
  for(const match of article.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {const url=new URL(decode(match[1]),base);url.hash='';if(url.protocol!=='https:'||!hosts.has(url.hostname)||/[?&](?:utm_|fbclid)/.test(url.search))continue;const title=decode(match[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();if(title.length>4)links.set(url.href,{url:url.href,title:title.slice(0,400)});}catch{}
  }
  return {text,links:[...links.values()].sort((a,b)=>a.url.localeCompare(b.url))};
}
export function textDiff(before='',after='') {
  const tokens=text=>new Set(text.split(/(?<=[.;])\s+|\n+/).map(s=>s.trim()).filter(Boolean));
  const a=tokens(before),b=tokens(after);
  return {added:[...b].filter(s=>!a.has(s)).slice(0,20),removed:[...a].filter(s=>!b.has(s)).slice(0,20),truncated:a.size>20||b.size>20};
}
export function validateRulebook(book,sourceIds) {
  if(book?.schemaVersion!==1||typeof book.version!=='string'||!Array.isArray(book.rules)||!book.rules.length)throw new Error('Catálogo de regras inválido.');
  const ids=new Set();
  for(const rule of book.rules) {
    if(!/^[a-z0-9-]+$/.test(rule.id)||ids.has(rule.id)||!rule.title||!rule.summary||rule.executable!==false||!Array.isArray(rule.sourceIds)||!rule.sourceIds.length||rule.sourceIds.some(id=>!sourceIds.has(id)))throw new Error('Regra sem identificação, fonte ou escopo informativo válido.');
    for(const date of [rule.validFrom,rule.validTo])if(date!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('Data de vigência inválida.');
    if(rule.validFrom&&rule.validTo&&rule.validFrom>rule.validTo)throw new Error('Intervalo de vigência inválido.');
    if(!Array.isArray(rule.regimes)||rule.regimes.some(r=>!['regular','simples'].includes(r)))throw new Error('Regime inválido.');
    ids.add(rule.id);
  }
  return book;
}
async function atomicJson(path,value) {const temp=`${path}.${randomUUID()}.tmp`;try{await writeFile(temp,JSON.stringify(value,null,2),'utf8');await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}}

export class Governance {
  constructor({dataDir=join(root,'.local','monitor'),configDir=join(root,'config'),fetcher=globalThis.fetch,clock=()=>new Date(),timeoutMs=15000,pdfExtractor=null}={}) {
    this.dataDir=resolve(dataDir);this.configDir=configDir;this.fetcher=fetcher;this.clock=clock;this.timeoutMs=timeoutMs;this.pdfExtractor=pdfExtractor;this.inFlight=null;this.timer=null;
  }
  async config() {
    const sources=JSON.parse(await readFile(join(this.configDir,'sources.json'),'utf8'));
    if(!Array.isArray(sources)||sources.length>50)throw new Error('Lista de fontes inválida.');
    const ids=new Set();for(const source of sources){if(!/^[a-z0-9-]+$/.test(source.id)||ids.has(source.id)||!['github','html','manual'].includes(source.type))throw new Error('Configuração de fonte inválida.');assertPublicSource(source.url);if(source.type==='github'&&!/^ReceitaFederal\/calculadora-rtc-(regime-regular|simples-nacional)$/.test(source.repository))throw new Error('Repositório não permitido.');ids.add(source.id);}
    const book=validateRulebook(JSON.parse(await readFile(join(this.configDir,'rules.json'),'utf8')),ids);
    return {sources,book};
  }
  async state() {
    try{const value=JSON.parse(await readFile(join(this.dataDir,'state.json'),'utf8'));if(value.schemaVersion!==1||!value.sources||!Array.isArray(value.changes))throw new Error('Estado incompatível.');return value;}
    catch(error){if(error.code==='ENOENT')return emptyState();throw new Error('O histórico do monitor está inválido. Restaure um backup; os dados não serão reinicializados automaticamente.');}
  }
  async locked(callback) {
    await mkdir(this.dataDir,{recursive:true});const lockPath=join(this.dataDir,'monitor.lock');let handle;
    try {handle=await open(lockPath,'wx');}
    catch(error){if(error.code!=='EEXIST')throw error;const info=await stat(lockPath);if(Date.now()-info.mtimeMs>600000){await unlink(lockPath);handle=await open(lockPath,'wx');}else{const busy=new Error('Uma coleta ou revisão já está em andamento. Tente novamente em instantes.');busy.status=409;throw busy;}}
    try{return await callback();}finally{await handle.close();await unlink(lockPath).catch(()=>{});}
  }
  async request(url,headers={}) {
    assertPublicSource(url);
    // Follow a small number of redirects only after validating every destination.
    for(let redirect=0;redirect<4;redirect++) {
      const response=await this.fetcher(url,{headers:{'User-Agent':'Nexxera-Tributos-Monitor/0.2 (public official sources)',Accept:'text/html, application/json, text/plain',...headers},redirect:'manual',signal:AbortSignal.timeout(this.timeoutMs)});
      if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw new Error('Redirecionamento sem destino.');const next=new URL(location,url);if(next.protocol==='http:'&&next.hostname==='pesquisa.in.gov.br')next.protocol='https:';url=next.href;try{assertPublicSource(url);}catch(error){throw new Error(`${error.message} Destino informado pela fonte: ${new URL(url).origin}.`);}await response.body?.cancel();continue;}
      if(!response.ok)throw new Error(`A fonte retornou HTTP ${response.status}. A última versão válida foi mantida.`);
      if(Number(response.headers.get('content-length'))>12000000)throw new Error('Documento excede o limite de 12 MB.');
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>12000000){throw new Error('Documento excede o limite de 12 MB.');}chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      const contentType=response.headers.get('content-type')||'';
      if(/application\/pdf/i.test(contentType)||bytes.subarray(0,5).toString('ascii')==='%PDF-')return {bytes,contentType:'application/pdf',url};
      const charset=/charset=["']?([\w-]+)/i.exec(contentType)?.[1]||/charset\s*=\s*["']?([\w-]+)/i.exec(bytes.subarray(0,5000).toString('ascii'))?.[1]||'utf-8';
      return {text:new TextDecoder(charset).decode(bytes),contentType,url};
    }
    throw new Error('Número excessivo de redirecionamentos.');
  }
  async extractPdf(bytes) {
    if(this.pdfExtractor)return this.pdfExtractor(bytes);
    const executable=environment.PDFTOTEXT_PATH||(existsSync(calibrePdf)?calibrePdf:'pdftotext');
    await mkdir(join(this.dataDir,'tmp'),{recursive:true});const file=join(this.dataDir,'tmp',`${randomUUID()}.pdf`);
    try{await writeFile(file,bytes);const {stdout}=await execute(executable,['-layout','-enc','UTF-8',file,'-'],{encoding:'utf8',timeout:15000,maxBuffer:16000000,windowsHide:true});return stdout.trim();}
    catch{throw new Error('Não foi possível extrair o PDF. Instale Poppler ou configure PDFTOTEXT_PATH. PDFs digitalizados podem exigir OCR.');}
    finally{await unlink(file).catch(()=>{});}
  }
  async collect(source) {
    if(source.type==='github') {
      const commit=JSON.parse((await this.request(`https://api.github.com/repos/${source.repository}/commits/main`)).text);
      if(!/^[a-f0-9]{40}$/.test(commit.sha)||!commit.commit?.message)throw new Error('Resposta de commit inválida.');
      const changelog=(await this.request(`https://raw.githubusercontent.com/${source.repository}/${commit.sha}/CHANGELOG.md`)).text;
      const version=changelog.match(/^##\s+\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/m);
      if(!version)throw new Error('Changelog sem versão identificável.');
      return {text:changelog,links:[],metadata:{sha:commit.sha,message:commit.commit.message,committedAt:commit.commit.committer?.date,version:version[1],releasedOn:version[2]},fingerprint:hash(commit.sha+'\n'+changelog)};
    }
    const page=await this.request(source.url);
    if(page.contentType==='application/pdf') {
      const text=await this.extractPdf(page.bytes);if(text.length<80)throw new Error('PDF sem texto suficiente; OCR ou análise específica necessária.');
      const pdfHash=createHash('sha256').update(page.bytes).digest('hex');await mkdir(join(this.dataDir,'pdfs'),{recursive:true});
      try{await writeFile(join(this.dataDir,'pdfs',`${pdfHash}.pdf`),page.bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
      return {text,links:[],metadata:{finalUrl:page.url,extractorVersion:2,format:'pdf',pdfHash},fingerprint:hash({pdfHash,text})};
    }
    if(!/html/i.test(page.contentType))throw new Error('O conector espera HTML; PDF e outros formatos precisam de um adaptador.');
    const content=extractPage(page.text,page.url);
    return {...content,metadata:{finalUrl:page.url,extractorVersion:2},fingerprint:hash(content)};
  }
  snapshotPath(id,fingerprint) {if(!/^[a-z0-9-]+$/.test(id)||!/^[a-f0-9]{64}$/.test(fingerprint))throw new Error('Identificador de evidência inválido.');return join(this.dataDir,'snapshots',id,`${fingerprint}.json`);}
  async snapshot(id,fingerprint) {return JSON.parse(await readFile(this.snapshotPath(id,fingerprint),'utf8'));}
  async sync() {
    if(this.inFlight)return this.inFlight;
    this.inFlight=this.locked(async()=>{
      const {sources:configured,book}=await this.config();const state=await this.state();const startedAt=this.clock().toISOString();
      const sources=[...configured];
      // Independent reads run together. A single failing source never invalidates other sources.
      const outcomes=await Promise.allSettled(sources.map(source=>source.type==='manual'?Promise.resolve(null):this.collect(source)));
      const discovered=[...(state.discovered||[])];
      for(const source of discovered)source.scope='Documento descoberto no índice oficial, em HTML ou PDF textual por redirecionamento direto. Não percorre anexos nem outros links da página.';
      for(let i=0;i<configured.length;i++) {
        const parent=configured[i];if(!parent.followDocuments||outcomes[i].status!=='fulfilled'||!outcomes[i].value)continue;
        const prefix=parent.url.replace(/\/$/,'')+'/';
        for(const link of outcomes[i].value.links) {
          if(discovered.length>=50)break;
          if(!link.url.startsWith(prefix)||!/ato|resolu|instru/i.test(link.title)||configured.some(s=>s.url===link.url)||discovered.some(s=>s.url===link.url))continue;
          discovered.push({id:`doc-${hash(link.url).slice(0,20)}`,name:link.title,type:'html',category:'norma',url:link.url,parentId:parent.id,discoveredAt:startedAt,scope:'Página do ato descoberta no índice oficial, incluindo redirecionamento direto para PDF textual. Não percorre anexos nem outros links da página.'});
        }
      }
      state.discovered=discovered;
      sources.push(...discovered);
      outcomes.push(...await Promise.allSettled(discovered.map(source=>this.collect(source))));
      let changed=0,errors=0;
      for(let i=0;i<sources.length;i++) {
        const source=sources[i],outcome=outcomes[i],previous=state.sources[source.id];
        if(source.type==='manual'){state.sources[source.id]={...previous,status:'manual',checkedAt:null};continue;}
        if(outcome.status==='rejected'){errors++;state.sources[source.id]={...previous,status:'error',checkedAt:this.clock().toISOString(),error:outcome.reason.message};continue;}
        const content=outcome.value,observedAt=this.clock().toISOString();
        if(content.fingerprint!==previous?.fingerprint) {
          const snapshot={sourceId:source.id,sourceUrl:source.url,capturedAt:observedAt,...content};
          await mkdir(join(this.dataDir,'snapshots',source.id),{recursive:true});
          // Never overwrite the first captured copy of the same content.
          try{await writeFile(this.snapshotPath(source.id,content.fingerprint),JSON.stringify(snapshot,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
          if(previous?.fingerprint) {
            const before=await this.snapshot(source.id,previous.fingerprint);
            const oldLinks=new Set(before.links.map(link=>link.url));
            state.changes.unshift({id:randomUUID(),sourceId:source.id,detectedAt:observedAt,before:previous.fingerprint,after:content.fingerprint,status:'pending',kind:source.category==='motor'?'motor':before.metadata.extractorVersion!==content.metadata.extractorVersion?'coleta':'conteudo',...textDiff(before.text,content.text),newLinks:content.links.filter(link=>!oldLinks.has(link.url)),metadata:content.metadata});changed++;
          } else if(source.parentId) {
            state.changes.unshift({id:randomUUID(),sourceId:source.id,detectedAt:observedAt,before:null,after:content.fingerprint,status:'pending',kind:'novo-documento',...textDiff('',content.text),newLinks:content.links,metadata:content.metadata});changed++;
          }
        }
        state.sources[source.id]={status:'ok',checkedAt:observedAt,lastSuccessAt:observedAt,fingerprint:content.fingerprint,metadata:content.metadata,error:null};
      }
      state.lastRun={id:randomUUID(),startedAt,finishedAt:this.clock().toISOString(),changed,errors,rulebookVersion:book.version};state.runs=[state.lastRun,...(state.runs||[])].slice(0,100);
      await this.archiveBook(book);await atomicJson(join(this.dataDir,'state.json'),state);return {...await this.summary(),running:false};
    }).finally(()=>{this.inFlight=null;});return this.inFlight;
  }
  async archiveBook(book) {await mkdir(join(this.dataDir,'rulebooks'),{recursive:true});const digest=hash(book);try{await writeFile(join(this.dataDir,'rulebooks',`${digest}.json`),JSON.stringify(book,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}return digest;}
  async summary(date) {
    const {sources:configured,book}=await this.config();const state=await this.state();const sources=[...configured,...(state.discovered||[])];
    const pending=new Set(state.changes.filter(c=>c.status==='pending').map(c=>c.sourceId));
    return {schemaVersion:1,coverage:book.scope,rulebookVersion:book.version,rulebookHash:hash(book),verifiedOn:book.verifiedOn,lastRun:state.lastRun,running:!!this.inFlight,
      sources:sources.map(source=>({...source,...state.sources[source.id],pending:pending.has(source.id)})),
      rules:book.rules.map(rule=>({...rule,temporalStatus:!rule.validFrom?'conditional':date&&date<rule.validFrom?'future':date&&rule.validTo&&date>rule.validTo?'expired':'within-dates',needsReview:rule.sourceIds.some(id=>pending.has(id)),sourceHealth:rule.sourceIds.every(id=>state.sources[id]?.status==='ok')?'checked':'unconfirmed'})),
      changes:state.changes,runs:state.runs};
  }
  async review(id,{reviewer,note}) {
    if(typeof reviewer!=='string'||reviewer.trim().length<2||reviewer.length>120||typeof note!=='string'||note.trim().length<10||note.length>4000){const error=new Error('Informe o responsável e uma análise com pelo menos 10 caracteres.');error.status=400;throw error;}
    return this.locked(async()=>{const state=await this.state();const change=state.changes.find(item=>item.id===id);if(!change){const error=new Error('Alteração não encontrada.');error.status=404;throw error;}if(change.status!=='pending'){const error=new Error('Esta alteração já foi analisada.');error.status=409;throw error;}change.status='reviewed';change.review={reviewer:reviewer.trim(),note:note.trim(),at:this.clock().toISOString(),effect:'Registro de análise. Não publica fórmula nem instala versões do motor.'};await atomicJson(join(this.dataDir,'state.json'),state);return change;});
  }
  async context(engineVersion=null) {
    const {book}=await this.config();const state=await this.state();const digest=await this.archiveBook(book);
    const content={capturedAt:this.clock().toISOString(),rulebookVersion:book.version,rulebookHash:digest,rulebookExecutable:false,engineVersion,sourceFingerprints:Object.fromEntries(Object.entries(state.sources).filter(([,s])=>s.fingerprint).map(([id,s])=>[id,{fingerprint:s.fingerprint,lastSuccessAt:s.lastSuccessAt,status:s.status}])),pendingChanges:state.changes.filter(c=>c.status==='pending').map(c=>c.id)};
    const context={id:randomUUID(),...content};await mkdir(join(this.dataDir,'contexts'),{recursive:true});await atomicJson(join(this.dataDir,'contexts',`${context.id}.json`),context);return context;
  }
  async recordReceipt(id,receipt) {if(!/^[\da-f-]{36}$/.test(id))throw new Error('Contexto inválido.');await mkdir(join(this.dataDir,'receipts'),{recursive:true});await atomicJson(join(this.dataDir,'receipts',`${id}.json`),{...receipt,receivedAt:this.clock().toISOString()});}
  async readContext(id) {
    if(!/^[\da-f-]{36}$/.test(id))throw new Error('Contexto inválido.');
    const context=JSON.parse(await readFile(join(this.dataDir,'contexts',`${id}.json`),'utf8'));
    try{context.receipt=JSON.parse(await readFile(join(this.dataDir,'receipts',`${id}.json`),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    return context;
  }
  async pdf(fingerprint) {if(!/^[a-f0-9]{64}$/.test(fingerprint))throw new Error('Identificador PDF inválido.');return readFile(join(this.dataDir,'pdfs',`${fingerprint}.pdf`));}
  async start(intervalMs=14400000) {
    if(this.timer)return;await this.sync().catch(error=>console.error('Monitor:',error.message));
    this.timer=setInterval(()=>this.sync().catch(error=>console.error('Monitor:',error.message)),intervalMs);this.timer.unref();
  }
  stop() {if(this.timer)clearInterval(this.timer);this.timer=null;}
}
