import {writeFile} from 'node:fs/promises';
import {UF_CODES} from '../public/domain.mjs';

const source='https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
const response=await fetch(source,{headers:{'User-Agent':'Nexxera-Tributos/0.2'},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`O IBGE retornou HTTP ${response.status}. A lista anterior foi preservada.`);
const rows=await response.json();
const states=new Map(Object.entries(UF_CODES).map(([uf,code])=>[code,uf]));
const municipalities=rows.map(row=>({id:String(row.id),name:row.nome,uf:states.get(String(row.id).slice(0,2))}));
if(municipalities.length<5500||new Set(municipalities.map(m=>m.id)).size!==municipalities.length||municipalities.some(m=>!/^\d{7}$/.test(m.id)||!m.name||!m.uf))throw new Error('Lista inesperada do IBGE. Nenhum dado foi substituído.');
municipalities.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
const metadata={source,retrievedAt:new Date().toISOString(),count:municipalities.length};
await writeFile(new URL('../public/municipalities-data.mjs',import.meta.url),`// Lista pública oficial do IBGE. Atualize com scripts/update-municipalities.mjs.\nexport const metadata=${JSON.stringify(metadata)};\nexport const municipalities=${JSON.stringify(municipalities)};\n`,'utf8');
console.log(`${municipalities.length} municípios oficiais salvos para consulta local.`);
