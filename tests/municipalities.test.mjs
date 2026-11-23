import test from 'node:test';
import assert from 'node:assert/strict';
import {municipalities,metadata} from '../public/municipalities-data.mjs';
import {municipalityByName,municipalityByCode,municipalitiesForState,attachMunicipalityPicker} from '../public/municipalities.mjs';
import {UF_CODES} from '../public/domain.mjs';

test('Resolves official names with accents, casing and spaces without accepting a partial city name',()=>{
  assert.equal(municipalityByName('SP','  sao   PAULO  ').id,'3550308');
  assert.equal(municipalityByName('MA','sao luis').id,'2111300');
  assert.equal(municipalityByName('SP','São Pau'),null);
  assert.equal(municipalityByName('RJ','São Paulo'),null);
});
test('Names shared by different states resolve to distinct IBGE codes and saved codes stay scoped to their state',()=>{
  const sp=municipalityByName('SP','Bom Jesus'),rs=municipalityByName('RS','Bom Jesus');
  assert.equal(sp,null);
  const pi=municipalityByName('PI','Bom Jesus');
  assert.ok(pi);assert.ok(rs);assert.notEqual(pi.id,rs.id);
  assert.equal(municipalityByCode('SP','3550308').name,'São Paulo');
  assert.equal(municipalityByCode('RJ','3550308'),null);
});
test('Bundled IBGE data covers every state with unique, state-consistent seven-digit codes',()=>{
  assert.equal(metadata.count,municipalities.length);assert.ok(municipalities.length>=5500);
  assert.equal(new Set(municipalities.map(city=>city.id)).size,municipalities.length);
  for(const [uf,prefix] of Object.entries(UF_CODES)) {
    assert.ok(municipalitiesForState(uf).length);
    assert.ok(municipalitiesForState(uf).every(city=>/^\d{7}$/.test(city.id)&&city.id.startsWith(prefix)));
  }
  assert.ok(municipalityByName('MT','Boa Esperança do Norte'));
});
test('Picker fills and clears the code when a name is edited or the UF changes, and restores existing registrations',()=>{
  const element=(value='')=>({value,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},setCustomValidity(message){this.validationMessage=message;}});
  const stateInput=element('SP'),nameInput=element('São Paulo'),codeInput=element('3550308');
  nameInput.ownerDocument={createDocumentFragment:()=>({append(){}}),createElement:()=>({})};
  const options={replaceChildren(){}},help={};
  const picker=attachMunicipalityPicker({stateInput,nameInput,codeInput,options,help});
  nameInput.value='Campinas';nameInput.handlers.input();assert.equal(codeInput.value,'3509502');
  nameInput.value='Campin';nameInput.handlers.input();assert.equal(codeInput.value,'');assert.ok(nameInput.validationMessage);
  stateInput.value='RJ';stateInput.handlers.change();assert.equal(nameInput.value,'');assert.equal(codeInput.value,'');
  picker.set({uf:'SP',id:'3550308',name:'Nome antigo no cadastro'});assert.equal(nameInput.value,'São Paulo');assert.equal(codeInput.value,'3550308');
});
