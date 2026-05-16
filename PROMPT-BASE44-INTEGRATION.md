# PROMPT POUR BASE44 — Intégration du système de contact sécurisé

---

## Contexte

J'ai créé un backend Node.js/Express déployé à l'adresse : [URL_DE_MON_BACKEND]
Ce backend gère la vérification reCAPTCHA v3, le rate limiting par IP, l'envoi d'emails et la redirection sécurisée vers WhatsApp.

Je veux maintenant intégrer un formulaire de contact sécurisé sur mon site.

---

## Ce que tu dois faire

### 1. Ajouter le script reCAPTCHA v3 dans le <head> global du site

```html
<script src="https://www.google.com/recaptcha/api.js?render=[MA_CLE_SITE_RECAPTCHA]"></script>
```

### 2. Supprimer tout numéro de téléphone visible

- Supprime tout numéro de téléphone WhatsApp ou personnel affiché en dur sur le site (dans le HTML, le footer, la page contact, ou n'importe où)
- Le numéro ne doit JAMAIS apparaître dans le code source côté client
- Le contact WhatsApp passe désormais par le backend uniquement

### 3. Créer la page /contact avec ce formulaire

Intègre un formulaire de contact avec ces champs :
- Nom complet (obligatoire, min 2 caractères)
- Email (obligatoire, validation format email)
- Téléphone (optionnel)
- Type de projet (select : Site vitrine, Boutique en ligne, Refonte de site, Référencement SEO, Identité visuelle, Autre)
- Message (obligatoire, min 10 caractères)
- Un champ caché "website" (honeypot anti-bot, invisible à l'utilisateur, style: position absolute, left -9999px, opacity 0)

Le formulaire doit :
- Au submit, obtenir un token reCAPTCHA v3 via `window.grecaptcha.execute('[MA_CLE_SITE]', {action: 'contact_form'})`
- Envoyer un POST vers `[URL_DE_MON_BACKEND]/api/contact` avec tous les champs + le `recaptchaToken`
- Afficher un message de succès vert si `success: true`
- Afficher un message d'erreur rouge si `success: false` avec le message d'erreur retourné
- Désactiver le bouton pendant l'envoi

### 4. Ajouter un bouton "Contacter sur WhatsApp"

Le bouton doit :
- Au clic, obtenir un token reCAPTCHA via `window.grecaptcha.execute('[MA_CLE_SITE]', {action: 'whatsapp_contact'})`
- Envoyer un POST vers `[URL_DE_MON_BACKEND]/api/whatsapp` avec le token et un message optionnel
- Si succès, ouvrir `data.redirectUrl` dans un nouvel onglet
- Si erreur, afficher une alerte

Le bouton doit être vert (#25D366) avec l'icône WhatsApp.

### 5. Design

- Le formulaire doit s'intégrer au design existant du site
- Style moderne : coins arrondis, ombres légères, espacement aéré
- Responsive mobile (les champs en 2 colonnes sur desktop, 1 colonne sur mobile)
- Mention "Ce site est protégé par reCAPTCHA" en petit en bas du formulaire
- Les messages de succès/erreur doivent être visuellement clairs

### 6. Footer

Dans le footer du site, remplace tout lien WhatsApp direct (wa.me/...) par un bouton qui passe par le même mécanisme de vérification reCAPTCHA décrit ci-dessus.

---

## Valeurs à utiliser

- **Clé reCAPTCHA site (publique)** : [À REMPLIR]
- **URL du backend** : [À REMPLIR]

## Important

- Ne mets AUCUN numéro de téléphone dans le code HTML/JSX côté client
- Tous les appels vers le backend doivent inclure le header `Content-Type: application/json`
- Le champ honeypot "website" doit être totalement invisible (pas juste display:none, mais position absolute hors écran)
