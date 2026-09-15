// db.js — SQLite database layer for Ala Tareeqak (على طريقك)
// Uses Node's built-in `node:sqlite` module — no npm install required.
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

// DATA_DIR lets a persistent volume (e.g. on Railway) survive redeploys.
// Falls back to the project folder for local runs.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'data.db');
const db = new DatabaseSync(DB_PATH);

const SCHEMA_VERSION = 2;
const currentVersion = db.prepare('PRAGMA user_version').get().user_version;

if (currentVersion < SCHEMA_VERSION) {
  // Prototype-stage migration: this app has only ever held demo/test data,
  // so we rebuild the schema cleanly rather than hand-writing ALTERs for
  // every past version. Swap this for real migrations once there's
  // production data worth preserving.
  db.exec(`
    DROP TABLE IF EXISTS wallet_transactions;
    DROP TABLE IF EXISTS ratings;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS disputes;
    DROP TABLE IF EXISTS escrow;
    DROP TABLE IF EXISTS offers;
    DROP TABLE IF EXISTS shipments;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
  `);
}

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('merchant','driver','agent','admin')),
    city TEXT,
    truck_type TEXT,
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    rating_sum REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    trips_count INTEGER DEFAULT 0,
    wallet_balance REAL DEFAULT 0,
    kyc_status TEXT DEFAULT 'pending' CHECK(kyc_status IN ('pending','submitted','verified','rejected')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    merchant_id INTEGER NOT NULL,
    pickup_location TEXT NOT NULL,
    dropoff_location TEXT NOT NULL,
    cargo_type TEXT NOT NULL DEFAULT 'مواد بناء',
    cargo_desc TEXT NOT NULL,
    truck_type TEXT NOT NULL DEFAULT 'مسطحة',
    weight_tons REAL NOT NULL,
    proposed_price REAL NOT NULL,
    agreed_price REAL,
    accepted_offer_id INTEGER,
    accepted_driver_id INTEGER,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK(status IN ('open','offer_accepted','escrow_pending','escrow_confirmed','in_transit','disputed','delivered','cancelled')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(merchant_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL,
    driver_id INTEGER NOT NULL,
    price REAL NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(shipment_id) REFERENCES shipments(id),
    FOREIGN KEY(driver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS escrow (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'agent' CHECK(method IN ('agent','wallet')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','frozen','released','refunded')),
    agent_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    confirmed_at TEXT,
    released_at TEXT,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id),
    FOREIGN KEY(agent_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL,
    opened_by INTEGER NOT NULL,
    issue_type TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved_merchant','resolved_driver','dismissed')),
    resolution_note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id),
    FOREIGN KEY(opened_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    blocked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(shipment_id) REFERENCES shipments(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL,
    rater_id INTEGER NOT NULL,
    ratee_id INTEGER NOT NULL,
    stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(shipment_id, rater_id),
    FOREIGN KEY(shipment_id) REFERENCES shipments(id)
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    ref TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

// ---- password hashing (scrypt, built into Node — no deps) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}
function genCode(prefix) {
  const n = crypto.randomInt(1000, 9999);
  return `${prefix}-${n}`;
}
function genReferralCode(name) {
  const letters = (name || 'USR').replace(/\s/g, '').slice(0, 3).toUpperCase();
  return `${letters}${crypto.randomInt(1000, 9999)}`;
}

// Driver tier badge — mirrors the reference UI's 💎/🥇/🆕 badges.
// Pure function of stated trip/rating numbers, computed on read (not stored).
function driverTier(trips_count, rating_avg) {
  if (trips_count >= 100 && rating_avg >= 4.5) return { label: 'بلاتيني', emoji: '💎' };
  if (trips_count >= 30 && rating_avg >= 4.0) return { label: 'ذهبي', emoji: '🥇' };
  if (trips_count > 0) return { label: 'موثّق', emoji: '✅' };
  return { label: 'جديد', emoji: '🆕' };
}

// Anti-circumvention message filter: blocks phone numbers and common
// "contact me off-platform" patterns, same spirit as the reference UI's
// "🚫 رسالة محظورة" behavior.
const PHONE_PATTERN = /(\+?\d[\d\s\-().]{6,}\d)/; // 8+ digit sequences w/ separators
const CONTACT_WORDS = /(واتس ?اب|whatsapp|imo|تلغرام|telegram|فيسبوك|facebook|instagram|انستقرام)/i;
function messageViolatesPolicy(content) {
  return PHONE_PATTERN.test(content) || CONTACT_WORDS.test(content);
}

// ---- seed demo data on first run ----
function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (name, phone, password_hash, password_salt, role, city, truck_type, referral_code, rating_sum, rating_count, trips_count, wallet_balance, kyc_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const demoUsers = [
    ['سالم ترهوني', '0910000001', 'demo123', 'merchant', 'طرابلس', null, 4.9, 12, 0, 1240, 'verified'],
    ['خالد المصراتي', '0910000002', 'demo123', 'driver', 'بنغازي', 'مسطحة', 4.8, 134, 134, 0, 'verified'],
    ['عمر سالم', '0910000003', 'demo123', 'driver', 'مصراتة', 'مسطحة', 4.5, 62, 62, 0, 'verified'],
    ['يوسف بشير', '0910000006', 'demo123', 'driver', 'طرابلس', 'مسطحة', 5.0, 2, 2, 0, 'verified'],
    ['وكيل سوق الجمعة', '0910000004', 'demo123', 'agent', 'طرابلس', null, 5.0, 0, 0, 0, 'verified'],
    ['مدير النظام', '0910000005', 'demo123', 'admin', 'طرابلس', null, 5.0, 0, 0, 0, 'verified'],
  ];

  for (const [name, phone, pw, role, city, truck_type, ratingAvg, ratingCount, trips, balance, kyc] of demoUsers) {
    const { hash, salt } = hashPassword(pw);
    insertUser.run(name, phone, hash, salt, role, city, truck_type, genReferralCode(name), ratingAvg * ratingCount, ratingCount, trips, balance, kyc);
  }

  // A few historical delivered shipments on the same route so the
  // "smart pricing" hint has real data to average from.
  const merchant = db.prepare('SELECT id FROM users WHERE phone = ?').get('0910000001');
  const pastPrices = [2400, 2650, 2900, 3100];
  for (const price of pastPrices) {
    db.prepare(`
      INSERT INTO shipments (code, merchant_id, pickup_location, dropoff_location, cargo_type, cargo_desc, truck_type, weight_tons, proposed_price, agreed_price, status)
      VALUES (?, ?, 'طرابلس — خلف مصنع الأسمنت', 'بنغازي — ميناء بنغازي التجاري', 'مواد بناء', 'مواد بناء', 'مسطحة', 20, ?, ?, 'delivered')
    `).run(genCode('SH'), merchant.id, price, price);
  }

  // one open demo shipment
  db.prepare(`
    INSERT INTO shipments (code, merchant_id, pickup_location, dropoff_location, cargo_type, cargo_desc, truck_type, weight_tons, proposed_price, status)
    VALUES (?, ?, 'طرابلس — خلف مصنع الأسمنت', 'بنغازي — ميناء بنغازي التجاري', 'مواد بناء', 'مواد بناء', 'مسطحة', 20, 2800, 'open')
  `).run(genCode('SH'), merchant.id);
}
seedIfEmpty();

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  genToken,
  genCode,
  genReferralCode,
  driverTier,
  messageViolatesPolicy,
};
