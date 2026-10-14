// Recibe el formulario de cotización de meetupco.com y crea/actualiza el contacto como cliente en Shopify.
// El aviso por correo lo envía Shopify Flow (disparador: etiqueta "Formulario web").
// Variables de entorno en Vercel: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN, SHOPIFY_API_VERSION (opcional).

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
const ETIQUETA_BASE = 'Formulario web';

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = req.body || {};
  if (b._honey) return res.status(200).json({ ok: true }); // bot

  const email = limpiar(b.email, 200).toLowerCase();
  const nombre = limpiar(b.nombre, 80);
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'datos' });
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

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('lead error', e.message);
    return res.status(500).json({ ok: false });
  }
};
