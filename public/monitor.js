const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateTime=value=>value?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'Sem coleta';
const dateOnly=value=>value?value.split('-').reverse().join('/'):'A confirmar';
let data=null,loading=false,syncing=false;
const dateInput=$('#rules-date');
dateInput.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const error=message=>{$('#monitor-error').textContent=message;$('#monitor-error').classList.toggle('hidden',!message);};
const sourceLink=source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a>`;
async function api(path,options={}) {
  const response=await fetch(path,{...options,signal:AbortSignal.timeout(65000)});
  const value=await response.json();if(!response.ok)throw new Error(value.error||'Não foi possível consultar o monitor.');return value;
}
export async function loadMonitor() {
  if(loading)return;loading=true;
  try{data=await api(`/api/governance/summary?date=${dateInput.value}`);render();error('');if(data.running&&!$('#page-monitoramento').classList.contains('hidden'))setTimeout(()=>{if(!$('#page-monitoramento').classList.contains('hidden'))void loadMonitor();},2500);}
  catch(e){error(e.message);}finally{loading=false;}
}
function render() {
  if(!data)return;
  const automatic=data.sources.filter(s=>s.type!=='manual'),ok=automatic.filter(s=>s.status==='ok').length;
  $('#monitor-sources-count').textContent=`${ok} / ${automatic.length}`;
  $('#monitor-last-run').textContent=`Última coleta: ${dateTime(data.lastRun?.finishedAt)}`;
  $('#monitor-pending').textContent=data.changes.filter(c=>c.status==='pending').length;
  $('#monitor-book-version').textContent=data.rulebookVersion;
  $('#monitor-book-date').textContent=`Referências verificadas em ${dateOnly(data.verifiedOn)}`;
  $('#monitor-sources').innerHTML=data.sources.map(source=>{
    const label=source.type==='manual'?'Consulta manual':source.status==='ok'?'Coleta válida':source.status==='error'?'Falha na coleta':'Aguardando coleta';
    return `<article class="panel monitor-source"><div class="monitor-source-top"><span class="source-tag">${esc(source.category)}</span><span class="monitor-status ${source.status==='ok'?'good':source.status==='error'?'bad':''}">${label}</span></div><h3>${esc(source.name)}</h3><p>${esc(source.scope)}</p>${source.metadata?.version?`<div class="source-version">Disponível no changelog <strong>${esc(source.metadata.version)}</strong><small>${dateOnly(source.metadata.releasedOn)} · commit ${esc(source.metadata.sha.slice(0,10))}</small></div>`:''}<small class="source-collected">Último sucesso: ${dateTime(source.lastSuccessAt)}</small>${source.error?`<p class="source-error">${esc(source.error)}</p>`:''}<div class="monitor-source-actions">${sourceLink(source)}${source.fingerprint?`<button class="text-button" data-evidence-source="${esc(source.id)}" data-evidence-hash="${esc(source.fingerprint)}">Ver cópia</button>`:''}</div></article>`;
  }).join('');
  renderRules();renderChanges();
}
function renderRules() {
  if(!data)return;
  const regime=$('#rules-regime').value,date=dateInput.value;
  const rules=data.rules.filter(r=>regime==='all'||r.regimes.includes(regime));
  $('#monitor-rules').innerHTML=rules.map(rule=>{
    const state=!rule.validFrom?'Condição a confirmar':date<rule.validFrom?'Período futuro':rule.validTo&&date>rule.validTo?'Fora do período':'Dentro do período';
    return `<article class="rule-card"><div class="rule-card-heading"><h3>${esc(rule.title)}</h3><span class="monitor-status ${rule.needsReview?'review':''}">${rule.needsReview?'Fonte alterada · reavaliar':state}</span></div><p>${esc(rule.summary)}</p><div class="rule-parameters">${Object.entries(rule.parameters).map(([name,value])=>`<span>${({cbsPercent:'CBS',ibsStatePercent:'IBS estadual',ibsMunicipalPercent:'IBS municipal'})[name]||esc(name)} <strong>${esc(value.replace('.',','))}%</strong></span>`).join('')}</div><ul>${rule.conditions.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><div class="rule-meta"><span>${dateOnly(rule.validFrom)}${rule.validTo?` a ${dateOnly(rule.validTo)}`:rule.validFrom?' · sem término informado':''}</span><span>${rule.regimes.map(r=>r==='regular'?'Regime regular':'Simples Nacional').join(' · ')}</span><span>${rule.sourceHealth==='checked'?'Fontes com coleta válida':'Fontes ainda não confirmadas pelo coletor'}</span></div><details><summary>Fundamentação e fontes</summary><p>${esc(rule.legalBasis)}</p><div class="rule-source-links">${rule.sourceIds.map(id=>data.sources.find(s=>s.id===id)).filter(Boolean).map(sourceLink).join(' · ')}</div><p class="rule-disclaimer">Referência informativa, sem aplicação automática ao cálculo. O período informado não valida as condições da empresa.</p></details></article>`;
  }).join('')||'<p class="status-text">Nenhuma referência cadastrada para este regime.</p>';
}
function renderChanges() {
  if(!data)return;
  const filter=$('#changes-filter').value;
  const changes=data.changes.filter(c=>filter==='all'||c.status===filter);
  $('#monitor-changes').innerHTML=changes.length?changes.map(change=>{
    const source=data.sources.find(s=>s.id===change.sourceId);
    return `<article class="change-row"><div><span class="monitor-status ${change.status==='pending'?'review':'good'}">${change.status==='pending'?'Análise pendente':'Analisada'}</span><h3>${esc(source?.name||change.sourceId)}</h3><p>Detectada em ${dateTime(change.detectedAt)} · ${change.kind==='coleta'?'Conector ajustado; comparar referência':change.kind==='motor'?'Atualização técnica':change.kind==='novo-documento'?'Novo ato encontrado':'Mudança de conteúdo'}${change.newLinks.length?` · ${change.newLinks.length} novo(s) link(s)`:''}</p>${change.review?`<p>Análise registrada por ${esc(change.review.reviewer)}</p>`:''}</div><button class="button secondary" data-view-change="${esc(change.id)}">Comparar versões</button></article>`;
  }).join(''):`<div class="monitor-empty"><strong>${filter==='reviewed'?'Nenhuma análise registrada':'Nenhuma mudança nesta seleção'}</strong><p>A primeira coleta cria a referência inicial. As próximas verificações identificam alterações. Ausência de alertas não comprova cobertura de todas as normas.</p></div>`;
}
function download(filename,value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openDialog(title,html) {$('#monitor-dialog-title').textContent=title;$('#monitor-detail').innerHTML=html;if(!$('#monitor-dialog').open)$('#monitor-dialog').showModal();}
function showChange(change) {
  const source=data.sources.find(s=>s.id===change.sourceId);
  openDialog(source?.name||'Mudança detectada',`<div class="notice monitor-notice"><div>Comparação textual limitada aos primeiros 20 trechos de cada lado. A data de detecção não é a publicação nem a produção de efeitos da norma. Alterações visuais também podem gerar alertas.</div></div><div class="change-versions">${change.before?`<button class="button secondary" data-evidence-source="${esc(change.sourceId)}" data-evidence-hash="${esc(change.before)}">Cópia anterior</button>`:''}<button class="button secondary" data-evidence-source="${esc(change.sourceId)}" data-evidence-hash="${esc(change.after)}">Cópia nova</button></div><h3>Trechos adicionados ou alterados</h3><pre class="diff-added">${esc(change.added.join('\n\n')||'Sem trecho novo identificado. A alteração pode estar nos links ou nos metadados do commit.')}</pre><h3>Trechos removidos ou substituídos</h3><pre class="diff-removed">${esc(change.removed.join('\n\n')||'Nenhum trecho removido identificado.')}</pre>${change.newLinks.length?`<h3>Novos links na fonte</h3><ul class="new-norm-links">${change.newLinks.map(l=>`<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a></li>`).join('')}</ul>`:''}${change.review?`<div class="soft-note">Analisada por ${esc(change.review.reviewer)} em ${dateTime(change.review.at)}</div><p class="review-note">${esc(change.review.note)}</p>`:`<form id="review-change-form" data-change-id="${esc(change.id)}"><h3>Registrar análise</h3><p class="field-help">Este registro não altera as regras, não aprova vigência e não instala o motor.</p><label>Responsável<input id="reviewer-name" required minlength="2" maxlength="120" autocomplete="off"></label><label>Análise e encaminhamento<textarea id="reviewer-note" required minlength="10" maxlength="4000" rows="4" placeholder="O que mudou, quais operações afeta e qual a próxima ação?"></textarea></label><p id="review-error" class="error-text" role="alert"></p><button class="button primary" type="submit">Registrar como analisada</button></form>`}`);
}
$('#monitor-close').addEventListener('click',()=>$('#monitor-dialog').close());
dateInput.addEventListener('change',renderRules);$('#rules-regime').addEventListener('change',renderRules);$('#changes-filter').addEventListener('change',renderChanges);
$('#monitor-export').addEventListener('click',()=>{if(data)download(`nexxera-monitor-${dateInput.value}.json`,data);});
$('#monitor-sync').addEventListener('click',async()=>{
  if(syncing)return;syncing=true;const button=$('#monitor-sync');button.disabled=true;button.textContent='Consultando fontes oficiais…';error('');
  try{await api('/api/governance/sync',{method:'POST'});await loadMonitor();}
  catch(e){error(e.message);await loadMonitor();error(e.message);}
  finally{syncing=false;button.disabled=false;button.innerHTML='<svg><use href="#i-clock"/></svg>Verificar atualizações';}
});
document.addEventListener('click',async event=>{
  const view=event.target.closest('[data-view-change]');if(view){const change=data?.changes.find(c=>c.id===view.dataset.viewChange);if(change)showChange(change);}
  const evidence=event.target.closest('[data-evidence-source]');if(!evidence)return;evidence.disabled=true;
  try{
    const snapshot=await api(`/api/governance/evidence/${evidence.dataset.evidenceSource}/${evidence.dataset.evidenceHash}`);
    openDialog('Cópia coletada da fonte',`<p class="status-text">Coletada em ${dateTime(snapshot.capturedAt)} · SHA-256 ${esc(snapshot.fingerprint)}</p><p><a href="${esc(snapshot.sourceUrl)}" target="_blank" rel="noopener noreferrer">Abrir fonte original</a></p>${snapshot.metadata?.pdfHash?`<p><a href="/api/governance/pdf/${esc(snapshot.metadata.pdfHash)}" target="_blank" rel="noopener noreferrer">Abrir PDF arquivado</a> · texto extraído automaticamente; confira tabelas e estrutura no original.</p>`:''}<pre>${esc(snapshot.text)}</pre><button class="button secondary" id="download-evidence">Exportar evidência em JSON</button>`);
    $('#download-evidence').addEventListener('click',()=>download(`evidencia-${snapshot.sourceId}-${snapshot.fingerprint.slice(0,10)}.json`,snapshot));
  }catch(e){error(e.message);}finally{evidence.disabled=false;}
});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='review-change-form')return;event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;
  try{await api(`/api/governance/changes/${form.dataset.changeId}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewer:$('#reviewer-name').value,note:$('#reviewer-note').value})});$('#monitor-dialog').close();await loadMonitor();}
  catch(e){$('#review-error').textContent=e.message;}finally{button.disabled=false;}
});
