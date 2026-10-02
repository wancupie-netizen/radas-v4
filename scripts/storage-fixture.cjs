// Test-only Storage model. Real Storage HTTP verification is a separate operator acceptance step.
const assert=require('node:assert/strict');
const mp4=Buffer.from('000000186674797069736f6d0000020069736f6d6d703432','hex');
async function installStorage(db){
 await db.exec(`create schema storage;
 create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
 create policy fixture_old_app_permissive on storage.objects for all to anon,authenticated using(true) with check(true);
 insert into storage.buckets values('radas-v4-videos',false,52428800,array['video/mp4']);`);
 const fs=require('node:fs');const file=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_temporary_video_storage.sql'));
 await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
}
function mockStorage(){
 const objects=new Map();let uploadError=false,downloadError=false,loseUpload=false,uploads=0;
 return {objects,get uploads(){return uploads},set uploadError(v){uploadError=v},set downloadError(v){downloadError=v},set loseUpload(v){loseUpload=v},from(bucket){
  assert.equal(bucket,'radas-v4-videos');return {
   async download(path){if(downloadError)return {data:null,error:{statusCode:'503'}};const bytes=objects.get(path);return bytes?{data:new Blob([bytes],{type:'video/mp4'}),error:null}:{data:null,error:{statusCode:'404'}};},
   async upload(path,bytes,options){uploads++;assert.equal(options.upsert,false);assert.equal(options.contentType,'video/mp4');assert.equal(options.cacheControl,'0');
    if(uploadError)return {error:{statusCode:'503'}};if(objects.has(path))return {error:{statusCode:'409'}};objects.set(path,Buffer.from(bytes));
    if(loseUpload){loseUpload=false;return {error:{statusCode:'503'}};}return {error:null};}
  };
 }};
}
module.exports={installStorage,mockStorage,mp4};
