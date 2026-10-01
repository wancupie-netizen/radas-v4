# RADAS — Phase 02 setup

This is a complete updated project, including Phase 01. Use a new extracted folder first; keep your existing .env.local private.

## 1. Supabase project
Use a dedicated RADAS Supabase project. The connected account currently lists Biscotto and AlphaRadar only; neither was modified.

In Supabase Dashboard:
1. Create/select the RADAS project.
2. Open the project's Connect dialog and copy Project URL and Publishable Key.
3. Under Authentication → Providers, enable Email/password and keep Confirm email enabled for launch.
4. Under Authentication → URL Configuration, set Site URL to `http://localhost:3000` for local testing. Add `http://localhost:3000/auth/callback` to Redirect URLs.

## 2. Local environment
Node.js 22 or newer is recommended/required by this package.

In PowerShell, from the folder containing package.json:
```powershell
npm ci
Copy-Item .env.example .env.local
```
If .env.local already exists, edit it instead of overwriting it.

Set:
```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
APP_URL=http://localhost:3000
```
Authentication does not require a secret/service-role key. Never use such a key in NEXT_PUBLIC variables.

```powershell
npm run dev
```
Open `http://localhost:3000`; anonymous users go to Login.

## 3. Try the flow
1. Click Daftar. Enter name, email and password (minimum 8 characters).
2. Open the confirmation email in the SAME browser used to register. The default confirmation flow uses PKCE and needs that browser's verifier cookie. If another browser confirms your email, return to the original browser and login with your password.
3. Login. Create Video appears with 0 credits; wallet/payment/generation are still later phases.
4. Refresh; your authenticated session persists, while page-local prompt/image state clears.
5. Use Profile to view the signed-in email.
6. Logout; Login appears. Opening `/` again must return to Login.

If confirmation is disabled in Supabase, successful registration signs the user in directly. The code handles both settings.

If Email delivery is unavailable, check Supabase Auth email/SMTP configuration and allowed recipients. Avoid repeatedly registering the same email to work around rate limits.

## 4. Vercel later
Set the same URL and publishable key in Vercel environments. Set `APP_URL` to the actual HTTPS origin of that deployment, e.g. `https://radas.my` only when that domain is serving this project. Add its exact `/auth/callback` URL to Supabase Redirect URLs and update Site URL for production. APP_URL is required for registration in production. It is server-side and must not be taken from an untrusted request header.

## Checks
```powershell
npm run build
npm run typecheck
npm run check:auth
```
`check:auth` uses ports 3093/3094 and a simulated local Auth service. It creates no real accounts. Run after build; its success is not proof of live Supabase/email delivery.

## Scope
No database tables, wallet ledger, top-ups, NexaBot requests or deployment changes are included in Phase 02.
