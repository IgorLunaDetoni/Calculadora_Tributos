import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import {Governance,extractPage,assertPublicSource,validateRulebook} from '../lib/governance.mjs';
import {createApp} from '../server.mjs';

const tempRoot=fileURLToPath(new URL('../.local/tests/',import.meta.url));
const page=(text,link='')=>`<html><body><nav>Unrelated navigation</nav><main><article><h1>Reforma tributária</h1><p>${text} ${'Conteúdo normativo de exemplo para verificar o coletor. '.repeat(3)}</p>${link}</article></main></body></html>`;
async function fixture(fetcher) {
  await mkdir(tempRoot,{recursive:true});const folder=await mkdtemp(join(tempRoot,'monitor-'));
  const configDir=join(folder,'config');await mkdir(configDir);
  const sources=[{id:'norma',name:'Norma exemplo',url:'https://www.gov.br/norma',type:'html',category:'norma'},{id:'manual',name:'Pesquisa',url:'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action',type:'manual',category:'pesquisa'}];
  const book={schemaVersion:1,version:'test.1',verifiedOn:'2026-11-23',rules:[{id:'regra',title:'Referência',summary:'Resumo',validFrom:'2026-01-01',validTo:'2026-12-31',regimes:['regular'],sourceIds:['norma'],parameters:{},conditions:[],executable:false}]};
  await writeFile(join(configDir,'sources.json'),JSON.stringify(sources));await writeFile(join(configDir,'rules.json'),JSON.stringify(book));
  const monitor=new Governance({dataDir:join(folder,'data'),configDir,fetcher});
  return {folder,monitor,configDir,sources,book,async cleanup(){monitor.stop();const target=resolve(folder);assert.ok(target.startsWith(resolve(tempRoot)+sep));await rm(target,{recursive:true,force:true});}};
}
test('Extracts semantic content and official links, ignoring scripts and unrelated navigation',()=>{
  const result=extractPage(page('CBS &amp; IBS.','<a href="/novo-ato">Novo ato</a><a href="javascript:alert(1)">Bad</a><script>secret text</script>'),'https://www.gov.br/norma');
  assert.match(result.text,/CBS & IBS/);assert.doesNotMatch(result.text,/secret|Unrelated/);assert.equal(result.links.length,1);assert.equal(result.links[0].url,'https://www.gov.br/novo-ato');
  assert.throws(()=>extractPage('<html><body>captcha</body></html>','https://www.gov.br'),/barreira/);
  assert.throws(()=>assertPublicSource('http://127.0.0.1/'),/HTTPS/);assert.throws(()=>assertPublicSource('https://www.gov.br.attacker.test/'),/domínios/);
  const index=extractPage(`<html><body><main><article>${'Ato conjunto inicial. '.repeat(10)}</article><article><a href="/segundo-ato">Segundo ato conjunto</a></article></main></body></html>`,'https://www.gov.br');
  assert.match(index.text,/Segundo ato/);assert.ok(index.links.some(link=>link.url.endsWith('/segundo-ato')));
});
test('Baseline is idempotent; later changes retain snapshots and require analysis',async()=>{
  let body=page('Redação inicial.');const f=await fixture(async()=>new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
  try{
    let result=await f.monitor.sync();assert.equal(result.changes.length,0);const initial=result.sources[0].fingerprint;
    const snapshot=await f.monitor.snapshot('norma',initial);
    await f.monitor.sync();assert.deepEqual(await f.monitor.snapshot('norma',initial),snapshot);
    body=page('Redação nova.','<a href="https://www.gov.br/novo-ato">Nova regulamentação</a>');
    result=await f.monitor.sync();assert.equal(result.changes.length,1);assert.equal(result.changes[0].status,'pending');assert.equal(result.changes[0].before,initial);assert.equal(result.changes[0].newLinks.length,1);assert.equal(result.rules[0].needsReview,true);assert.equal(result.rules[0].executable,false);
    assert.equal((await f.monitor.snapshot('norma',initial)).text,snapshot.text);
    await f.monitor.review(result.changes[0].id,{reviewer:'Equipe Fiscal',note:'Revisar o enquadramento antes de publicar uma nova regra.'});
    result=await f.monitor.summary('2026-11-23');assert.equal(result.changes[0].status,'reviewed');assert.equal(result.rulebookVersion,'test.1');assert.equal(result.rules[0].executable,false);
    const restored=new Governance({dataDir:f.monitor.dataDir,configDir:f.configDir});assert.equal((await restored.summary()).changes.length,1);
  }finally{await f.cleanup();}
});
test('Network failure and empty content preserve the last valid source and report unconfirmed health',async()=>{
  let broken=false;const f=await fixture(async()=>broken?new Response('<html><body></body></html>',{headers:{'Content-Type':'text/html'}}):new Response(page('Primeira referência.'),{headers:{'Content-Type':'text/html'}}));
  try{const valid=await f.monitor.sync();broken=true;const failed=await f.monitor.sync();assert.equal(failed.sources[0].fingerprint,valid.sources[0].fingerprint);assert.equal(failed.sources[0].status,'error');assert.equal(failed.lastRun.errors,1);assert.equal(failed.rules[0].sourceHealth,'unconfirmed');assert.equal(failed.changes.length,0);}finally{await f.cleanup();}
});
test('Discovers individual act pages at one level and retains a single initial analysis record',async()=>{
  const f=await fixture(async url=>new Response(url.endsWith('/ato-1')?page('Texto do ato individual.'):page('Índice de atos.','<a href="https://www.gov.br/norma/ato-1">Ato conjunto 1</a><a href="https://attacker.test/norma/ato-2">Ato falso</a>'),{headers:{'Content-Type':'text/html'}}));
  try{
    f.sources[0].followDocuments=true;await writeFile(join(f.configDir,'sources.json'),JSON.stringify(f.sources));
    let result=await f.monitor.sync();assert.equal(result.sources.length,3);assert.equal(result.changes.length,1);assert.equal(result.changes[0].kind,'novo-documento');assert.equal(result.changes[0].before,null);
    result=await f.monitor.sync();assert.equal(result.sources.length,3);assert.equal(result.changes.length,1);
  }finally{await f.cleanup();}
});
test('GitHub changelog is read at the exact commit; commit-only changes are detected',async()=>{
  let sha='a'.repeat(40),visited=[];
  const f=await fixture(async url=>{visited.push(url);if(url.includes('api.github.com'))return Response.json({sha,commit:{message:'Atualização técnica',committer:{date:'2026-11-23T12:00:00Z'}}});return new Response('# Changelog\n\n## [1.7.2] - 2026-11-18\n\nDescrição da versão.');});
  try{
    f.sources[0]={id:'norma',name:'RTC',type:'github',category:'motor',repository:'ReceitaFederal/calculadora-rtc-regime-regular',url:'https://github.com/ReceitaFederal/calculadora-rtc-regime-regular'};await writeFile(join(f.configDir,'sources.json'),JSON.stringify(f.sources));
    let result=await f.monitor.sync();assert.equal(result.sources[0].metadata.version,'1.7.2');assert.ok(visited.some(url=>url.includes(`/${'a'.repeat(40)}/CHANGELOG.md`)));
    sha='b'.repeat(40);result=await f.monitor.sync();assert.equal(result.changes.length,1);assert.equal(result.changes[0].kind,'motor');
  }finally{await f.cleanup();}
});
test('PDF collection preserves the original bytes and detects binary changes without treating text as a formula',async()=>{
  let bytes=Buffer.from('%PDF-1.7 fixture one');const f=await fixture(async()=>new Response(bytes,{headers:{'Content-Type':'application/pdf'}}));
  f.monitor.pdfExtractor=async()=>('Texto extraído do ato oficial. '.repeat(5));
  try{
    let result=await f.monitor.sync();const first=await f.monitor.snapshot('norma',result.sources[0].fingerprint);assert.equal(first.metadata.format,'pdf');assert.deepEqual(await f.monitor.pdf(first.metadata.pdfHash),bytes);
    bytes=Buffer.from('%PDF-1.7 fixture two');result=await f.monitor.sync();assert.equal(result.changes.length,1);assert.equal(result.rules[0].executable,false);assert.notEqual(result.sources[0].fingerprint,first.fingerprint);
  }finally{await f.cleanup();}
});
test('Rulebook validates periods and cannot claim executable formulas; future and conditional are distinct',async()=>{
  const f=await fixture(async()=>new Response(page('Fonte válida.'),{headers:{'Content-Type':'text/html'}}));
  try{
    assert.throws(()=>validateRulebook({...f.book,rules:[{...f.book.rules[0],executable:true}]},new Set(['norma'])),/escopo/);
    assert.throws(()=>validateRulebook({...f.book,rules:[{...f.book.rules[0],validTo:'2025-01-01'}]},new Set(['norma'])),/Intervalo/);
    assert.equal((await f.monitor.summary('2025-01-01')).rules[0].temporalStatus,'future');assert.equal((await f.monitor.summary('2027-01-01')).rules[0].temporalStatus,'expired');
    const context=await f.monitor.context({version:'instalada-1'});const original=await f.monitor.readContext(context.id);f.book.version='test.2';await writeFile(join(f.configDir,'rules.json'),JSON.stringify(f.book));
    const updated=await f.monitor.context({version:'instalada-2'});assert.notEqual(context.rulebookHash,updated.rulebookHash);assert.equal((await f.monitor.readContext(original.id)).rulebookVersion,'test.1');assert.equal(original.rulebookExecutable,false);
  }finally{await f.cleanup();}
});
test('Corrupt stored state is not silently replaced and off-domain redirects are rejected',async()=>{
  const f=await fixture(async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secrets'}}));
  try{await assert.rejects(()=>f.monitor.request('https://www.gov.br/norma'),/HTTPS/);await mkdir(f.monitor.dataDir,{recursive:true});await writeFile(join(f.monitor.dataDir,'state.json'),'{broken');await assert.rejects(()=>f.monitor.state(),/não serão reinicializados/);assert.equal(await readFile(join(f.monitor.dataDir,'state.json'),'utf8'),'{broken');}finally{await f.cleanup();}
});
test('HTTP monitor endpoints collect, expose evidence and validate review input',async()=>{
  let body=page('Versão A.');const f=await fixture(async()=>new Response(body,{headers:{'Content-Type':'text/html'}}));
  const app=createApp(undefined,{governance:f.monitor});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.address().port}`;
  try{
    let response=await fetch(base+'/api/governance/sync',{method:'POST'});assert.equal(response.status,200);const initial=await response.json();
    response=await fetch(base+`/api/governance/evidence/norma/${initial.sources[0].fingerprint}`);assert.equal(response.status,200);assert.match((await response.json()).text,/Versão A/);
    body=page('Versão B.');const changed=await(await fetch(base+'/api/governance/sync',{method:'POST'})).json();
    response=await fetch(base+`/api/governance/changes/${changed.changes[0].id}/review`,{method:'POST',body:JSON.stringify({reviewer:'A',note:'curta'})});assert.equal(response.status,400);
    response=await fetch(base+'/api/governance/summary?date=invalid');assert.equal(response.status,400);
    assert.equal((await fetch(base+'/config/rules.json')).status,404);
  }finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await f.cleanup();}
});
