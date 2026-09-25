// Vercel serverless function: server-side proxy for the two published
// Google Sheets CSV exports used by the dashboard.
//
// Why this exists: fetching docs.google.com's "Publish to web" CSV link
// directly from the browser is frequently blocked by CORS (Google does not
// reliably send Access-Control-Allow-Origin for this endpoint). A request
// made from THIS server (Vercel -> Google) has no such restriction, so we
// fetch it here and hand the plain CSV back to the browser same-origin.
//
// Only two fixed, known URLs are proxied (never an arbitrary user-supplied
// URL) to avoid turning this into an open proxy.

const SOURCES = {
  // Sheet1 (aging / piutang report)
  piutang: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ8rWnYng7TGqvAMl7aryX7yZE7hQnzwF3Urqwu1t8bPq9AFJBXPfqaGmUzTk08Nw91e6mQGV6kbc2J/pub?gid=860325626&single=true&output=csv',
  // Data (raw sales log)
  penjualan: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ8rWnYng7TGqvAMl7aryX7yZE7hQnzwF3Urqwu1t8bPq9AFJBXPfqaGmUzTk08Nw91e6mQGV6kbc2J/pub?gid=0&single=true&output=csv',
};

module.exports = async (req, res) => {
  const type = (req.query && req.query.type) || '';
  const target = SOURCES[type];

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!target) {
    res.status(400).send('Unknown or missing "type". Use ?type=piutang or ?type=penjualan');
    return;
  }

  try {
    const upstream = await fetch(target, { cache: 'no-store' });
    if (!upstream.ok) {
      res.status(502).send(`Upstream (Google Sheets) returned HTTP ${upstream.status}`);
      return;
    }
    const text = await upstream.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).send(text);
  } catch (err) {
    res.status(502).send('Proxy fetch failed: ' + (err && err.message ? err.message : String(err)));
  }
};
