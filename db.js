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
    rating REAL DEFAULT 5.0,
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
    cargo_desc TEXT NOT NULL,
    weight_tons REAL NOT NULL,
    proposed_price REAL NOT NULL,
    agreed_price REAL,
    accepted_offer_id INTEGER,
    accepted_driver_id INTEGER,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK(status IN ('open','offer_accepted','escrow_pending','escrow_confirmed','in_transit','delivered','cancelled')),
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
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','released','refunded')),
    agent_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    confirmed_at TEXT,
    released_at TEXT,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id),
    FOREIGN KEY(agent_id) REFERENCES users(id)
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

// ---- seed demo data on first run ----
function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (name, phone, password_hash, password_salt, role, city, rating, trips_count, wallet_balance, kyc_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const demoUsers = [
    ['سالم ترهوني', '0910000001', 'demo123', 'merchant', 'طرابلس', 5.0, 0, 1240, 'verified'],
    ['خالد المصراتي', '0910000002', 'demo123', 'driver', 'بنغازي', 4.8, 134, 0, 'verified'],
    ['عمر سالم', '0910000003', 'demo123', 'driver', 'مصراتة', 4.5, 62, 0, 'verified'],
    ['وكيل سوق الجمعة', '0910000004', 'demo123', 'agent', 'طرابلس', 5.0, 0, 0, 'verified'],
    ['مدير النظام', '0910000005', 'demo123', 'admin', 'طرابلس', 5.0, 0, 0, 'verified'],
  ];

  for (const [name, phone, pw, role, city, rating, trips, balance, kyc] of demoUsers) {
    const { hash, salt } = hashPassword(pw);
    insertUser.run(name, phone, hash, salt, role, city, rating, trips, balance, kyc);
  }

  // one open demo shipment from the merchant
  const merchant = db.prepare('SELECT id FROM users WHERE phone = ?').get('0910000001');
  db.prepare(`
    INSERT INTO shipments (code, merchant_id, pickup_location, dropoff_location, cargo_desc, weight_tons, proposed_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(genCode('SH'), merchant.id, 'طرابلس — مصنع الأسمنت', 'بنغازي — الميناء التجاري', 'مواد بناء', 20, 2800);
}
seedIfEmpty();

module.exports = { db, hashPassword, verifyPassword, genToken, genCode };
