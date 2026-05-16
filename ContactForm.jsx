// ============================================================
// ContactForm.jsx — Composant React pour Base44
// Formulaire de contact sécurisé + bouton WhatsApp protégé
// ============================================================
// 
// INSTALLATION :
// 1. Ajoute ce script dans ton <head> (Base44 → paramètres → custom code) :
//    <script src="https://www.google.com/recaptcha/api.js?render=TA_CLE_SITE_RECAPTCHA"></script>
//
// 2. Remplace TOUTES les occurrences de :
//    - TA_CLE_SITE_RECAPTCHA → ta clé publique reCAPTCHA v3
//    - https://ton-backend.com → l'URL de ton backend déployé
//
// 3. Copie ce composant dans Base44
// ============================================================

import React, { useState, useRef } from 'react';

// ⚠️ REMPLACE PAR TES VALEURS
const RECAPTCHA_SITE_KEY = 'TA_CLE_SITE_RECAPTCHA';
const API_BASE_URL = 'https://ton-backend.com';

// ============================================================
// Hook reCAPTCHA
// ============================================================
function useRecaptcha() {
  const executeRecaptcha = async (action) => {
    return new Promise((resolve, reject) => {
      if (!window.grecaptcha) {
        reject(new Error('reCAPTCHA non chargé'));
        return;
      }
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(RECAPTCHA_SITE_KEY, { action })
          .then(resolve)
          .catch(reject);
      });
    });
  };
  return { executeRecaptcha };
}

