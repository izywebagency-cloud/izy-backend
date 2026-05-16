// ============================================================
// izy-agency.com — Backend Anti-Spam & Contact Sécurisé
// ============================================================
// Ce serveur gère :
// 1. Vérification reCAPTCHA v3 (Google)
// 2. Rate limiting par IP (anti-spam)
// 3. Envoi d'emails sécurisé
// 4. Redirection WhatsApp sans exposer le numéro côté client
// 5. Journalisation des IPs pour traçabilité
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// 1. CONFIGURATION SÉCURITÉ
// ============================================================

// Helmet — en-têtes de sécurité HTTP
app.use(helmet());

// CORS — autorise uniquement ton domaine
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://izy-agency.com'],
  methods: ['POST', 'GET'],
  credentials: true
}));

// Parse JSON
app.use(express.json({ limit: '10kb' })); // limite la taille des requêtes

// Trust proxy (nécessaire si derrière Cloudflare/Nginx pour lire la vraie IP)
app.set('trust proxy', 1);

// ============================================================
// 2. RATE LIMITING PAR IP
// ============================================================

// Limite globale : 30 requêtes max par IP toutes les 15 minutes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Trop de requêtes depuis cette adresse IP. Réessayez dans 15 minutes.'
  },
  keyGenerator: (req) => getClientIP(req)
});

// Limite stricte pour le formulaire de contact : 3 emails max par IP par heure
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Vous avez déjà envoyé plusieurs messages. Réessayez dans 1 heure.'
  },
  keyGenerator: (req) => getClientIP(req)
});

// Limite pour WhatsApp : 5 demandes max par IP par heure
const whatsappLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Trop de demandes de contact WhatsApp. Réessayez plus tard.'
  },
  keyGenerator: (req) => getClientIP(req)
});

app.use(globalLimiter);

// ============================================================
// 3. JOURNALISATION DES IPs
// ============================================================

const LOG_FILE = path.join(__dirname, 'logs', 'access.log');

// Créer le dossier logs s'il n'existe pas
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'));
}

// Stocker les IPs en mémoire pour détection de comportement suspect
const ipTracker = new Map();

function getClientIP(req) {
  return req.headers['cf-connecting-ip']  // Cloudflare
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.ip
    || req.connection?.remoteAddress
    || 'unknown';
}

function logAccess(ip, action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    ip,
    action,
    ...details
  };

  // Log en fichier
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

  // Tracker en mémoire
  if (!ipTracker.has(ip)) {
    ipTracker.set(ip, { requests: 0, firstSeen: Date.now(), blocked: false });
  }
  const tracker = ipTracker.get(ip);
  tracker.requests++;
  tracker.lastSeen = Date.now();

  // Si plus de 50 requêtes en 10 minutes → marquer comme suspect
  if (tracker.requests > 50 && (Date.now() - tracker.firstSeen) < 10 * 60 * 1000) {
    tracker.blocked = true;
    console.warn(`⚠️  IP SUSPECTE BLOQUÉE : ${ip} — ${tracker.requests} requêtes`);
  }

  return tracker;
}

// Middleware de vérification IP bloquée
function checkBlockedIP(req, res, next) {
  const ip = getClientIP(req);
  const tracker = ipTracker.get(ip);
  if (tracker?.blocked) {
    return res.status(429).json({
      success: false,
      error: 'Votre adresse IP a été temporairement bloquée pour activité suspecte.'
    });
  }
  next();
}

app.use(checkBlockedIP);

// Nettoyage périodique du tracker (toutes les 30 min)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [ip, data] of ipTracker.entries()) {
    if (data.lastSeen < cutoff) {
      ipTracker.delete(ip);
    }
  }
}, 30 * 60 * 1000);

// ============================================================
// 4. VÉRIFICATION reCAPTCHA v3
// ============================================================

