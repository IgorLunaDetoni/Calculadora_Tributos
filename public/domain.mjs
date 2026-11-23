// This module adapts official contracts. It is not an implementation of tax law.
export const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export const UF_CODES = {AC:'12',AL:'27',AP:'16',AM:'13',BA:'29',CE:'23',DF:'53',ES:'32',GO:'52',MA:'21',MT:'51',MS:'50',MG:'31',PA:'15',PB:'25',PR:'41',PE:'26',PI:'22',RJ:'33',RN:'24',RS:'43',RO:'11',RR:'14',SC:'42',SP:'35',SE:'28',TO:'17'};
export const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const formatMoney = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
export const cleanCnpj = value => String(value).toUpperCase().replace(/[.\/\-\s]/g,'');
export function validCnpj(value) {
  const raw = cleanCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(raw) || /^(\d)\1{13}$/.test(raw)) return false;
  const digit = part => {
    let weight = part.length - 7;
    const sum = [...part].reduce((total,char) => { const n = total + (char.charCodeAt(0)-48)*weight; weight = weight === 2 ? 9 : weight-1; return n; },0);
    return sum % 11 < 2 ? '0' : String(11 - sum % 11);
  };
  return raw[12] === digit(raw.slice(0,12)) && raw[13] === digit(raw.slice(0,13));
}
export function formatCnpj(value) {
  return cleanCnpj(value).replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}
