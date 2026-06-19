const {
  getConfig,
  normalizeShop,
  verifyState,
  verifyShopifyHmac,
  html,
} = require('./_oauth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let config;
  try {
    config = getConfig();
  } catch (err) {
    return html(res, 500, `<h1 class="error">Shopify OAuth is not configured</h1><p>${escapeHtml(err.message)}</p>`);
  }

  let shop;
  try {
    shop = normalizeShop(req.query?.shop || '');
  } catch (err) {
    return html(res, 400, `<h1 class="error">Invalid callback</h1><p>${escapeHtml(err.message)}</p>`);
  }

  if (!verifyShopifyHmac(req.query || {}, config.clientSecret)) {
    return html(res, 400, '<h1 class="error">Invalid Shopify HMAC</h1><p>The callback signature did not verify.</p>');
  }

  if (!verifyState(req.query?.state, shop, config.clientSecret)) {
    return html(res, 400, '<h1 class="error">Invalid OAuth state</h1><p>The install link expired or did not match this store. Start the install again.</p>');
  }

  const code = String(req.query?.code || '').trim();
  if (!code) {
    return html(res, 400, '<h1 class="error">Missing OAuth code</h1>');
  }

  let tokenPayload;
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
      }),
    });

    const text = await response.text();
    try {
      tokenPayload = JSON.parse(text);
    } catch (err) {
      tokenPayload = { raw: text };
    }

    if (!response.ok || !tokenPayload.access_token) {
      return html(res, 502, `<h1 class="error">Token exchange failed</h1><pre>${escapeHtml(JSON.stringify(tokenPayload, null, 2))}</pre>`);
    }
  } catch (err) {
    return html(res, 502, `<h1 class="error">Token exchange failed</h1><p>${escapeHtml(err.message)}</p>`);
  }

  const token = tokenPayload.access_token;
  const grantedScopes = tokenPayload.scope || '';
  const envLine = `KW_SUBSTRATE_SHOPIFY_ADMIN_TOKEN=${token}`;

  return html(res, 200, `<h1>Shopify read-only token created</h1>
<p>Store: <code>${escapeHtml(shop)}</code></p>
<p>Granted scopes: <code>${escapeHtml(grantedScopes)}</code></p>
<p>Copy this line into <code>~/Projects/whatarewecapableof/.env.local</code>. Do not paste it into chat, docs, project memory, Git, Slack, or email.</p>
<textarea readonly onclick="this.select()">${escapeHtml(envLine)}</textarea>
<p>After saving, close this tab. This page does not store the token.</p>`);
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
