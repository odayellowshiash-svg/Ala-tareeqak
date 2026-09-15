// server.js — Ala Tareeqak backend. Pure Node.js (http + node:sqlite), zero npm installs required.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { db, hashPassword, verifyPassword, genToken, genCode } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
// Only these root-level files are servable as static assets — keeps server.js,
// db.js, package.json, README.md, and data.db from ever being served over HTTP.
const STATIC_WHITELIST = new Set(['/index.html', '/app.js', '/styles.css']);

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function getAuthUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  return user || null;
}
function publicUser(u) {
  if (!u) return null;
  const { password_hash, password_salt, ...rest } = u;
  return rest;
}
function requireRole(user, roles) {
  return user && roles.includes(user.role);
}

// ---------- route handlers ----------
const routes = [];
function route(method, pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/:[a-zA-Z]+/g, (m) => {
        paramNames.push(m.slice(1));
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ method, regex, paramNames, handler });
}

// -- auth --
route('POST', '/api/auth/register', async (req, res) => {
  const body = await readBody(req);
  const { name, phone, password, role, city } = body;
  if (!name || !phone || !password || !role) return send(res, 400, { error: 'الاسم والهاتف وكلمة المرور والدور مطلوبة' });
  if (!['merchant', 'driver', 'agent'].includes(role)) return send(res, 400, { error: 'دور غير صالح' });
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) return send(res, 409, { error: 'رقم الهاتف مسجل مسبقاً' });
  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare(`INSERT INTO users (name, phone, password_hash, password_salt, role, city) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(name, phone, hash, salt, role, city || null);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = genToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  send(res, 201, { token, user: publicUser(user) });
});

route('POST', '/api/auth/login', async (req, res) => {
  const body = await readBody(req);
  const { phone, password } = body;
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !verifyPassword(password || '', user.password_hash, user.password_salt)) {
    return send(res, 401, { error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
  }
  const token = genToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  send(res, 200, { token, user: publicUser(user) });
});

route('GET', '/api/me', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return send(res, 401, { error: 'غير مصرح' });
  send(res, 200, { user: publicUser(user) });
});

// -- shipments --
route('POST', '/api/shipments', async (req, res) => {
  const user = getAuthUser(req);
  if (!requireRole(user, ['merchant'])) return send(res, 403, { error: 'للتجار فقط' });
  const body = await readBody(req);
  const { pickup_location, dropoff_location, cargo_desc, weight_tons, proposed_price } = body;
  if (!pickup_location || !dropoff_location || !cargo_desc || !weight_tons || !proposed_price) {
    return send(res, 400, { error: 'جميع الحقول مطلوبة' });
  }
  const code = genCode('SH');
  const info = db
    .prepare(
      `INSERT INTO shipments (code, merchant_id, pickup_location, dropoff_location, cargo_desc, weight_tons, proposed_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(code, user.id, pickup_location, dropoff_location, cargo_desc, weight_tons, proposed_price);
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(info.lastInsertRowid);
  send(res, 201, { shipment });
});

route('GET', '/api/shipments', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return send(res, 401, { error: 'غير مصرح' });
  let rows;
  if (user.role === 'merchant') {
    rows = db.prepare('SELECT * FROM shipments WHERE merchant_id = ? ORDER BY id DESC').all(user.id);
  } else if (user.role === 'driver') {
    rows = db.prepare("SELECT * FROM shipments WHERE status = 'open' ORDER BY id DESC").all();
  } else {
    rows = db.prepare('SELECT * FROM shipments ORDER BY id DESC').all();
  }
  send(res, 200, { shipments: rows });
});

route('GET', '/api/shipments/:id', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!user) return send(res, 401, { error: 'غير مصرح' });
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(params.id);
  if (!shipment) return send(res, 404, { error: 'غير موجود' });
  const offers = db
    .prepare(
      `SELECT offers.*, users.name AS driver_name, users.rating AS driver_rating, users.trips_count AS driver_trips
       FROM offers JOIN users ON users.id = offers.driver_id
       WHERE shipment_id = ? ORDER BY offers.price ASC`
    )
    .all(params.id);
  const escrow = db.prepare('SELECT * FROM escrow WHERE shipment_id = ?').get(params.id);
  send(res, 200, { shipment, offers, escrow: escrow || null });
});

