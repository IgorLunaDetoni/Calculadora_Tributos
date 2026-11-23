import { Governance } from '../lib/governance.mjs';
const monitor=new Governance();
try {
  const result=await monitor.sync();
  console.log(JSON.stringify({lastRun:result.lastRun,sources:result.sources.map(s=>({id:s.id,status:s.status,error:s.error||null,version:s.metadata?.version||null})),rulebookVersion:result.rulebookVersion},null,2));
  if(result.lastRun.errors)process.exitCode=2;
} catch(error) {console.error(error.message);process.exitCode=1;}
