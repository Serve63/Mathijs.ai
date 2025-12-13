# Vercel Deployment Fix - Instructies

## Wat is er gedaan:
1. ✅ `vercel.json` configuratie bestand aangemaakt
2. ✅ Git deployment enabled voor main branch
3. ✅ Cache headers ingesteld voor automatische updates

## Wat je moet controleren in Vercel Dashboard:

### 1. GitHub Integration
- Ga naar: https://vercel.com/dashboard
- Selecteer je project
- Ga naar **Settings** → **Git**
- Controleer of de GitHub repository correct is gekoppeld
- Zorg dat **Production Branch** is ingesteld op `main`
- Controleer of **Auto-deploy** is ingeschakeld

### 2. Deployment Settings
- Ga naar **Settings** → **General**
- Controleer of **Build Command** leeg is (of verwijderd)
- Controleer of **Output Directory** is ingesteld op `.` (root)
- Controleer of **Framework Preset** is ingesteld op **Other** of **None**

### 3. Handmatig Triggeren
Als automatische deployments niet werken:
- Ga naar **Deployments** tab
- Klik op **Redeploy** voor de laatste deployment
- Of gebruik: `vercel --prod` in de terminal

### 4. Webhook Check
- Ga naar **Settings** → **Git** → **Deploy Hooks**
- Controleer of de webhook actief is
- Test de webhook indien mogelijk

## Als het nog steeds niet werkt:

1. **Herverbind GitHub:**
   - Disconnect de GitHub repo in Vercel
   - Reconnect de GitHub repo
   - Selecteer de `main` branch

2. **Handmatig Deploy:**
   ```bash
   vercel --prod
   ```

3. **Check Vercel Logs:**
   - Ga naar **Deployments** → Selecteer een deployment → **View Build Logs**
   - Controleer op errors

4. **Force Redeploy:**
   - Maak een lege commit: `git commit --allow-empty -m "trigger vercel"`
   - Push: `git push`

