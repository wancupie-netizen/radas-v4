// Read-only operator check. Never submits a generation or prints credentials.
require('@next/env').loadEnvConfig(process.cwd());
(async () => {
  const key = process.env.NEXABOT_API_KEY;
  if (!key || !/^nxb_[A-Za-z0-9_-]+$/.test(key)) throw new Error('MISSING_OR_INVALID_KEY');
  const response = await fetch('https://nexabot.id/api/v1/api/credit', {
    headers: { 'x-api-key': key }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const data = await response.json();
  if (data.ok !== true || data.registered !== true || !Number.isFinite(data.credit) || data.credit < 0 || data.credit_cost !== 0.15) throw new Error('INVALID_CREDIT_RESPONSE');
  console.log('NEXABOT_CONNECTION=PASS');
  console.log(`PROVIDER_CREDIT=${data.credit}`);
  console.log(`CREDIT_READY=${data.credit >= data.credit_cost}`);
})().catch(error => {
  const safe = /^(MISSING_OR_INVALID_KEY|HTTP_\d{3}|INVALID_CREDIT_RESPONSE)$/.test(error.message) ? error.message : 'CONNECTION_FAILED';
  console.error(`NEXABOT_CONNECTION=FAIL (${safe})`); process.exitCode = 1;
});