function decimalUnits(value, places) {
  const s = String(value);
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(s)) throw new Error('Valor decimal inválido.');
  const [whole, fraction = ''] = s.split('.');
  return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
}
export function percentAmount(base, rate) {
  const cents = decimalUnits(base,2), percentage = decimalUnits(rate,4);
  return Number((cents*percentage+500000n)/1000000n)/100;
}
export function validateDraft(draft) {
  if (!draft.description.trim()) throw new Error('Descreva a operação.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Number.isFinite(Date.parse(draft.date)) || new Date(draft.date).toISOString().slice(0,10)!==draft.date) throw new Error('Informe uma data válida.');
  if (!STATES.includes(draft.uf) || !/^\d{7}$/.test(draft.municipality) || !draft.municipality.startsWith(UF_CODES[draft.uf])) throw new Error('O código IBGE deve ter 7 dígitos e corresponder à UF de destino.');
  if (!draft.items.length) throw new Error('Adicione ao menos um item.');
  for (const item of draft.items) {
    if (!/^\d+(\.\d{1,2})?$/.test(String(item.base)) || +item.base <= 0 || +item.base > 999999999999) throw new Error('Informe uma base positiva, com até duas casas decimais.');
    const pattern = draft.nature === 'bem' ? /^\d{8}$/ : /^\d{9}$/;
    if (!pattern.test(item.code)) throw new Error(draft.nature === 'bem' ? 'O NCM deve ter 8 dígitos.' : 'O NBS deve ter 9 dígitos.');
    if ((draft.regime!=='simples'&&!/^\d{3}$/.test(item.cst)) || !/^\d{6}$/.test(item.classification)) throw new Error('Informe CST com 3 dígitos e cClassTrib com 6 dígitos.');
    if (draft.regime === 'simples' && !/^\d{2}$/.test(item.activity)) throw new Error('A atividade do Simples deve ter 2 dígitos.');
    if (item.selective) {
      if(draft.regime==='simples') {
        if(!/^\d+(\.\d{1,2})?$/.test(String(item.isValue)) || +item.isValue>999999999999) throw new Error('Informe o valor já apurado do IS com até duas casas decimais.');
      } else {
        if(!/^\d{3}$/.test(item.isCst) || !/^\d{6}$/.test(item.isClass)) throw new Error('Revise CST e classificação do Imposto Seletivo.');
        if(!/^\d+(\.\d{1,4})?$/.test(String(item.isRate)) || +item.isRate>100) throw new Error('Informe uma alíquota do IS entre 0 e 100.');
      }
    }
  }
  if (draft.items.length>50 || draft.items.reduce((sum,item)=>sum+Number(item.base),0)>999999999999) throw new Error('A operação deve ter até 50 itens e base total de até R$ 999.999.999.999,00.');
  const activeRates=draft.regime==='simples'?[draft.rates.simpleCbs,draft.rates.simpleIbs]:draft.mode==='official'&&+draft.date.slice(0,4)<2027?[]:[draft.rates.cbs,draft.rates.uf,draft.rates.mun];
  for (const rate of activeRates) {
    if (!Number.isFinite(+rate) || +rate < 0 || +rate > 100 || !/^\d+(\.\d{1,4})?$/.test(String(rate))) throw new Error('As alíquotas devem estar entre 0 e 100, com até quatro casas decimais.');
  }
  if (!Number.isFinite(+draft.payment) || +draft.payment <= 0 || +draft.payment > 999999999999) throw new Error('Informe o total pago pelo cliente.');
  if (draft.regime === 'simples' && draft.document === 'nfse' && draft.mode === 'official') throw new Error('O formulário do Simples suporta NF-e e NFC-e. Verifique a disponibilidade de outros documentos na sua versão RTC.');
}
export function demonstration(draft) {
  const simple = draft.regime === 'simples';
  let cbs = 0, ibs = 0, is = 0, base = 0;
  for (const item of draft.items) {
    const selective = item.selective ? (simple ? +item.isValue : percentAmount(item.base,item.isRate)) : 0;
    const taxBase = round(+item.base + (!simple ? selective : 0));
    base = round(base + +item.base);
    cbs = round(cbs + percentAmount(taxBase,simple ? draft.rates.simpleCbs : draft.rates.cbs));
    ibs = round(ibs + (simple ? percentAmount(taxBase,draft.rates.simpleIbs) : round(percentAmount(taxBase,draft.rates.uf)+percentAmount(taxBase,draft.rates.mun))));
    is = round(is + selective);
  }
  return {cbs,ibs,is,base,total:round(cbs+ibs+is),source:'demo',simulated:true,warning:'Estimativa linear ilustrativa. Não aplica reduções, créditos, diferimentos ou outras regras fiscais.'};
}
export function buildPayload(draft, id) {
  validateDraft(draft);
  if (draft.regime === 'simples') return {
    id, versao:'2.0.0', data:draft.date, tpDoc:draft.document, CRT:'1',
    itens:draft.items.map((item,i)=>({numero:i+1,cAtivSN:item.activity,cClassTrib:item.classification,
      [draft.nature==='bem'?'ncm':'nbs']:item.code,baseCalculo:Number(item.base).toFixed(2),
      valorImpostoSeletivo:item.selective?Number(item.isValue).toFixed(2):'0.00',pIBSSN:String(draft.rates.simpleIbs),pCBSSN:String(draft.rates.simpleCbs)}))
  };
  const year = +draft.date.slice(0,4);
  return {id,versao:'1.0.0',dhFatoGerador:`${draft.date}T12:00:00-03:00`,municipio:+draft.municipality,uf:draft.uf,
    itens:draft.items.map((item,i)=>{
      const result = {numero:i+1,[draft.nature==='bem'?'ncm':'nbs']:item.code,cst:item.cst,cClassTrib:item.classification,baseCalculo:+item.base,quantidade:1,unidade:'UN'};
      if (year >= 2027) result.aliquotasNominais = {cbs:+draft.rates.cbs,ibsEstadual:+draft.rates.uf,ibsMunicipal:+draft.rates.mun};
      if(item.selective) {
        if(year < 2027) throw new Error('A entrada simplificada de IS está disponível a partir de 2027.');
        delete result.baseCalculo;
        result.impostoSeletivo = {cst:item.isCst,cClassTrib:item.isClass,baseCalculo:+item.base,quantidade:1,unidade:'UN',impostoInformado:percentAmount(item.base,item.isRate)};
        result.aliquotasNominais.impostoSeletivo = {adValorem:+item.isRate};
      }
      return result;
    })};
}
export function normalizeOfficial(body, regime, inputBase, expectedItems) {
  if (!body || !Array.isArray(body.objetos) || !body.objetos.length || (expectedItems && body.objetos.length !== expectedItems)) throw new Error('A API retornou um contrato inesperado ou itens incompletos. Consulte a memória recebida.');
  const failures = body.objetos.filter(item => !['CALCULADO','CALCULO_SIMULADO'].includes(item.estadoItem));
  if (failures.length) throw new Error(failures.map(item => `Item ${item.nObj}: ${item.estadoItem}. ${(item.erros||[]).map(e=>e.detail||e.title||e.code).join(' ')}`).join('\n'));
  const total = regime === 'simples' ? body.total : body.total?.tribCalc;
  if (!total) throw new Error('A API não retornou os totais esperados.');
  const values = regime === 'simples' ? [total.vCBSSNtot,total.vIBSSNtot,total.totalIs??0] : [total.IBSCBSTot?.gCBS?.vCBS,total.IBSCBSTot?.gIBS?.vIBS,total.ISTot?.vIS??0];
  if (values.some(value=>value==null || !/^\d+(\.\d+)?$/.test(String(value)) || !Number.isFinite(+value))) throw new Error('Totais ausentes ou inválidos na resposta RTC. Nenhum resultado foi salvo.');
  const [cbs,ibs,is] = values.map(value=>round(+value));
  const simulated = body.objetos.some(item=>item.estadoItem==='CALCULO_SIMULADO');
  return {cbs,ibs,is,base:inputBase,total:round(cbs+ibs+is),source:'rtc',simulated,warning:simulated?'A instância RTC identificou este cálculo como simulado. Consulte a memória e as alíquotas informadas.':'Resultado da instância RTC conectada. Confira a vigência da base e a memória de cálculo.'};
}
export function splitProjection(result, payment, enabled = true) {
  const segregated = enabled ? round(result.cbs + result.ibs) : 0;
  if (segregated > +payment) throw new Error('O total pago é menor que CBS + IBS. Revise os valores para projetar o split payment.');
  return {payment:+payment,segregated,net:round(+payment-segregated),enabled,projectionOnly:true};
}
