// Local isolated suite only. Does not call live credit/cleanup/setup/operator commands.
const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const tests=[
 ['build',require.resolve('next/dist/bin/next'),['build']],
 ['landing','scripts/check-landing.cjs'],['errors','scripts/check-errors.cjs'],
 ['generator-input','scripts/check-generator.cjs'],['nexabot-adapter','scripts/check-nexabot.cjs'],
 ['credit-engine','scripts/check-credits.cjs'],['generation-matrix','scripts/check-generation.cjs'],
 ['credit-safety','scripts/check-credit-safety.cjs'],['private-storage','scripts/check-storage.cjs'],
 ['session-history','scripts/check-history.cjs'],['cleanup-sql-routes','scripts/check-cleanup.cjs'],
 ['payments','scripts/check-payments.cjs'],['protection','scripts/check-protection.cjs'],
 ['auth-routing','scripts/check-auth.cjs'],['cleanup-runtime','scripts/check-cleanup-runtime.cjs']
];
(async()=>{
 if(JSON.parse(fs.readFileSync('package.json','utf8')).name!=='radas-ai-video')throw Error('Run from RADAS project folder');
 const directory=path.resolve('reports');fs.mkdirSync(directory,{recursive:true});
 let head=null;try{head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
 const report={kind:'isolated-local-tests',liveBankVerified:false,liveProviderGenerationVerified:false,head,startedAt:new Date().toISOString(),status:'running',checks:[]};
 const file=path.join(directory,'phase16-local.json');const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');save();
 for(const[name,script,args=[]]of tests){
  console.log(`\nPHASE16_STEP=${name}`);const started=Date.now();
  const result=await new Promise(resolve=>{const child=spawn(process.execPath,[script,...args],{cwd:process.cwd(),env:{...process.env},stdio:'inherit'});let settled=false;const finish=value=>{if(!settled){settled=true;resolve(value);}};child.once('error',()=>finish({exitCode:null,signal:null,spawnFailed:true}));child.once('close',(exitCode,signal)=>finish({exitCode,signal,spawnFailed:false}));});
  const passed=result.exitCode===0&&!result.spawnFailed;report.checks.push({name,passed,...result,durationMs:Date.now()-started});save();
  if(!passed){report.status='failed';report.finishedAt=new Date().toISOString();save();console.error(`PHASE16_LOCAL=FAIL step=${name}`);console.error('Stop and send output; report: reports/phase16-local.json');process.exitCode=1;return;}
 }
 report.status='passed';report.finishedAt=new Date().toISOString();save();
 console.log('\nPHASE16_LOCAL=PASS');console.log('REPORT=reports/phase16-local.json');
 console.log('Isolated fixtures only. Live payment, funded generation, browser playback and 12-hour live cleanup remain separate owner checks.');
})().catch(()=>{console.error('PHASE16_LOCAL=FAIL runner');process.exitCode=1;});
