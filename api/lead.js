// Recibe el formulario de cotización de meetupco.com y crea/actualiza el contacto como cliente en Shopify.
// El aviso interno (a emaldonado@meetupco.com) lo envía Shopify Flow (disparador: etiqueta "Formulario web").
// La confirmación "recibimos tu solicitud" a la persona la envía Resend, solo si existe RESEND_API_KEY.
// Variables de entorno en Vercel: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN, SHOPIFY_API_VERSION (opcional), RESEND_API_KEY.

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
const ETIQUETA_BASE = 'Formulario web';
const REMITENTE = 'MeetUp <emaldonado@meetupco.com>';
const RESPONDER_A = 'emaldonado@meetupco.com';
const WHATSAPP = 'https://wa.me/573144358107';

function limpiar(v, max = 500) {
  return String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function telefonoE164(tel) {
  const d = String(tel || '').replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(d)) return d;
  if (/^3\d{9}$/.test(d)) return '+57' + d;      // celular colombiano sin indicativo
  if (/^57\d{10}$/.test(d)) return '+' + d;
  return null;
}

function escaparHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Confirmación a la persona. Si falla, no afecta el registro del contacto.
async function enviarConfirmacion({ email, nombre, interes }) {
  if (!process.env.RESEND_API_KEY) return;
  const n = escaparHtml(nombre);
  const tema = interes ? ` sobre <b>${escaparHtml(interes)}</b>` : '';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#242835;line-height:1.55">
    <div style="padding:20px 0;border-bottom:3px solid #00A886"><b style="font-size:20px">MeetUp</b>
      <span style="color:#6b7280;font-size:13px"> · Salas inteligentes</span></div>
    <h2 style="color:#00A886;margin:24px 0 8px">¡Gracias por escribirnos, ${n}!</h2>
    <p>Recibimos tu solicitud${tema}. Un asesor de MeetUp te contactará en menos de 24 horas hábiles.</p>
    <p>Si es urgente, escríbenos por WhatsApp:</p>
    <p><a href="${WHATSAPP}" style="display:inline-block;background:#00A886;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Escribir por WhatsApp</a></p>
    <p>Mientras tanto, puedes conocer nuestras soluciones en <a href="https://tienda.meetupco.com" style="color:#00A886">tienda.meetupco.com</a>.</p>
    <p style="margin-top:28px">— Equipo MeetUp</p>
    <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px">MEETUP S.A.S. · Carrera 11 # 90-07, Bogotá, Colombia.
      Recibes este correo porque enviaste una solicitud en meetupco.com.</p>
  </div>`;
  const texto = `¡Gracias por escribirnos, ${nombre}!

Recibimos tu solicitud${interes ? ' sobre ' + interes : ''}. ` +
    `Un asesor de MeetUp te contactará en menos de 24 horas hábiles.

Si es urgente: ${WHATSAPP}

— Equipo MeetUp`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE, to: [email], reply_to: RESPONDER_A,
        subject: 'Recibimos tu solicitud — MeetUp', html, text: texto
      })
    });
    if (!r.ok) console.error('resend error', r.status, await r.text());
  } catch (e) {
    console.error('resend error', e.message);
  }
}

async function shopify(query, variables) {
  const r = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      'User-Agent': 'Mozilla/5.0 (meetupco.com lead form)'
    },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error('Shopify: ' + JSON.stringify(j.errors || r.status));
  return j.data;
}

// Detecta strings de alta entropía / caracteres aleatorios típicos de bots
// (sin vocales, sin espacios en nombres de > 10 chars, ratio consonantes muy alto)
function pareceBot(v) {
  if (!v || v.length < 6) return false;
  const s = String(v);
  const vocales = (s.match(/[aeiouáéíóuü]/gi) || []).length;
  // Menos del 10 % de vocales en strings largos → probable bot
  if (s.length > 10 && vocales / s.length < 0.10) return true;
  // Más de 20 chars sin ningún espacio en campo nombre → probable bot
  if (s.length > 20 && !/\s/.test(s)) return true;
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = req.body || {};

  // 1. Honeypot: si el campo oculto tiene valor, es un bot
  if (b._honey) return res.status(200).json({ ok: true, lead: false });

  // 2. Verificación de tiempo: envíos en menos de 4 segundos son automáticos
  const ts = parseInt(b._ts || '0', 10);
  if (ts && Date.now() - ts < 4000) return res.status(200).json({ ok: true, lead: false });

  const email = limpiar(b.email, 200).toLowerCase();
  const nombre = limpiar(b.nombre, 80);
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'datos' });
  }

  // 3. Detección de contenido aleatorio en campos clave
  if (pareceBot(nombre) || pareceBot(b.empresa) || pareceBot(b.mensaje)) {
    return res.status(200).json({ ok: true, lead: false });
  }

  const apellidos = limpiar(b.apellidos, 80);
  const empresa = limpiar(b.empresa, 120);
  const telefono = limpiar(b.telefono, 30);
  const interes = limpiar(b.interes, 80);
  const mensaje = limpiar(b.mensaje, 2000);
  const gclid = limpiar(b.gclid, 200);
  const campana = limpiar(b.utm_campaign, 120);
  const acepta = b.acepta_marketing === 'si';

  const tags = [ETIQUETA_BASE];
  if (interes) tags.push('Interés: ' + interes);
  tags.push(gclid ? 'Origen: Google Ads' : 'Origen: Web');

  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const nota = [
    `— Solicitud web ${fecha} —`,
    `Empresa: ${empresa || '-'}`,
    `Teléfono: ${telefono || '-'}`,
    `¿Qué necesita?: ${interes || '-'}`,
    `Mensaje: ${mensaje || '-'}`,
    `Campaña: ${campana || (gclid ? 'Google Ads' : 'Orgánico / directo')}`,
    gclid ? `gclid: ${gclid}` : null,
    `Acepta información comercial: ${acepta ? 'Sí' : 'No'}`
  ].filter(Boolean).join('\n');

  try {
    const busqueda = await shopify(
      `query($q: String!) { customers(first: 1, query: $q) { nodes { id note } } }`,
      { q: `email:"${email}"` }
    );
    const existente = busqueda.customers.nodes[0];
    let id;

    if (existente) {
      id = existente.id;
      const notaFinal = ((existente.note ? existente.note + '\n\n' : '') + nota).slice(-5000);
      await shopify(
        `mutation($input: CustomerInput!) { customerUpdate(input: $input) { userErrors { field message } } }`,
        { input: { id, note: notaFinal } }
      );
    } else {
      const base = { email, firstName: nombre, lastName: apellidos || null, note: nota };
      const tel = telefonoE164(telefono);
      let r = await shopify(
        `mutation($input: CustomerInput!) { customerCreate(input: $input) { customer { id } userErrors { field message } } }`,
        { input: tel ? { ...base, phone: tel } : base }
      );
      if (r.customerCreate.userErrors.length && tel) {
        // Teléfono rechazado (formato o ya usado por otro cliente): se crea sin él; queda en la nota
        r = await shopify(
          `mutation($input: CustomerInput!) { customerCreate(input: $input) { customer { id } userErrors { field message } } }`,
          { input: base }
        );
      }
      if (r.customerCreate.userErrors.length) throw new Error(JSON.stringify(r.customerCreate.userErrors));
      id = r.customerCreate.customer.id;
    }

    // Etiquetas al final, siempre "nuevas": Shopify Flow se dispara con "Etiquetas del cliente añadidas",
    // así avisa también cuando un cliente que ya existía vuelve a escribir
    if (existente) {
      await shopify(
        `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }`,
        { id, tags: [ETIQUETA_BASE] }
      );
    }
    await shopify(
      `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
      { id, tags }
    );

    if (acepta) {
      await shopify(
        `mutation($input: CustomerEmailMarketingConsentUpdateInput!) {
          customerEmailMarketingConsentUpdate(input: $input) { userErrors { field message } } }`,
        { input: { customerId: id, emailMarketingConsent: {
          marketingState: 'SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN', consentUpdatedAt: new Date().toISOString()
        } } }
      );
    }

    await enviarConfirmacion({ email, nombre, interes });

    return res.status(200).json({ ok: true, lead: true });
  } catch (e) {
    console.error('lead error', e.message);
    return res.status(500).json({ ok: false });
  }
};
