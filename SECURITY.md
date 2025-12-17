# Security (secrets & misbruik)

## Belangrijkste regels

- **Nooit** geheime keys in HTML of client-side JavaScript zetten (alles wat in de browser draait is publiek).
- Alle geheime keys staan alleen in **Vercel Environment Variables** (server-side) en worden via `/api/*` gebruikt.
- Behandel **Supabase `service_role`** en **Stripe secret keys** als *root access*: nooit delen, nooit committen.

## Bescherming die in code zit

- `/api/chat` vereist nu een **Supabase access token** (`Authorization: Bearer ...`) en heeft **rate limiting** + input-limits.
- API errors worden **gesaneerd**: mogelijke secrets worden nooit teruggestuurd naar de browser.
- Signup endpoint heeft **rate limiting** + een eenvoudige **honeypot** tegen bots.
- Staff endpoints (`/api/staff/*`) vereisen **Supabase access token** + een **server-side allowlist**.

## Aanbevolen in je platform instellingen

### OpenAI / Gemini
- Gebruik **aparte keys** voor dev en prod.
- Stel **budget limits / alerts** in (en monitor usage).
- Gebruik waar mogelijk **restricted keys** (minimale scopes/models).
- **Rotate** direct als je denkt dat iets gelekt is.

### Supabase
- Zorg dat alle tabellen **RLS aan** hebben en policies kloppen.
- `SUPABASE_ANON_KEY` / `sb_publishable_*` mag in de frontend staan; veiligheid komt uit RLS.
- `SUPABASE_SERVICE_ROLE_KEY` mag **nooit** naar de client.

### Vercel
- Zet alle secrets in **Project Settings → Environment Variables**.
- Maak secrets **niet** zichtbaar in logs; gebruik generieke errors naar de client.

### Staff allowlist (Vercel env vars)
- `STAFF_EMAIL_ALLOWLIST`: comma-separated emails (lower/upper maakt niet uit), bv. `servec321@gmail.com,staff2@...`
- `STAFF_USER_ID_ALLOWLIST`: comma-separated Supabase user IDs (optioneel, extra veilig)

### Content Security Policy (CSP)
- Er staat een strikte CSP in `vercel.json` met **SHA-256 hashes** voor inline scripts (blokkeert geïnjecteerde scripts).
- Als je inline `<script>` in een HTML pagina wijzigt, moet je de hashes updaten in `vercel.json`.
- Hashes genereren: `node -e 'const fs=require(\"fs\");const crypto=require(\"crypto\");const files=fs.readdirSync(\".\").filter(f=>f.endsWith(\".html\"));const re=/<script\\b(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)<\\/script>/gi;for(const f of files){const html=fs.readFileSync(f,\"utf8\");let m,i=0;while((m=re.exec(html))){i++;const h=crypto.createHash(\"sha256\").update(m[1],\"utf8\").digest(\"base64\");console.log(f+\"#\"+i, \"'sha256-\"+h+\"'\");}}'`

## Als je vermoedt dat er iets gelekt is

1. Revoke/rotate de key(s) direct (OpenAI / Stripe / Supabase).
2. Check logs en usage dashboards op misbruik.
3. Deploy met nieuwe env vars.