async function verifyRecaptcha(token, expectedAction) {
  if (!token) {
    return { success: false, score: 0, error: 'Token reCAPTCHA manquant' };
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: token
      })
    });

    const data = await response.json();

    // Vérifier le score (0.0 = bot, 1.0 = humain)
    // Un seuil de 0.5 est recommandé par Google
    const SCORE_THRESHOLD = parseFloat(process.env.RECAPTCHA_THRESHOLD) || 0.5;

    if (!data.success) {
      return { success: false, score: 0, error: 'Token reCAPTCHA invalide', details: data['error-codes'] };
    }

    if (data.score < SCORE_THRESHOLD) {
      return { success: false, score: data.score, error: 'Score reCAPTCHA trop bas — activité suspecte détectée' };
    }

    if (expectedAction && data.action !== expectedAction) {
      return { success: false, score: data.score, error: 'Action reCAPTCHA non conforme' };
    }

    return { success: true, score: data.score };

  } catch (err) {
    console.error('Erreur reCAPTCHA:', err);
    return { success: false, score: 0, error: 'Erreur de vérification reCAPTCHA' };
  }
}

// ============================================================
// 5. CONFIGURATION EMAIL (Nodemailer)
// ============================================================

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ============================================================
// 6. VALIDATION DES DONNÉES
// ============================================================

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[<>]/g, '')     // empêche injection HTML basique
    .substring(0, 1000);       // limite la longueur
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePhone(phone) {
  // Accepte les formats français et internationaux
  const re = /^[\d\s\+\-\.\(\)]{7,20}$/;
  return re.test(phone);
}

// ============================================================
// 7. ROUTES API
// ============================================================

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- ENVOI EMAIL DE CONTACT ----
app.post('/api/contact', contactLimiter, async (req, res) => {
  const ip = getClientIP(req);

  try {
    const { name, email, phone, message, projectType, recaptchaToken } = req.body;

    // 1. Vérifier reCAPTCHA
    const captchaResult = await verifyRecaptcha(recaptchaToken, 'contact_form');
    if (!captchaResult.success) {
      logAccess(ip, 'CONTACT_BLOCKED_CAPTCHA', { score: captchaResult.score });
      return res.status(403).json({
        success: false,
        error: 'Vérification anti-spam échouée. Veuillez réessayer.'
      });
    }

    // 2. Valider les champs
    const cleanName = sanitize(name);
    const cleanEmail = sanitize(email);
    const cleanPhone = sanitize(phone);
    const cleanMessage = sanitize(message);
    const cleanProjectType = sanitize(projectType);

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ success: false, error: 'Nom requis (2 caractères min.)' });
    }
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Adresse email invalide' });
    }
    if (cleanPhone && !validatePhone(cleanPhone)) {
      return res.status(400).json({ success: false, error: 'Numéro de téléphone invalide' });
    }
    if (!cleanMessage || cleanMessage.length < 10) {
      return res.status(400).json({ success: false, error: 'Message requis (10 caractères min.)' });
    }

    // 3. Honeypot check (champ invisible côté frontend)
    if (req.body.website) {
      // Si ce champ caché est rempli → c'est un bot
      logAccess(ip, 'CONTACT_BLOCKED_HONEYPOT');
      return res.status(200).json({ success: true }); // on fait croire que ça a marché
    }

    // 4. Envoyer l'email
    await transporter.sendMail({
      from: `"izy — Formulaire de contact" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_EMAIL,
      replyTo: cleanEmail,
      subject: `[izy] Nouveau message de ${cleanName} — ${cleanProjectType || 'Contact'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1a1a1a;">Nouveau message depuis izy-agency.com</h2>
          <hr style="border: 1px solid #eee;">
          <p><strong>Nom :</strong> ${cleanName}</p>
          <p><strong>Email :</strong> ${cleanEmail}</p>
          ${cleanPhone ? `<p><strong>Téléphone :</strong> ${cleanPhone}</p>` : ''}
          ${cleanProjectType ? `<p><strong>Type de projet :</strong> ${cleanProjectType}</p>` : ''}
          <p><strong>Message :</strong></p>
          <p style="background: #f9f9f9; padding: 15px; border-radius: 5px;">${cleanMessage.replace(/\n/g, '<br>')}</p>
          <hr style="border: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">
            IP : ${ip} | Score reCAPTCHA : ${captchaResult.score} | 
            Date : ${new Date().toLocaleString('fr-FR')}
          </p>
        </div>
      `
    });

    // 5. Logger le succès
    logAccess(ip, 'CONTACT_SENT', { name: cleanName, email: cleanEmail, score: captchaResult.score });

    res.json({
      success: true,
      message: 'Votre message a bien été envoyé. Nous vous répondons sous 24h.'
    });

  } catch (err) {
    console.error('Erreur envoi email:', err);
    logAccess(ip, 'CONTACT_ERROR', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du message. Veuillez réessayer.'
    });
  }
});

// ---- REDIRECTION WHATSAPP SÉCURISÉE ----
// Le numéro n'est JAMAIS envoyé au frontend
app.post('/api/whatsapp', whatsappLimiter, async (req, res) => {
  const ip = getClientIP(req);

  try {
    const { recaptchaToken, message } = req.body;

    // 1. Vérifier reCAPTCHA
    const captchaResult = await verifyRecaptcha(recaptchaToken, 'whatsapp_contact');
    if (!captchaResult.success) {
      logAccess(ip, 'WHATSAPP_BLOCKED_CAPTCHA', { score: captchaResult.score });
      return res.status(403).json({
        success: false,
        error: 'Vérification anti-spam échouée. Veuillez réessayer.'
      });
    }

    // 2. Construire l'URL WhatsApp côté serveur
    const phoneNumber = process.env.WHATSAPP_NUMBER; // ex: 33612345678
    const defaultMessage = encodeURIComponent(
      message || 'Bonjour, je vous contacte depuis izy-agency.com. J\'aimerais discuter d\'un projet.'
    );
    const whatsappURL = `https://wa.me/${phoneNumber}?text=${defaultMessage}`;

    // 3. Logger
    logAccess(ip, 'WHATSAPP_REDIRECT', { score: captchaResult.score });

    // 4. Envoyer l'URL (le numéro est masqué dans l'URL wa.me)
    res.json({
      success: true,
      redirectUrl: whatsappURL
    });

  } catch (err) {
    console.error('Erreur WhatsApp:', err);
    logAccess(ip, 'WHATSAPP_ERROR', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du lien de contact.'
    });
  }
});