// ============================================================
// Composant principal
// ============================================================
export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    projectType: '',
    message: '',
    website: '' // ← HONEYPOT (invisible)
  });

  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const formRef = useRef(null);
  const { executeRecaptcha } = useRecaptcha();

  // ---- Handlers ----
  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ---- Envoi du formulaire ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      // 1. Obtenir le token reCAPTCHA
      const recaptchaToken = await executeRecaptcha('contact_form');

      // 2. Envoyer au backend
      const res = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          recaptchaToken
        })
      });

      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setFormData({ name: '', email: '', phone: '', projectType: '', message: '', website: '' });
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Une erreur est survenue.');
      }

    } catch (err) {
      setStatus('error');
      setErrorMsg('Impossible de contacter le serveur. Vérifiez votre connexion.');
    }
  };

  // ---- Contact WhatsApp sécurisé ----
  const handleWhatsApp = async () => {
    setWhatsappLoading(true);

    try {
      const recaptchaToken = await executeRecaptcha('whatsapp_contact');

      const res = await fetch(`${API_BASE_URL}/api/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recaptchaToken,
          message: `Bonjour, je suis ${formData.name || 'un visiteur'}. Je vous contacte depuis izy-agency.com.`
        })
      });

      const data = await res.json();

      if (data.success && data.redirectUrl) {
        window.open(data.redirectUrl, '_blank', 'noopener,noreferrer');
      } else {
        alert(data.error || 'Impossible de générer le lien WhatsApp.');
      }

    } catch (err) {
      alert('Erreur de connexion. Réessayez.');
    } finally {
      setWhatsappLoading(false);
    }
  };

  // ============================================================
  // RENDU
  // ============================================================
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Parlons de votre projet</h2>
        <p style={styles.subtitle}>
          Remplissez le formulaire ci-dessous ou contactez-nous directement sur WhatsApp.
          Nous répondons sous 24h.
        </p>

        {/* ---- Message de succès ---- */}
        {status === 'success' && (
          <div style={styles.successBox}>
            <span style={styles.successIcon}>✓</span>
            <div>
              <strong>Message envoyé !</strong>
              <p style={{ margin: '4px 0 0' }}>Nous vous répondons sous 24h.</p>
            </div>
          </div>
        )}

        {/* ---- Formulaire ---- */}
        {status !== 'success' && (
          <form ref={formRef} onSubmit={handleSubmit} style={styles.form}>

            {/* HONEYPOT — champ invisible pour piéger les bots */}
            <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
                 aria-hidden="true">
              <label htmlFor="website">Ne pas remplir</label>
              <input
                type="text"
                id="website"
                name="website"
                tabIndex="-1"
                autoComplete="off"
                value={formData.website}
                onChange={handleChange}
              />
            </div>

            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="name">Nom complet *</label>
                <input
                  style={styles.input}
                  type="text"
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Jean Dupont"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="email">Email *</label>
                <input
                  style={styles.input}
                  type="email"
                  id="email"
                  name="email"
                  required
                  placeholder="jean@exemple.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="phone">Téléphone</label>
                <input
                  style={styles.input}
                  type="tel"
                  id="phone"
                  name="phone"
                  placeholder="06 12 34 56 78"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="projectType">Type de projet</label>
                <select
                  style={styles.input}
                  id="projectType"
                  name="projectType"
                  value={formData.projectType}
                  onChange={handleChange}
                >
                  <option value="">Sélectionnez...</option>
                  <option value="Site vitrine">Site vitrine</option>
                  <option value="Boutique en ligne">Boutique en ligne</option>
                  <option value="Refonte de site">Refonte de site</option>
                  <option value="Référencement SEO">Référencement SEO</option>
                  <option value="Identité visuelle">Identité visuelle</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="message">Votre message *</label>
              <textarea
                style={{ ...styles.input, minHeight: '120px', resize: 'vertical' }}
                id="message"
                name="message"
                required
                minLength={10}
                maxLength={2000}
                placeholder="Décrivez votre projet, vos besoins, votre budget approximatif..."
                value={formData.message}
                onChange={handleChange}
              />
            </div>

            {/* ---- Erreur ---- */}
            {status === 'error' && (
              <div style={styles.errorBox}>
                {errorMsg}
              </div>
            )}

            {/* ---- Boutons ---- */}
            <div style={styles.buttons}>
              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  ...styles.btnPrimary,
                  opacity: status === 'loading' ? 0.7 : 1,
                  cursor: status === 'loading' ? 'wait' : 'pointer'
                }}
              >
                {status === 'loading' ? 'Envoi en cours...' : 'Envoyer mon message'}
              </button>

              <button
                type="button"
                onClick={handleWhatsApp}
                disabled={whatsappLoading}
                style={{
                  ...styles.btnWhatsApp,
                  opacity: whatsappLoading ? 0.7 : 1,
                  cursor: whatsappLoading ? 'wait' : 'pointer'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginRight: 8 }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.12 1.519 5.855L.036 23.668l5.933-1.457A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82a9.796 9.796 0 01-5.09-1.42l-.365-.217-3.786.993 1.01-3.69-.238-.379A9.802 9.802 0 012.18 12 9.82 9.82 0 0112 2.18 9.82 9.82 0 0121.82 12 9.82 9.82 0 0112 21.82z"/>
                </svg>
                {whatsappLoading ? 'Vérification...' : 'Contacter sur WhatsApp'}
              </button>
            </div>

            <p style={styles.recaptchaNotice}>
              Ce site est protégé par reCAPTCHA. 
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"> Confidentialité</a> & 
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer"> Conditions</a> Google.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = {
  container: {
    width: '100%',
    maxWidth: '700px',
    margin: '0 auto',
    padding: '20px',
  },
  card: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#666',
    margin: '0 0 32px',
    lineHeight: '1.5',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '12px 16px',
    border: '1.5px solid #e0e0e0',
    borderRadius: '10px',
    fontSize: '15px',
    color: '#1a1a1a',
    background: '#fafafa',
    outline: 'none',
    transition: 'border-color 0.2s',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    flex: 1,
    minWidth: '200px',
    padding: '14px 24px',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  btnWhatsApp: {
    flex: 1,
    minWidth: '200px',
    padding: '14px 24px',
    background: '#25D366',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  },
  successBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '12px',
    color: '#166534',
  },
  successIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#22c55e',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  errorBox: {
    padding: '14px 18px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '10px',
    color: '#dc2626',
    fontSize: '14px',
  },
  recaptchaNotice: {
    fontSize: '11px',
    color: '#999',
    textAlign: 'center',
    margin: '8px 0 0',
  },
};
