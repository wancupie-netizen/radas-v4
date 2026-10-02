// Creates only the new V4 bucket through the Storage API. No object uploads, payments or free credits.
const {loadEnvConfig}=require('@next/env');const {createClient}=require('@supabase/supabase-js');
loadEnvConfig(process.cwd());
(async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SECRET_KEY;
 if(url!=='https://fyqvvkpzcwrmyozxlqkw.supabase.co'||!key)throw new Error('CONFIG_OR_PROJECT_INVALID');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}});
 const bucket='radas-v4-videos';const config={public:false,fileSizeLimit:52428800,allowedMimeTypes:['video/mp4']};
 // Preflight confirms Phase 08 installed and server-only RPC available, with no generation mutation.
 const {error:rpcError}=await client.rpc('radas_v4_video_object_operation',{p_action:'read',p_user_id:'00000000-0000-4000-8000-000000000000',p_id:'00000000-0000-4000-8000-000000000000',p_size:null});
 if(rpcError)throw new Error('PHASE08_SQL_REQUIRED');
 let result=await client.storage.getBucket(bucket);
 if(result.error){
  if(String(result.error.statusCode)!=='404')throw new Error('BUCKET_READ_FAILED');
  const created=await client.storage.createBucket(bucket,config);if(created.error)throw new Error('BUCKET_CREATE_FAILED');
  result=await client.storage.getBucket(bucket);
 }
 const data=result.data;
 if(result.error||!data||data.public!==false||Number(data.file_size_limit)!==config.fileSizeLimit||!Array.isArray(data.allowed_mime_types)||data.allowed_mime_types.length!==1||data.allowed_mime_types[0]!=='video/mp4')throw new Error('BUCKET_CONFIG_MISMATCH_NO_CHANGES');
 console.log('STORAGE_BUCKET=PASS');console.log('PRIVATE=true');console.log('MAX_VIDEO_BYTES=52428800');console.log('No video upload, credit mutation or existing bucket modification performed.');
})().catch(error=>{console.error(['CONFIG_OR_PROJECT_INVALID','PHASE08_SQL_REQUIRED','BUCKET_READ_FAILED','BUCKET_CREATE_FAILED','BUCKET_CONFIG_MISMATCH_NO_CHANGES'].includes(error.message)?error.message:'STORAGE_SETUP_FAILED');process.exitCode=1;});