// ---- VÉRIFICATION CAPTCHA SEULE (pour pré-vérifier côté frontend) ----
app.post('/api/verify-captcha', async (req, res) => {
  const ip = getClientIP(req);
  const { recaptchaToken, action } = req.body;

  const result = await verifyRecaptcha(recaptchaToken, action);
  logAccess(ip, 'CAPTCHA_CHECK', { action, score: result.score, success: result.success });

  res.json({
    success: result.success,
    score: result.score
  });
});

// ---- STATS ADMIN (protégé par clé API) ----
app.get('/api/admin/stats', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const stats = {
    totalTrackedIPs: ipTracker.size,
    blockedIPs: [...ipTracker.entries()]
      .filter(([, data]) => data.blocked)
      .map(([ip, data]) => ({ ip, requests: data.requests })),
    topIPs: [...ipTracker.entries()]
      .sort((a, b) => b[1].requests - a[1].requests)
      .slice(0, 10)
      .map(([ip, data]) => ({ ip, requests: data.requests, blocked: data.blocked }))
  };

  res.json(stats);
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// ---- Gestion des erreurs globales ----
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ============================================================
// 8. DÉMARRAGE DU SERVEUR
// ============================================================

app.listen(PORT, () => {
  console.log(`\n🛡️  izy Backend Anti-Spam`);
  console.log(`   Serveur démarré sur le port ${PORT}`);
  console.log(`   CORS autorisé : ${process.env.ALLOWED_ORIGINS || 'https://izy-agency.com'}`);
  console.log(`   reCAPTCHA : ${process.env.RECAPTCHA_SECRET_KEY ? '✅ Configuré' : '❌ MANQUANT'}`);
  console.log(`   SMTP : ${process.env.SMTP_HOST ? '✅ Configuré' : '❌ MANQUANT'}`);
  console.log(`   WhatsApp : ${process.env.WHATSAPP_NUMBER ? '✅ Configuré' : '❌ MANQUANT'}\n`);
});
