# Mathijs.ai

## Config quick notes
- OpenAI key: `OPEN_AI_KEY` (primair), met fallback `OPENAI_API_KEY` of `open_ai_key`.
- Supabase service role: `SUPABASE_SERVICE_ROLE_KEY` (init tokens vereist).
- Supabase URL/anon: `SUPABASE_URL`/`SUPABASE_ANON_KEY` of `NEXT_PUBLIC_...` fallbacks.
- Default chat model: `gpt-4o`; allowed list: `gpt-4o`, `gpt-4o-mini`.
- Bij ontbrekende keys loggen we alleen present/missing, nooit secrets.

## Supabase-auth flow

- `auth.js` laadt op alle auth-pagina's, bouwt precies een Supabase client via `window.supabase.createClient`, en hangt eventlisteners aan `#login-form` en `#signup-form`. De feedback verschijnt in `#login-feedback` en `#signup-feedback`, met loading states op de knoppen.
- `login.html` toont de oorspronkelijke kaart. E-mail en wachtwoord worden gevalideerd en alleen bij een geslaagde `signInWithPassword` ga je door naar `dashboard.html`.
- `signup.html` kopieert dezelfde layout en maakt nieuwe accounts aan met `supabase.auth.signUp`, waarbij de ingevoerde gebruikersnaam als metadata (`username`) wordt meegestuurd.
- `dashboard.html` + `dashboard.js` controleren bij load of er een sessie is via de gedeelde Supabase client. Zonder sessie volgt een redirect naar `login.html`, bij een actieve sessie zie je het e-mailadres en kun je uitloggen.
- `chat.html` is de beschermde AI-werkruimte. De pagina controleert bij load de Supabase-sessie en laadt gesprekken uit `localStorage` per user-id zodat elke gebruiker alleen zijn eigen chats ziet. Zonder sessie volgt een redirect terug naar de login.

## Testen

1. Ga naar `/signup.html`, maak een account aan en volg de bevestigingsmail.
2. Log daarna in via `/login.html` en controleer dat je naar `/dashboard.html` wordt gestuurd.
3. Op `/dashboard.html` zie je je e-mailadres en kun je via "Uitloggen" terug naar `/login.html`. Een directe hit op `/dashboard.html` zonder sessie stuurt je meteen naar de loginpagina.

## OpenAI smoke test

Vereist: `OPEN_AI_KEY`.

Chat endpoint: `POST /api/chat` met body `{ model, messages }`.

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Zeg hallo"}]}'
```
