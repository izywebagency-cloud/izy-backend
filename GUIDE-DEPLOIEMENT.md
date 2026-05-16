# Guide de déploiement — Backend Anti-Spam izy-agency.com

---

## Architecture du système

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│                 │     │                      │     │             │
│  Visiteur       │────▶│  Frontend Base44      │     │  Google      │
│  (navigateur)   │     │  izy-agency.com       │     │  reCAPTCHA   │
│                 │     │                      │     │             │
└─────────────────┘     └──────────┬───────────┘     └──────┬──────┘
                                   │                        │
                                   │ POST /api/contact      │ vérification
                                   │ POST /api/whatsapp     │ du token
                                   ▼                        │
                        ┌──────────────────────┐            │
                        │                      │◀───────────┘
                        │  Backend Node.js      │
                        │  (Railway / Render)   │
                        │                      │───▶ Envoi email SMTP
                        │  • reCAPTCHA check   │
                        │  • Rate limit par IP │───▶ URL WhatsApp
                        │  • Honeypot          │     (numéro masqué)
                        │  • Logs IP           │
                        │                      │
                        └──────────────────────┘
```

Le numéro WhatsApp n'est JAMAIS présent dans le code frontend.
Il est stocké uniquement dans les variables d'environnement du backend.

---

## Étape 1 — Créer les clés reCAPTCHA v3

1. Va sur https://www.google.com/recaptcha/admin
2. Clique sur "+" pour ajouter un nouveau site
3. Paramètres :
   - **Label** : izy-agency.com
   - **Type** : reCAPTCHA v3
   - **Domaines** : ajoute `izy-agency.com` ET `localhost` (pour le dev)
4. Valide et note les 2 clés :
   - **Clé du site** (publique) → pour le frontend
   - **Clé secrète** → pour le backend (.env)

---

## Étape 2 — Déployer le backend

### Option A : Railway (recommandé, gratuit pour démarrer)

1. Crée un compte sur https://railway.app
2. Connecte ton GitHub
3. Crée un nouveau projet → "Deploy from GitHub repo"
4. Push ce dossier `izy-backend` sur un repo GitHub
5. Railway détecte automatiquement Node.js
6. Va dans l'onglet **Variables** et ajoute toutes les variables du `.env.example` :
   ```
   PORT=3001
   ALLOWED_ORIGINS=https://izy-agency.com
   RECAPTCHA_SECRET_KEY=6Le...ta_cle_secrete
   RECAPTCHA_THRESHOLD=0.5
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=ton.email@gmail.com
   SMTP_PASS=ton_mot_de_passe_app
   CONTACT_EMAIL=contact@izy-agency.com
   WHATSAPP_NUMBER=33612345678
   ADMIN_API_KEY=une-cle-aleatoire-tres-longue
   ```
7. Railway te donne une URL comme : `https://izy-backend-xxxxx.up.railway.app`
8. Note cette URL → c'est ton `API_BASE_URL` pour le frontend

### Option B : Render (alternative gratuite)

1. Crée un compte sur https://render.com
2. New → Web Service → connecte ton repo GitHub
3. Runtime : Node
4. Build Command : `npm install`
5. Start Command : `npm start`
6. Ajoute les variables d'environnement (mêmes que ci-dessus)
7. Render te donne une URL comme : `https://izy-backend.onrender.com`

---

## Étape 3 — Configurer Gmail pour l'envoi SMTP

Si tu utilises Gmail :

1. Active la vérification en 2 étapes sur ton compte Google
2. Va sur https://myaccount.google.com/apppasswords
3. Crée un mot de passe d'application :
   - Nom : "izy backend"
   - Copie le mot de passe généré (16 caractères)
4. Utilise ce mot de passe dans `SMTP_PASS` (pas ton vrai mot de passe Gmail)

### Alternative : Brevo (ex-Sendinblue) — gratuit 300 emails/jour

