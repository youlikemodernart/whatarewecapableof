const {
  getConfig,
  normalizeShop,
  callbackUrl,
  createState,
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

  const rawShop = req.query?.shop || req.query?.store;
  if (!rawShop) {
    return html(res, 200, `<h1>WAWCO Shopify read-only install</h1>
<p>Enter the store's myshopify domain to start the read-only OAuth flow.</p>
<form method="GET" action="/api/shopify/install">
  <p><label>Shop domain<br><input name="shop" placeholder="0da67d-c2.myshopify.com" style="width:100%;max-width:420px;padding:8px;"></label></p>
  <p><button type="submit">Start install</button></p>
</form>
<p>Requested scopes: <code>${escapeHtml(config.scopes)}</code></p>`);
  }

  let shop;
  try {
    shop = normalizeShop(rawShop);
  } catch (err) {
    return html(res, 400, `<h1 class="error">Invalid shop domain</h1><p>${escapeHtml(err.message)}</p>`);
  }

  const state = createState(shop, config.clientSecret);
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scopes,
    redirect_uri: callbackUrl(req),
    state,
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, `https://${shop}/admin/oauth/authorize?${params.toString()}`);
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
