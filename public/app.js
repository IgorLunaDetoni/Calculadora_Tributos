import {STATES,UF_CODES,validateDraft,demonstration,buildPayload,normalizeOfficial,splitProjection,formatMoney,validCnpj,formatCnpj,cleanCnpj,round} from './domain.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = formatMoney;
const KEY = 'nexxera.tributos.v1';
const demoCompany = {id:'demo',name:'Empresa de demonstração',regime:'regular',uf:'SP',ibge:'3550308',city:'São Paulo'};
let state = {version:1,companies:[],history:[],active:'demo'};
let committed = null, lastPreview = null, busy = false, toastTimer;
try {
  const stored = JSON.parse(localStorage.getItem(KEY)||'null');
  if(stored) state = validateBackup(stored);
} catch { setTimeout(()=>toast('Não foi possível recuperar os dados locais. Você pode importar um backup.',true),100); }
const company = () => state.companies.find(c=>c.id===state.active)||demoCompany;
function toast(message,error=false) {
  clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').className=`toast visible${error?' error':''}`;
  toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),6500);
}
function persist(next) {
  try { localStorage.setItem(KEY,JSON.stringify(next));state=next;return true; }
  catch { toast('Não foi possível salvar. Verifique o espaço e a permissão de armazenamento do navegador.',true);return false; }
}
function uid() { return crypto.randomUUID(); }
function localDate() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function readableDate(value) { return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value)); }
function validateBackup(value) {
  if(value?.version!==1 || !Array.isArray(value.companies) || !Array.isArray(value.history) || value.companies.length>100 || value.history.length>300) throw new Error('Backup incompatível ou acima do limite de 100 empresas e 300 operações.');
  const ids = new Set(), cnpjs = new Set();
  const companies=value.companies.map(c=>{
    if(!c || typeof c.id!=='string' || c.id==='demo' || ids.has(c.id) || !validCnpj(c.cnpj) || cnpjs.has(cleanCnpj(c.cnpj)) || typeof c.name!=='string' || !c.name.trim() || c.name.length>140 || !['regular','simples'].includes(c.regime) || !STATES.includes(c.uf) || !/^\d{7}$/.test(c.ibge) || typeof c.city!=='string' || !c.city.trim()) throw new Error('O backup contém um cadastro inválido ou duplicado.');
    ids.add(c.id);cnpjs.add(cleanCnpj(c.cnpj));
    return {id:c.id,name:c.name,trade:String(c.trade||'').slice(0,100),cnpj:cleanCnpj(c.cnpj),regime:c.regime,uf:c.uf,city:c.city.slice(0,80),ibge:c.ibge,cnae:String(c.cnae||'').slice(0,9),email:String(c.email||'').slice(0,140)};
  });
  const historyIds = new Set();
  const history=value.history.map(entry=>{
    if(!entry || typeof entry.id!=='string' || historyIds.has(entry.id) || !entry.draft || !entry.result || !entry.company || !Number.isFinite(Date.parse(entry.createdAt)) || !['demo','rtc'].includes(entry.result.source)) throw new Error('O backup contém uma operação inválida.');
    validateDraft(entry.draft);
    if([entry.result.cbs,entry.result.ibs,entry.result.is,entry.result.base,entry.result.total].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0)) throw new Error('Valores inválidos no histórico.');
    historyIds.add(entry.id);return entry;
  });
  return {version:1,companies,history,active:ids.has(value.active)?value.active:'demo'};
}
function download(name,value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function showJson(title,value,message='') {
  $('#detail-title').textContent=title;$('#detail-content').replaceChildren();
  if(message) {const p=document.createElement('p');p.className='error-banner';p.textContent=message;$('#detail-content').append(p);}
  const pre=document.createElement('pre');pre.textContent=JSON.stringify(value,null,2);$('#detail-content').append(pre);$('#detail-dialog').showModal();
}
function route() {
  const names={calculadora:'Calculadora de tributos',empresas:'Minhas empresas',historico:'Histórico de operações',fontes:'Reforma tributária',integracoes:'Integrações'};
  const page=location.hash.slice(1) in names?location.hash.slice(1):'calculadora';
  $$('.page').forEach(el=>el.classList.toggle('hidden',el.id!==`page-${page}`));
  $$('.nav-link').forEach(el=>{el.classList.toggle('active',el.dataset.page===page);if(el.dataset.page===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#breadcrumb-current').textContent=names[page];document.title=`${names[page]} | Nexxera`;
  if(page==='empresas') renderCompanies();
  if(page==='historico') renderHistory();
  if(page==='integracoes' && !$('#connection-list').children.length) renderConnections();
}
function syncCompany(setDestination=false) {
  const selected=company();
  $('#active-company').innerHTML=`<option value="demo">Empresa de demonstração</option>${state.companies.map(c=>`<option value="${escape(c.id)}">${escape(c.trade||c.name)}</option>`).join('')}`;
  $('#active-company').value=selected.id;$('#company-count').textContent=state.companies.length;
  $('#active-regime').textContent=selected.regime==='simples'?'Simples Nacional':'Regime regular';
  $('#edit-active-company').textContent=selected.id==='demo'?'Cadastrar minha empresa':'Editar cadastro';
  if(setDestination){$('#destination-uf').value=selected.uf;$('#municipality').value=selected.ibge;}
  $$('.simple-item-fields').forEach(el=>el.classList.toggle('hidden',selected.regime!=='simples'));
  $$('.simple-item-fields input').forEach(el=>el.required=selected.regime==='simples');
  $$('.selective-rate').forEach(el=>el.classList.toggle('hidden',selected.regime==='simples'));
  $$('.selective-value').forEach(el=>el.classList.toggle('hidden',selected.regime!=='simples'));
  renderPreview();
}
function addItem(value={}) {
  const item=document.createElement('div');item.className='item-card';
  item.innerHTML=`<div class="item-header"><strong class="item-title">Item</strong><button type="button" class="icon-button remove-item" aria-label="Remover item">${icon('trash')}</button></div>
    <div class="field-grid"><label>Base de cálculo (R$)<input class="item-base" type="number" min="0.01" max="999999999999" step="0.01" required value="${escape(value.base??'10000')}"></label><label class="code-label"><span>${$('#nature').value==='bem'?'NCM':'NBS'}</span><input class="item-code" required inputmode="numeric" pattern="${$('#nature').value==='bem'?'[0-9]{8}':'[0-9]{9}'}" value="${escape(value.code??($('#nature').value==='bem'?'84713012':'114051000'))}" maxlength="9"></label></div>
    <div class="field-grid"><label>CST<input class="item-cst" required value="${escape(value.cst??'000')}" pattern="[0-9]{3}" maxlength="3" inputmode="numeric"></label><label>Classificação tributária<input class="item-class" required value="${escape(value.classification??'000001')}" pattern="[0-9]{6}" maxlength="6" inputmode="numeric" aria-label="Código cClassTrib"></label></div>
    <div class="simple-item-fields ${company().regime==='simples'?'':'hidden'}"><label>Atividade do Simples (cAtivSN)<input class="item-activity" value="${escape(value.activity??'01')}" pattern="[0-9]{2}" maxlength="2" inputmode="numeric"></label></div>
    <button type="button" class="text-button lookup-item">${icon('book')}Consultar tabela oficial</button>
    <details class="selective-details"><summary>Imposto Seletivo (opcional)</summary><label class="selective-toggle"><input type="checkbox" class="item-selective" ${value.selective?'checked':''}> Incluir IS no cenário</label><div class="field-grid selective-rate ${company().regime==='simples'?'hidden':''}"><label>CST do IS<input class="item-is-cst" value="${escape(value.isCst??'000')}" pattern="[0-9]{3}" maxlength="3"></label><label>cClassTrib do IS<input class="item-is-class" value="${escape(value.isClass??'000001')}" pattern="[0-9]{6}" maxlength="6"></label><label>Alíquota ad valorem (%)<input class="item-is-rate" type="number" min="0" max="100" step="0.0001" value="${escape(value.isRate??'0')}"></label></div><div class="selective-value ${company().regime==='simples'?'':'hidden'}"><label>IS já apurado (R$)<input class="item-is-value" type="number" min="0" step="0.01" value="${escape(value.isValue??'0')}"></label></div><p class="field-help">No regular, a base informada será a base do IS e CBS/IBS serão derivados pelo motor. Suporte simplificado a IS ad valorem, a partir de 2027. No Simples, o IS é repassado sem recálculo.</p></details>`;
  $('#items').append(item);renumberItems();syncCompany();
}
function renumberItems() { $$('.item-card').forEach((el,i)=>{el.querySelector('.item-title').textContent=`Item ${String(i+1).padStart(2,'0')}`;el.querySelector('.remove-item').disabled=$$('.item-card').length===1;}); }
function draft() {
  return {description:$('#description').value.trim(),date:$('#operation-date').value,nature:$('#nature').value,uf:$('#destination-uf').value,municipality:$('#municipality').value,mode:$('#calculation-mode').value,document:$('#document-type').value,regime:company().regime,payment:$('#payment').value,split:$('#split-enabled').checked,
    rates:{cbs:$('#rate-cbs').value,uf:$('#rate-uf').value,mun:$('#rate-mun').value,simpleCbs:$('#simple-cbs').value,simpleIbs:$('#simple-ibs').value},
    items:$$('.item-card').map(el=>({base:el.querySelector('.item-base').value,code:el.querySelector('.item-code').value,cst:el.querySelector('.item-cst').value,classification:el.querySelector('.item-class').value,activity:el.querySelector('.item-activity').value,selective:el.querySelector('.item-selective').checked,isCst:el.querySelector('.item-is-cst').value,isClass:el.querySelector('.item-is-class').value,isRate:el.querySelector('.item-is-rate').value,isValue:el.querySelector('.item-is-value').value}))};
}
function syncMode() {
  const d=draft(),simple=d.regime==='simples',automatic=d.mode==='official'&&!simple&&+d.date.slice(0,4)<2027;
  $('#regular-rates').classList.toggle('hidden',simple||automatic);$('#simple-rates').classList.toggle('hidden',!simple);$('#automatic-rates').classList.toggle('hidden',!automatic);
  $$('#regular-rates input').forEach(input=>{input.disabled=simple||automatic;input.required=!simple&&!automatic;});
  $$('#simple-rates input').forEach(input=>{input.disabled=!simple;input.required=simple;});
  $$('.item-card').forEach(el=>{
    const selected=el.querySelector('.item-selective').checked;
    const cst=el.querySelector('.item-cst');cst.disabled=simple;cst.required=!simple;cst.closest('label').classList.toggle('hidden',simple);
    const activity=el.querySelector('.item-activity');activity.disabled=!simple;activity.required=simple;
    for(const name of ['rate','cst','class']){const input=el.querySelector(`.item-is-${name}`);input.disabled=!selected||simple;input.required=selected&&!simple;}
    const value=el.querySelector('.item-is-value');value.disabled=!selected||!simple;value.required=selected&&simple;
  });
  $('#rates-heading').textContent=simple?'Alíquotas efetivas do Simples':'Alíquotas do cenário';
  $('#rates-help').textContent=d.mode==='demo'?'Percentuais ilustrativos, sem benefícios ou regimes especiais.':simple?'Use as alíquotas efetivas válidas do contribuinte.':automatic?'Alíquotas consultadas na base da instância conectada.':'A partir de 2027, este contrato exige alíquotas nominais informadas e retorna cálculo simulado.';
  $('#mode-notice').innerHTML=d.mode==='demo'?'<strong>Explore antes de conectar.</strong> O modo demonstrativo usa alíquotas ilustrativas. Conecte as APIs RTC para consultar o motor oficial.':'<strong>Modo API RTC.</strong> O cálculo depende da instância conectada e da vigência de sua base. Erros da API não são substituídos por estimativas.';
}
function renderPreview() {
  committed=null;lastPreview=null;$('#save-operation').disabled=true;$('#export-operation').disabled=true;syncMode();
  const d=draft();
  if(d.mode==='official'){renderResult(null,null,'Aguardando cálculo','Preencha a operação e consulte a API RTC.');return;}
  try {validateDraft(d);lastPreview=demonstration(d);const split=splitProjection(lastPreview,d.payment,d.split);renderResult(lastPreview,split,'Prévia demonstrativa');}
  catch(error) {renderResult(null,null,'Revise os dados',error.message);}
}
function renderResult(result,split,badge,message) {
  const valid=!!result;
  $('#result-badge').textContent=badge;$('#result-badge').className=`badge${result?.source==='rtc'&&!result.simulated?' success':result?.simulated&&result?.source==='rtc'?' warn':''}`;
  $('#total-tax').textContent=valid?money(result.total):'—';
  $('#effective-rate').textContent=valid?`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(result.base?result.total/result.base*100:0)}% da base informada`:'O resultado aparecerá aqui';
  for (const key of ['cbs','ibs','is','base']) $(`#result-${key}`).textContent=valid?money(result[key]):'—';
  for(const key of ['cbs','ibs','is']) $(`#${key}-bar`).style.width=valid&&result.total?`${result[key]/result.total*100}%`:'0%';
  $('#result-warning').textContent=message||result?.warning||'Não há resultado calculado.';
  $('#split-payment').textContent=split?money(split.payment):'—';$('#split-net').textContent=split?money(split.net):'—';$('#split-tax').textContent=split?money(split.segregated):'—';
  $('#split-footnote').textContent=split?.enabled===false?'Split desativado neste cenário. O total pago é destinado à empresa; os tributos permanecem destacados no resumo.':`Projeção sem créditos, compensações ou débitos já extintos. Não realiza retenção ou recolhimento. O IS não integra esta segregação.${company().regime==='simples'?' No Simples, a aplicabilidade do split depende do enquadramento e das regras vigentes.':''}`;
}
function openCompany(id) {
  const c=state.companies.find(c=>c.id===id);$('#company-form').reset();$('#company-error').textContent='';
  $('#company-dialog-title').textContent=c?'Editar empresa':'Cadastrar empresa';$('#company-id').value=c?.id||'';
  for(const [suffix,key] of [['name','name'],['trade','trade'],['cnpj','cnpj'],['regime','regime'],['cnae','cnae'],['uf','uf'],['city','city'],['ibge','ibge'],['email','email']]) $(`#company-${suffix}`).value=c?.[key]??(suffix==='uf'?'SP':suffix==='regime'?'regular':'');
  if(c)$('#company-cnpj').value=formatCnpj(c.cnpj);$('#company-dialog').showModal();
}
function renderCompanies() {
  $('#company-list').innerHTML=state.companies.length?state.companies.map(c=>`<article class="panel company-card"><span class="square-icon">${icon('building')}</span><h2>${escape(c.trade||c.name)}</h2><p>${escape(c.name)}</p><p>${escape(formatCnpj(c.cnpj))}</p><span class="regime-badge">${c.regime==='regular'?'Regime regular':'Simples Nacional'}</span><p>${escape(c.city)} · ${escape(c.uf)}</p><div class="card-actions"><button class="button secondary" data-select="${escape(c.id)}">Usar na calculadora</button><button class="text-button" data-edit="${escape(c.id)}">Editar</button><button class="text-button danger" data-delete-company="${escape(c.id)}">Excluir</button></div></article>`).join(''):`<div class="empty-state"><span class="square-icon">${icon('building')}</span><h2>Sua primeira empresa começa aqui</h2><p>Salve o cadastro para agilizar suas próximas simulações.</p><button class="button primary" data-new-company>Cadastrar empresa</button></div>`;
}
function renderHistory() {
  const query=$('#history-search').value.toLocaleLowerCase('pt-BR');
  const entries=state.history.filter(e=>`${e.draft.description} ${e.company.name}`.toLocaleLowerCase('pt-BR').includes(query));
  $('#history-list').innerHTML=entries.length?entries.map(e=>`<article class="panel history-entry"><span class="square-icon">${icon('calc')}</span><div><h3>${escape(e.draft.description)}</h3><p>${escape(e.company.name)} · ${escape(readableDate(e.createdAt))}</p></div><div class="history-amount"><strong>${money(e.result.total)}</strong><span class="badge">${e.result.source==='demo'?'Demonstração':e.result.simulated?'RTC · simulado':'API RTC'}</span></div><div class="card-actions"><button class="text-button" data-view-history="${escape(e.id)}">Ver memória</button><button class="icon-button" data-export-history="${escape(e.id)}" aria-label="Exportar operação">${icon('download')}</button><button class="icon-button" data-delete-history="${escape(e.id)}" aria-label="Excluir operação">${icon('trash')}</button></div></article>`).join(''):`<div class="empty-state"><span class="square-icon">${icon('clock')}</span><h2>${query?'Nenhuma operação encontrada':'Suas operações, em um só lugar'}</h2><p>${query?'Tente buscar outra descrição ou empresa.':'Calcule e salve uma operação para consultar a memória depois.'}</p>${query?'':'<a href="#calculadora" class="button primary">Criar uma operação</a>'}</div>`;
}
function showHistory(entry) {
  $('#detail-title').textContent=entry.draft.description;
  $('#detail-content').innerHTML=`<span class="badge">${entry.result.source==='demo'?'Demonstração':entry.result.simulated?'RTC · simulado':'API RTC'}</span><div class="detail-summary"><div><small>Empresa</small><strong>${escape(entry.company.name)}</strong></div><div><small>Salva em</small><strong>${escape(readableDate(entry.createdAt))}</strong></div><div><small>CBS</small><strong>${money(entry.result.cbs)}</strong></div><div><small>IBS</small><strong>${money(entry.result.ibs)}</strong></div><div><small>IS</small><strong>${money(entry.result.is)}</strong></div><div><small>Total de tributos</small><strong>${money(entry.result.total)}</strong></div></div><p class="field-help">${escape(entry.result.warning)}</p><h3>Dados e memória de cálculo</h3>`;
  const pre=document.createElement('pre');pre.textContent=JSON.stringify(entry,null,2);$('#detail-content').append(pre);$('#detail-dialog').showModal();
}
function renderConnections(services=[]) {
  $('#connection-list').innerHTML=[['regular','Regime regular','RTC_REGULAR_URL','http://127.0.0.1:8080/api'],['simples','Simples Nacional','RTC_SIMPLES_URL','http://127.0.0.1:8082/api']].map(([name,title,env,base])=>{
    const service=services.find(s=>s.name===name);
    return `<article class="panel source-card"><span class="source-tag">API RECEITA FEDERAL</span><h2>${title}</h2><p>Variável do servidor: <code>${env}</code></p><p>Endereço padrão: <code>${base}</code></p><span class="connection-status ${service?(service.connected?'online':'offline'):''}">${service?(service.connected?'Instância acessível':'Instância indisponível'):'Conexão ainda não verificada'}</span>${service?.connected?'<p class="field-help">Serviço de versão acessível. O cálculo será validado ao enviar a operação.</p>':''}</article>`;
  }).join('');
}

for(const select of [$('#destination-uf'),$('#company-uf')]) {select.innerHTML=STATES.map(uf=>`<option>${uf}</option>`).join('');select.value='SP';}
$('#operation-date').value=localDate();
addItem();syncCompany();route();
window.addEventListener('hashchange',route);
$('#help-button').addEventListener('click',()=>location.hash='fontes');
$('#close-detail').addEventListener('click',()=>$('#detail-dialog').close());
$$('.close-dialog').forEach(button=>button.addEventListener('click',()=>$('#company-dialog').close()));
$('#company-cnpj').addEventListener('input',()=>{$('#company-cnpj').value=$('#company-cnpj').value.toUpperCase();$('#company-error').textContent='';});
$('#company-cnpj').addEventListener('blur',()=>{$('#company-cnpj').value=formatCnpj($('#company-cnpj').value);});
$('#company-form').addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;const id=$('#company-id').value||uid();
  const c={id,name:$('#company-name').value.trim(),trade:$('#company-trade').value.trim(),cnpj:cleanCnpj($('#company-cnpj').value),regime:$('#company-regime').value,cnae:$('#company-cnae').value.trim(),uf:$('#company-uf').value,city:$('#company-city').value.trim(),ibge:$('#company-ibge').value,email:$('#company-email').value.trim()};
  if(!c.name||!c.city){$('#company-error').textContent='Informe a razão social e o município.';return;}
  if(!validCnpj(c.cnpj)){$('#company-error').textContent='CNPJ inválido. Confira os caracteres e os dígitos verificadores.';return;}
  if(!c.ibge.startsWith(UF_CODES[c.uf])){$('#company-error').textContent='O código IBGE não corresponde à UF.';return;}
  if(state.companies.some(other=>other.id!==id&&other.cnpj===c.cnpj)){$('#company-error').textContent='Este CNPJ já está cadastrado. Edite o cadastro existente.';return;}
  if(state.companies.length>=100&&!state.companies.some(other=>other.id===id)){toast('Limite de 100 empresas atingido.',true);return;}
  const next={...state,active:id,companies:[...state.companies.filter(other=>other.id!==id),c]};
  if(persist(next)){$('#company-dialog').close();syncCompany(true);renderCompanies();toast('Cadastro salvo. A empresa está pronta para simular.');}
});
$('#active-company').addEventListener('change',()=>{if(persist({...state,active:$('#active-company').value}))syncCompany(true);});
$('#edit-active-company').addEventListener('click',()=>openCompany(state.active));
$('#nature').addEventListener('change',()=>{
  const goods=$('#nature').value==='bem';
  $$('.code-label').forEach(label=>{label.querySelector('span').textContent=goods?'NCM':'NBS';label.querySelector('input').value='';label.querySelector('input').pattern=goods?'[0-9]{8}':'[0-9]{9}';});
  $('#document-type').value=goods?'55':'nfse';renderPreview();
});
$('#operation-form').addEventListener('input',()=>renderPreview());
$('#operation-form').addEventListener('change',()=>renderPreview());
$('#add-item').addEventListener('click',()=>{if($$('.item-card').length>=50){toast('Limite de 50 itens por operação.',true);return;}addItem({base:'',code:''});});
$('#items').addEventListener('click',async event=>{
  const remove=event.target.closest('.remove-item');
  if(remove&&$$('.item-card').length>1){remove.closest('.item-card').remove();renumberItems();renderPreview();}
  const lookup=event.target.closest('.lookup-item');
  if(!lookup)return;
  const classification=lookup.closest('.item-card').querySelector('.item-class').value;
  if(!/^\d{6}$/.test(classification)||!$('#operation-date').value){toast('Informe uma data e um cClassTrib válido para consultar.',true);return;}
  lookup.disabled=true;
  try {
    const simple=company().regime==='simples';
    const path=simple?`/api/rtc/simples/activities?data=${$('#operation-date').value}&cClassTrib=${classification}&tpDoc=${$('#document-type').value}`:`/api/rtc/regular/dados-abertos/classificacoes-tributarias/cbs-ibs/class-trib/${classification}?data=${$('#operation-date').value}`;
    const response=await fetch(path,{signal:AbortSignal.timeout(25000)});const data=await response.json();
    if(!response.ok)throw new Error(data.error||data.detail||'A tabela oficial não está disponível para esta consulta.');
    showJson(simple?'Atividades oficiais para a classificação':'Classificação tributária oficial',data);
  } catch(error){toast(error.message,true);}finally{lookup.disabled=false;}
});
$('#operation-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  committed=null;$('#save-operation').disabled=true;$('#export-operation').disabled=true;
  const d=draft();const id=uid();let responseBody,payload;
  try {
    validateDraft(d);busy=true;$('#calculate-button').disabled=true;$('#calculate-button').textContent=d.mode==='official'?'Consultando RTC…':'Calculando…';
    // Freeze the form so a delayed response can never be attached to changed inputs.
    const controls=$$('#operation-form input, #operation-form select, #operation-form button, #active-company, #edit-active-company');
    controls.forEach(control=>control.disabled=true);
    let result;
    if(d.mode==='demo')result=demonstration(d);
    else {
      payload=buildPayload(d,id);
      const response=await fetch(`/api/rtc/${d.regime==='simples'?'simples':'regular'}/calculate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
      responseBody=await response.json();
      if(!response.ok)throw new Error(responseBody.error||responseBody.detail||responseBody.title||`A instância RTC retornou HTTP ${response.status}.`);
      result=normalizeOfficial(responseBody,d.regime,round(d.items.reduce((sum,item)=>sum+Number(item.base),0)),d.items.length);
      if(response.headers.get('x-warning-dados-simulados')){result.simulated=true;result.warning=`Aviso RTC: ${response.headers.get('x-warning-dados-simulados')}`;}
    }
    const split=splitProjection(result,d.payment,d.split);
    committed={id,createdAt:new Date().toISOString(),company:{...company()},draft:d,result,split,...(payload?{request:payload,response:responseBody}:{})};
    renderResult(result,split,result.source==='demo'?'Demonstração calculada':result.simulated?'RTC · cálculo simulado':'Calculado pela API RTC');
    $('#save-operation').disabled=false;$('#export-operation').disabled=false;toast(d.mode==='demo'?'Cenário demonstrativo calculado. Você pode salvar a operação.':'Resposta RTC recebida e validada.');
  } catch(error){renderResult(null,null,'Cálculo não concluído',error.message);toast(error.message,true);if(responseBody)showJson('A API não concluiu a operação',responseBody,error.message);}
  finally {busy=false;$$('#operation-form input, #operation-form select, #operation-form button, #active-company, #edit-active-company').forEach(control=>control.disabled=false);syncMode();renumberItems();$('#calculate-button').innerHTML=`${icon('calc')}Calcular operação`;}
});
$('#save-operation').addEventListener('click',()=>{
  if(!committed)return;
  if(state.history.length>=300){toast('Limite de 300 operações. Exporte um backup e remova registros antigos.',true);return;}
  if(state.history.some(e=>e.id===committed.id)){toast('Esta operação já está salva no histórico.');return;}
  if(persist({...state,history:[committed,...state.history]})){$('#save-operation').disabled=true;toast('Operação salva no histórico.');}
});
$('#export-operation').addEventListener('click',()=>{if(committed)download(`operacao-${committed.id}.json`,committed);});
$('#history-search').addEventListener('input',renderHistory);
$('#export-backup').addEventListener('click',()=>download(`nexxera-backup-${localDate()}.json`,state));
$('#import-backup').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>5000000)throw new Error('O backup deve ter até 5 MB.');
    const incoming=validateBackup(JSON.parse(await file.text()));
    // Merge without replacing existing records. Conflicting CNPJs reuse the existing company.
    const companies=[...state.companies], mapping=new Map();
    for(const c of incoming.companies){const existing=companies.find(other=>other.id===c.id||other.cnpj===c.cnpj);if(existing)mapping.set(c.id,existing.id);else companies.push(c);}
    const history=[...state.history];
    for(const e of incoming.history)if(!history.some(other=>other.id===e.id))history.push({...e,company:{...e.company,id:mapping.get(e.company.id)||e.company.id}});
    const next=validateBackup({...state,companies,history});
    if(persist(next)){syncCompany();renderCompanies();renderHistory();toast('Backup importado. Cadastros existentes foram preservados.');}
  } catch(error){toast(error.message||'Arquivo de backup inválido.',true);}finally{event.target.value='';}
});
$('#check-connection').addEventListener('click',async()=>{
  const button=$('#check-connection');button.disabled=true;button.textContent='Verificando…';
  try {const response=await fetch('/api/status',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const data=await response.json();renderConnections(data.services);toast(data.services.every(s=>s.connected)?'As duas instâncias responderam.':'Verificação concluída. Confira a disponibilidade de cada instância.');}
  catch{renderConnections([{name:'regular',connected:false},{name:'simples',connected:false}]);toast('Servidor local indisponível. Inicie a aplicação com npm start.',true);}
  finally{button.disabled=false;button.textContent='Verificar conexão';}
});
document.addEventListener('click',event=>{
  if(busy&&event.target.closest('[data-new-company], [data-edit], [data-select], [data-delete-company]')){toast('Aguarde o cálculo para alterar a empresa.');return;}
  const newCompany=event.target.closest('[data-new-company]');if(newCompany){if(busy)return;openCompany();}
  const edit=event.target.closest('[data-edit]');if(edit)openCompany(edit.dataset.edit);
  const select=event.target.closest('[data-select]');if(select){if(busy)return;if(persist({...state,active:select.dataset.select})){syncCompany(true);location.hash='calculadora';}}
  const remove=event.target.closest('[data-delete-company]');if(remove){
    const c=state.companies.find(c=>c.id===remove.dataset.deleteCompany);
    if(c&&confirm(`Excluir o cadastro de ${c.name}? O histórico de operações será preservado.`))if(persist({...state,companies:state.companies.filter(other=>other.id!==c.id),active:state.active===c.id?'demo':state.active})){syncCompany();renderCompanies();toast('Cadastro excluído.');}
  }
  for(const [attr,action] of [['viewHistory',showHistory],['exportHistory',entry=>download(`operacao-${entry.id}.json`,entry)],['deleteHistory',entry=>{if(confirm('Excluir esta operação do histórico?'))if(persist({...state,history:state.history.filter(e=>e.id!==entry.id)})){renderHistory();toast('Operação excluída.');}}]]){
    const name=attr.replace(/[A-Z]/g,m=>`-${m.toLowerCase()}`),button=event.target.closest(`[data-${name}]`);if(button){const entry=state.history.find(e=>e.id===button.dataset[attr]);if(entry)action(entry);}
  }
});
