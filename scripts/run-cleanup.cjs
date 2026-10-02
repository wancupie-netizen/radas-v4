// Trusted local CLI only. --check reads counts; --run deletes only SQL-approved expired V4 objects.
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
require('@next/env').loadEnvConfig(process.cwd());
(async()=>{
 if(!['--check','--run'].includes(process.argv[2])||process.argv.length!==3)throw new Error('usage');
 const file=path.resolve('src/lib/cleanup/run.ts');const loaded=new Module(file);const native=Module.createRequire(file);loaded.require=name=>name==='server-only'?{}:native(name);
 loaded._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
 const {createCleanupClient,createCleanupRunner,requireCleanupEnabled}=loaded.exports;const runner=createCleanupRunner(createCleanupClient());
 if(process.argv[2]==='--check'){const result=await runner.inspect();console.log('CLEANUP_CHECK=PASS');console.log(JSON.stringify(result));console.log('Read-only: no object deletion or credit mutation.');}
 else{requireCleanupEnabled();console.log('CLEANUP_RUN='+JSON.stringify(await runner.run()));}
})().catch(()=>{console.error('CLEANUP_FAILED: verify project URL, server key, Phase 10 SQL and enable flag for --run. No secrets logged.');process.exitCode=1;});
