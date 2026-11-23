import test from 'node:test';
import assert from 'node:assert/strict';
import {demonstration,buildPayload,normalizeOfficial,splitProjection,percentAmount,validCnpj,validateDraft} from '../public/domain.mjs';

const draft = (overrides={}) => ({description:'Venda de teste',date:'2026-11-23',nature:'bem',uf:'SP',municipality:'3550308',document:'55',regime:'regular',mode:'official',payment:'10100',split:true,rates:{cbs:'0.9',uf:'0.05',mun:'0.05',simpleCbs:'2.75',simpleIbs:'1.25'},items:[{base:'10000',code:'84713012',cst:'000',classification:'000001',activity:'01',selective:false,isValue:'0',isRate:'0',isCst:'000',isClass:'000001'}],...overrides});
test('CNPJ validates check digits, formatting and rejects repeated or modified numbers',()=>{
  assert.equal(validCnpj('11.222.333/0001-81'),true);
  assert.equal(validCnpj('11.222.333/0001-82'),false);
  assert.equal(validCnpj('00.000.000/0000-00'),false);
  assert.equal(validCnpj('12.ABC.345/01DE-35'),true);
});
test('Money arithmetic rounds half cents exactly, including 1.005',()=>{
  assert.equal(percentAmount('1.00','0.5'),0.01);
  assert.equal(percentAmount('100.50','1'),1.01);
  assert.equal(percentAmount('10000','0.9'),90);
});
test('Demo totals and split reconcile without retaining IS',()=>{
  const d=draft({regime:'simples'});d.items[0].selective=true;d.items[0].isValue='50';
  const result=demonstration(d),split=splitProjection(result,'10500');
  assert.equal(result.cbs,275);assert.equal(result.ibs,125);assert.equal(result.is,50);assert.equal(result.total,450);
  assert.equal(split.segregated,400);assert.equal(split.net,10100);
  assert.equal(splitProjection(result,'10500',false).net,10500);
  assert.throws(()=>splitProjection(result,'100'),/menor/);
});
test('Regular contract omits nominal rates before 2027 and includes them afterward',()=>{
  const early=buildPayload(draft(),'id');assert.equal(early.dhFatoGerador,'2026-11-23T12:00:00-03:00');assert.equal(early.itens[0].aliquotasNominais,undefined);
  const late=buildPayload(draft({date:'2027-02-10'}),'id');assert.equal(late.itens[0].aliquotasNominais.cbs,0.9);
});
test('Regular IS uses separate IS input and derived CBS/IBS base',()=>{
  const d=draft({date:'2027-02-10'});d.items[0].selective=true;d.items[0].isRate='10';
  const item=buildPayload(d,'id').itens[0];assert.equal(item.baseCalculo,undefined);assert.equal(item.impostoSeletivo.impostoInformado,1000);assert.equal(item.aliquotasNominais.impostoSeletivo.adValorem,10);
});
test('Simples has a dedicated schema with string decimal inputs',()=>{
  const payload=buildPayload(draft({regime:'simples'}),'id');assert.equal(payload.CRT,'1');assert.equal(payload.data,'2026-11-23');assert.equal(payload.itens[0].pCBSSN,'2.75');assert.equal(payload.itens[0].baseCalculo,'10000.00');assert.equal(payload.dhFatoGerador,undefined);
});
test('An HTTP 200 response with failed or uncalculated items cannot produce a valid result',()=>{
  for(const estadoItem of ['INCONSISTENCIA_ENTRADA','FALHA_TECNICA','NAO_IMPLEMENTADO','NAO_CALCULADO']) assert.throws(()=>normalizeOfficial({objetos:[{nObj:1,estadoItem}],total:{}},'regular',10000,1),new RegExp(estadoItem));
  assert.throws(()=>normalizeOfficial({objetos:[{nObj:1,estadoItem:'CALCULADO'}],total:{}},'regular',10000,2),/incompletos/);
  assert.throws(()=>normalizeOfficial({objetos:[{nObj:1,estadoItem:'CALCULADO'}],total:{tribCalc:{}}},'regular',10000,1),/ausentes/);
});
test('Official response parsers preserve simulated state and use the correct totals per regime',()=>{
  const regular=normalizeOfficial({objetos:[{estadoItem:'CALCULO_SIMULADO'}],total:{tribCalc:{IBSCBSTot:{gCBS:{vCBS:'90.00'},gIBS:{vIBS:'10.00'}},ISTot:{vIS:'5.00'}}}},'regular',10000,1);
  assert.equal(regular.total,105);assert.equal(regular.simulated,true);
  const simple=normalizeOfficial({objetos:[{estadoItem:'CALCULADO'}],total:{vCBSSNtot:'275.00',vIBSSNtot:'125.00',totalIs:'0.00'}},'simples',10000,1);
  assert.equal(simple.total,400);assert.equal(simple.source,'rtc');
});
test('Destination UF and IBGE must agree; invalid and negative inputs are rejected',()=>{
  assert.throws(()=>validateDraft(draft({municipality:'4314902'})),/UF/);
  const d=draft();d.items[0].base='-1';assert.throws(()=>validateDraft(d),/positiva/);
  assert.throws(()=>validateDraft(draft({mode:'demo',rates:{cbs:'101',uf:'0',mun:'0',simpleCbs:'0',simpleIbs:'0'}})),/alíquotas/);
});
test('Automatic 2026 rates ignore dormant input fields; invalid calendar dates are rejected',()=>{
  const automatic=draft({rates:{cbs:'',uf:'',mun:'',simpleCbs:'',simpleIbs:''}});
  assert.doesNotThrow(()=>buildPayload(automatic,'id'));
  assert.throws(()=>validateDraft(draft({date:'2026-02-31'})),/data válida/);
});
