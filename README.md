# على طريقك — Ala Tareeqak (Working Prototype)

A real, running full-stack app: accounts, a SQLite database, and live orders —
not a mockup. Built with **zero npm dependencies** (Node's built-in `http`
server + Node's built-in `node:sqlite`), so it runs anywhere Node 22+ runs,
with no internet connection needed to install packages.

## Run it

```bash
node server.js
# → ✅ Ala Tareeqak server running at http://localhost:3000
```

Open `http://localhost:3000` in a browser. A `data.db` SQLite file is created
next to `server.js` on first run, pre-seeded with 5 demo accounts (password
`demo123` for all):

| Role | Phone |
|---|---|
| Merchant (تاجر) | 0910000001 |
| Driver (سائق) | 0910000002 |
| Driver 2 | 0910000003 |
| Cash agent (وكيل كاش) | 0910000004 |
| Admin | 0910000005 |

Delete `data.db` any time to reset to a clean seeded state.

## What's actually implemented (tested end-to-end)

- Real auth: registration, login, hashed passwords (scrypt), bearer-token sessions
- Merchant: post a shipment, review incoming driver offers, accept one
- Driver: browse open shipments, submit a price offer
- Escrow: accepting an offer generates a real deposit code; a cash agent looks
  it up and confirms receipt, which flips the shipment to "in transit"
- Delivery confirmation releases the agreed price into the driver's wallet
  (with a wallet transaction ledger)
- Admin dashboard: live counts, KYC review queue, recent shipments
- KYC status field per user (submit / verify / reject) — document upload
  itself is not wired up yet (see below)

## Deliberately out of scope for this pass

This mirrors the 5-role system in the prototype you sent, but a production
freight-matching platform is a large system — I built the core transactional
loop for real (shipment → offer → escrow → delivery → payout) rather than a
shallow layer over every screen. Not yet built:

- **Real payments** — escrow is tracked in the database as confirmed/pending,
  but no actual money movement (mobile money, bank rails) is connected
- **Document upload for KYC** (ID photos, driving license, truck manual) —
  the status field exists but there's no file storage yet
- **Live GPS tracking** of the truck en route
- **SMS/push notifications** to merchants and drivers
- **Route-matching algorithm** (currently drivers see *all* open shipments,
  not ones auto-scored against a declared return route)
- **Dispute resolution** flow for the admin panel
- **Rate limiting / production hardening** — sessions never expire, no
  HTTPS, no input sanitization beyond basic checks

## On the database

`node:sqlite` is still an experimental Node API (stable enough here, but
Node itself flags it that way). For a real production deployment — many
concurrent users, need for backups/replication — swap it for Postgres.
Because the code goes through a single `db.js` file with plain SQL, that
swap mainly means changing the driver, not the app logic.

## Suggested next step

Given [Mohammed already has a milestone-based contract](Ala Tareeqak spec)
for this build, this codebase is a good candidate to hand him as a working
reference implementation of the transactional core — he can extend it
(or port the logic to whatever stack the full spec calls for) rather than
starting the backend from zero.