// -- offers --
route('POST', '/api/shipments/:id/offers', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!requireRole(user, ['driver'])) return send(res, 403, { error: 'للسائقين فقط' });
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(params.id);
  if (!shipment) return send(res, 404, { error: 'غير موجود' });
  if (shipment.status !== 'open') return send(res, 400, { error: 'الطلب لم يعد مفتوحاً للعروض' });
  const body = await readBody(req);
  const { price, message } = body;
  if (!price) return send(res, 400, { error: 'السعر مطلوب' });
  const info = db
    .prepare('INSERT INTO offers (shipment_id, driver_id, price, message) VALUES (?, ?, ?, ?)')
    .run(params.id, user.id, price, message || null);
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(info.lastInsertRowid);
  send(res, 201, { offer });
});

route('POST', '/api/offers/:id/accept', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!requireRole(user, ['merchant'])) return send(res, 403, { error: 'للتجار فقط' });
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(params.id);
  if (!offer) return send(res, 404, { error: 'العرض غير موجود' });
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(offer.shipment_id);
  if (!shipment || shipment.merchant_id !== user.id) return send(res, 403, { error: 'غير مصرح لهذا الطلب' });
  if (shipment.status !== 'open') return send(res, 400, { error: 'تم البت في هذا الطلب مسبقاً' });

  db.prepare(
    `UPDATE shipments SET status = 'escrow_pending', accepted_offer_id = ?, accepted_driver_id = ?, agreed_price = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(offer.id, offer.driver_id, offer.price, shipment.id);
  db.prepare("UPDATE offers SET status = 'accepted' WHERE id = ?").run(offer.id);
  db.prepare("UPDATE offers SET status = 'rejected' WHERE shipment_id = ? AND id != ?").run(shipment.id, offer.id);

  const code = genCode('MRC');
  db.prepare('INSERT INTO escrow (shipment_id, code, amount, status) VALUES (?, ?, ?, ?)').run(
    shipment.id,
    code,
    offer.price,
    'pending'
  );

  const updated = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipment.id);
  const escrow = db.prepare('SELECT * FROM escrow WHERE shipment_id = ?').get(shipment.id);
  send(res, 200, { shipment: updated, escrow });
});

// -- escrow / cash agent --
route('GET', '/api/escrow/lookup/:code', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!requireRole(user, ['agent'])) return send(res, 403, { error: 'للوكلاء فقط' });
  const escrow = db.prepare('SELECT * FROM escrow WHERE code = ?').get(params.code);
  if (!escrow) return send(res, 404, { error: 'كود غير صحيح' });
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(escrow.shipment_id);
  const merchant = db.prepare('SELECT id, name, phone FROM users WHERE id = ?').get(shipment.merchant_id);
  send(res, 200, { escrow, shipment, merchant });
});

route('POST', '/api/escrow/:code/confirm', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!requireRole(user, ['agent'])) return send(res, 403, { error: 'للوكلاء فقط' });
  const escrow = db.prepare('SELECT * FROM escrow WHERE code = ?').get(params.code);
  if (!escrow) return send(res, 404, { error: 'كود غير صحيح' });
  if (escrow.status !== 'pending') return send(res, 400, { error: 'تم تأكيد هذا الإيداع مسبقاً' });

  db.prepare("UPDATE escrow SET status = 'confirmed', agent_id = ?, confirmed_at = datetime('now') WHERE id = ?").run(
    user.id,
    escrow.id
  );
  db.prepare("UPDATE shipments SET status = 'in_transit', updated_at = datetime('now') WHERE id = ?").run(escrow.shipment_id);
  db.prepare('INSERT INTO wallet_transactions (user_id, amount, type, ref) VALUES (?, ?, ?, ?)').run(
    user.id,
    escrow.amount,
    'escrow_received',
    escrow.code
  );

  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(escrow.shipment_id);
  const updatedEscrow = db.prepare('SELECT * FROM escrow WHERE id = ?').get(escrow.id);
  send(res, 200, { shipment, escrow: updatedEscrow });
});

// -- delivery / release of funds --
route('POST', '/api/shipments/:id/deliver', async (req, res, params) => {
  const user = getAuthUser(req);
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(params.id);
  if (!shipment) return send(res, 404, { error: 'غير موجود' });
  const isParty = user && (user.id === shipment.merchant_id || user.id === shipment.accepted_driver_id);
  if (!isParty) return send(res, 403, { error: 'غير مصرح' });
  if (shipment.status !== 'in_transit') return send(res, 400, { error: 'لا يمكن تسليم هذا الطلب الآن' });

  db.prepare("UPDATE shipments SET status = 'delivered', updated_at = datetime('now') WHERE id = ?").run(shipment.id);
  db.prepare("UPDATE escrow SET status = 'released', released_at = datetime('now') WHERE shipment_id = ?").run(shipment.id);

  if (shipment.accepted_driver_id) {
    db.prepare('UPDATE users SET wallet_balance = wallet_balance + ?, trips_count = trips_count + 1 WHERE id = ?').run(
      shipment.agreed_price,
      shipment.accepted_driver_id
    );
    db.prepare('INSERT INTO wallet_transactions (user_id, amount, type, ref) VALUES (?, ?, ?, ?)').run(
      shipment.accepted_driver_id,
      shipment.agreed_price,
      'trip_payout',
      shipment.code
    );
  }

  const updated = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipment.id);
  send(res, 200, { shipment: updated });
});

// -- wallet --
route('GET', '/api/wallet', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return send(res, 401, { error: 'غير مصرح' });
  const txns = db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC').all(user.id);
  send(res, 200, { balance: user.wallet_balance, transactions: txns });
});

// -- KYC --
route('POST', '/api/kyc/submit', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return send(res, 401, { error: 'غير مصرح' });
  db.prepare("UPDATE users SET kyc_status = 'submitted' WHERE id = ?").run(user.id);
  send(res, 200, { kyc_status: 'submitted' });
});

route('POST', '/api/kyc/:userId/review', async (req, res, params) => {
  const user = getAuthUser(req);
  if (!requireRole(user, ['admin'])) return send(res, 403, { error: 'للإدارة فقط' });
  const body = await readBody(req);
  const decision = body.decision === 'verified' ? 'verified' : 'rejected';
  db.prepare('UPDATE users SET kyc_status = ? WHERE id = ?').run(decision, params.userId);
  send(res, 200, { ok: true, kyc_status: decision });
});

// -- admin --
route('GET', '/api/admin/overview', async (req, res) => {
  const user = getAuthUser(req);
  if (!requireRole(user, ['admin'])) return send(res, 403, { error: 'للإدارة فقط' });
  const activeShipments = db
    .prepare("SELECT COUNT(*) AS c FROM shipments WHERE status NOT IN ('delivered','cancelled')")
    .get().c;
  const totalEscrow = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM escrow WHERE status IN ('pending','confirmed')").get().s;
  const usersByRole = db.prepare('SELECT role, COUNT(*) AS c FROM users GROUP BY role').all();
  const pendingKyc = db.prepare("SELECT id, name, role, kyc_status FROM users WHERE kyc_status = 'submitted'").all();
  const recentShipments = db.prepare('SELECT * FROM shipments ORDER BY id DESC LIMIT 20').all();
  send(res, 200, { activeShipments, totalEscrow, usersByRole, pendingKyc, recentShipments });
});

// ---------- static file serving ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (!STATIC_WHITELIST.has(urlPath)) return send(res, 404, { error: 'not found' });
  const filePath = path.join(PUBLIC_DIR, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- main server ----------
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/api/')) {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const match = r.regex.exec(urlPath);
      if (!match) continue;
      const params = {};
      r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
      try {
        await r.handler(req, res, params);
      } catch (e) {
        console.error(e);
        send(res, 500, { error: 'خطأ في الخادم' });
      }
      return;
    }
    return send(res, 404, { error: 'مسار غير موجود' });
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`✅ Ala Tareeqak server running at http://localhost:${PORT}`);
});
