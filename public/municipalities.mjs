import {municipalities} from './municipalities-data.mjs';

export const normalizeMunicipalityName=name=>String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const byState=new Map();
const byCode=new Map();
for(const municipality of municipalities) {
  if(!byState.has(municipality.uf))byState.set(municipality.uf,[]);
  byState.get(municipality.uf).push(municipality);
  byCode.set(municipality.id,municipality);
}
export const municipalitiesForState=uf=>byState.get(uf)||[];
export function municipalityByName(uf,name) {
  const key=normalizeMunicipalityName(name);
  const matches=municipalitiesForState(uf).filter(city=>normalizeMunicipalityName(city.name)===key);
  return matches.length===1?matches[0]:null;
}
export function municipalityByCode(uf,code) {
  const city=byCode.get(String(code));return city?.uf===uf?city:null;
}

export function attachMunicipalityPicker({stateInput,nameInput,codeInput,options,help}) {
  let optionsState;
  function rebuildOptions() {
    if(optionsState===stateInput.value)return;
    optionsState=stateInput.value;
    const document=nameInput.ownerDocument;
    const fragment=document.createDocumentFragment();
    for(const city of municipalitiesForState(optionsState)) {
      const option=document.createElement('option');option.value=city.name;fragment.append(option);
    }
    options.replaceChildren(fragment);
  }
  function resolve(canonicalize=false) {
    const city=municipalityByName(stateInput.value,nameInput.value);
    codeInput.value=city?.id||'';
    nameInput.setCustomValidity(nameInput.value&&!city?'Selecione um município da lista para a UF informada.':'');
    if(city&&canonicalize)nameInput.value=city.name;
    help.textContent=city?`Código IBGE: ${city.id} · preenchido automaticamente`:'Digite o nome e selecione um município da UF informada.';
    return city;
  }
  function set({uf=stateInput.value,id='',name=''}={}) {
    stateInput.value=uf;rebuildOptions();
    // Existing registrations are restored by their saved code, preserving compatibility.
    const city=municipalityByCode(uf,id)||municipalityByName(uf,name);
    nameInput.value=city?.name||name;
    return resolve(true);
  }
  nameInput.addEventListener('input',()=>resolve());
  nameInput.addEventListener('change',()=>resolve(true));
  nameInput.addEventListener('blur',()=>resolve(true));
  stateInput.addEventListener('change',()=>set({uf:stateInput.value}));
  rebuildOptions();
  resolve(true);
  return {set,resolve};
}