1. Crée un compte sur https://www.brevo.com
2. Va dans Paramètres → SMTP & API
3. Utilise :
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=ton.email@brevo.com
   SMTP_PASS=ta_cle_smtp_brevo
   ```

---

## Étape 4 — Intégrer le frontend dans Base44

### 4.1 Ajouter le script reCAPTCHA

Dans Base44, va dans les paramètres du site → Custom Code → section `<head>` et ajoute :

```html
<script src="https://www.google.com/recaptcha/api.js?render=TA_CLE_SITE_RECAPTCHA"></script>
```

Remplace `TA_CLE_SITE_RECAPTCHA` par ta clé publique reCAPTCHA.

### 4.2 Intégrer le composant ContactForm

Copie le fichier `ContactForm.jsx` dans ton projet Base44.

Avant de l'utiliser, modifie ces 2 lignes en haut du fichier :

```javascript
const RECAPTCHA_SITE_KEY = 'TA_CLE_SITE_RECAPTCHA';  // ta clé PUBLIQUE
const API_BASE_URL = 'https://izy-backend-xxxxx.up.railway.app';  // ton URL Railway/Render
```

### 4.3 Prompt à donner à Base44

> Intègre le composant ContactForm que je te fournis dans la page /contact 
> de mon site. Ce composant gère un formulaire de contact sécurisé avec 
> reCAPTCHA v3 et un bouton WhatsApp. Assure-toi que le script reCAPTCHA 
> est chargé dans le <head> global du site. Le composant fait des appels 
> API vers mon backend. Ne modifie pas la logique du composant, adapte 
> uniquement le style si nécessaire pour qu'il s'intègre au design du site.

---

## Étape 5 — Tester

### Test en local

```bash
# 1. Clone le repo
cd izy-backend

# 2. Copie le fichier d'environnement
cp .env.example .env

# 3. Remplis les valeurs dans .env

# 4. Installe les dépendances
npm install

# 5. Lance le serveur
npm run dev

# 6. Teste
curl http://localhost:3001/api/health
# → {"status":"ok","timestamp":"..."}
```

### Test du formulaire

1. Ouvre ton site
2. Remplis le formulaire et envoie
3. Vérifie que tu reçois l'email à l'adresse CONTACT_EMAIL
4. Teste le bouton WhatsApp — il doit ouvrir WhatsApp sans que le numéro soit visible dans le code source
5. Essaie d'envoyer 4+ messages d'affilée → tu dois être bloqué par le rate limiter

### Test anti-bot

1. Ouvre les DevTools (F12) → Network
2. Envoie un message → vérifie que le token reCAPTCHA est envoyé dans la requête
3. Vérifie qu'aucun numéro de téléphone n'apparaît dans le code source (Ctrl+U)

---

## Étape 6 — Monitoring

### Voir les logs

Sur Railway : onglet "Deployments" → clic sur le déploiement → "View Logs"
Sur Render : onglet "Logs"

### Voir les stats anti-spam

```bash
curl -H "x-api-key: TA_CLE_ADMIN" https://ton-backend.com/api/admin/stats
```

Retourne : les IPs les plus actives, les IPs bloquées, le nombre total d'IPs trackées.

---

## Résumé des protections en place

| Protection                  | Contre quoi                            |
|-----------------------------|----------------------------------------|
| reCAPTCHA v3 (score 0-1)    | Bots automatisés                       |
| Rate limit global (30/15min) | Attaques par force brute               |
| Rate limit contact (3/h)    | Spam de formulaire                     |
| Rate limit WhatsApp (5/h)   | Scraping du numéro WhatsApp            |
| Honeypot (champ caché)      | Bots simples qui remplissent tout      |
| Blocage IP (50 req/10min)   | Attaques DDoS légères                  |
| Sanitization des inputs     | Injection HTML/XSS                     |
| Numéro côté serveur seul    | Scraping/harvesting de numéro          |
| Logs IP horodatés           | Traçabilité et analyse post-incident   |
| Validation email/téléphone  | Données invalides                      |
| Taille requête limitée      | Payload attacks                        |
| Helmet (headers sécu)       | Clickjacking, sniffing, XSS            |
