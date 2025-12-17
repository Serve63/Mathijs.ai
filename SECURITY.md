# Security (secrets & misbruik)

## Belangrijkste regels

- **Nooit** geheime keys in HTML of client-side JavaScript zetten (alles wat in de browser draait is publiek).
- Alle geheime keys staan alleen in **Vercel Environment Variables** (server-side) en worden via `/api/*` gebruikt.
- Behandel **Supabase `service_role`** en **Stripe secret keys** als *root access*: nooit delen, nooit committen.

## Bescherming die in code zit

- `/api/chat` vereist nu een **Supabase access token** (`Authorization: Bearer ...`) en heeft **rate limiting** + input-limits.
- API errors worden **gesaneerd**: mogelijke secrets worden nooit teruggestuurd naar de browser.
- Signup endpoint heeft **rate limiting** + een eenvoudige **honeypot** tegen bots.

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

## Als je vermoedt dat er iets gelekt is

1. Revoke/rotate de key(s) direct (OpenAI / Stripe / Supabase).
2. Check logs en usage dashboards op misbruik.
3. Deploy met nieuwe env vars.

