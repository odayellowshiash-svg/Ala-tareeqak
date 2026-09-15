// app.js — vanilla JS SPA for Ala Tareeqak. No build step, no framework.
'use strict';

const state = {
  token: localStorage.getItem('at_token') || null,
  user: JSON.parse(localStorage.getItem('at_user') || 'null'),
  tab: 'home',
};

const root = document.getElementById('app');

// ---------- API helper ----------
async function api(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function setAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('at_token', token);
  localStorage.setItem('at_user', JSON.stringify(user));
}
function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('at_token');
  localStorage.removeItem('at_user');
  render();
}

const STATUS_LABEL = {
  open: ['مفتوح', 'warn'],
  offer_accepted: ['تم قبول عرض', 'warn'],
  escrow_pending: ['بانتظار الضمان', 'warn'],
  escrow_confirmed: ['تم تأكيد الضمان', 'success'],
  in_transit: ['في الطريق', 'warn'],
  delivered: ['تم التسليم', 'success'],
  cancelled: ['ملغي', 'alert'],
};
function statusChip(status) {
  const [label, cls] = STATUS_LABEL[status] || [status, ''];
  return `<span class="chip ${cls}">${label}</span>`;
}

// ---------- top bar ----------
function topbar() {
  if (!state.user) return '';
  const roleLabel = { merchant: 'تاجر', driver: 'سائق', agent: 'وكيل كاش', admin: 'مدير' }[state.user.role];
  return `
    <div class="topbar">
      <div class="brand"><span class="brand-icon">🚚</span> على طريقك</div>
      <div class="user-chip">
        <span>${state.user.name} <span class="role-pill">${roleLabel}</span></span>
        <button class="btn btn-outline btn-sm" onclick="logout()">خروج</button>
      </div>
    </div>`;
}

// ---------- LOGIN / REGISTER ----------
function loginView() {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="center" style="margin-bottom:20px;">
        <div style="font-size:36px;">🚚</div>
        <h1>على طريقك</h1>
        <p class="muted">Ala Tareeqak — منصة مطابقة الشحن</p>
      </div>
      <div class="card">
        <div class="tabs">
          <div class="tab active" id="tab-login" onclick="showAuthForm('login')">تسجيل الدخول</div>
          <div class="tab" id="tab-register" onclick="showAuthForm('register')">حساب جديد</div>
        </div>
        <div id="auth-form"></div>
      </div>
      <p class="muted center" style="margin-top:14px;">
        حسابات تجريبية: تاجر 0910000001 · سائق 0910000002 · وكيل 0910000004 · مدير 0910000005 — كلمة المرور: demo123
      </p>
    </div>`;
  showAuthForm('login');
}

function showAuthForm(kind) {
  document.getElementById('tab-login').classList.toggle('active', kind === 'login');
  document.getElementById('tab-register').classList.toggle('active', kind === 'register');
  const el = document.getElementById('auth-form');
  if (kind === 'login') {
    el.innerHTML = `
      <div class="field"><label>رقم الهاتف</label><input id="li-phone" placeholder="0910000001"></div>
      <div class="field"><label>كلمة المرور</label><input id="li-pass" type="password" placeholder="••••••••"></div>
      <button class="btn btn-primary" style="width:100%" onclick="doLogin()">دخول</button>
      <p id="auth-err" class="muted" style="color:var(--status-alert); margin-top:8px;"></p>`;
  } else {
    el.innerHTML = `
      <div class="field"><label>الاسم الكامل</label><input id="re-name"></div>
      <div class="field"><label>رقم الهاتف</label><input id="re-phone"></div>
      <div class="field"><label>المدينة</label><input id="re-city"></div>
      <div class="field"><label>الدور</label>
        <select id="re-role">
          <option value="merchant">تاجر</option>
          <option value="driver">سائق</option>
          <option value="agent">وكيل كاش</option>
        </select>
      </div>
      <div class="field"><label>كلمة المرور</label><input id="re-pass" type="password"></div>
      <button class="btn btn-primary" style="width:100%" onclick="doRegister()">إنشاء الحساب</button>
      <p id="auth-err" class="muted" style="color:var(--status-alert); margin-top:8px;"></p>`;
  }
}

async function doLogin() {
  const phone = document.getElementById('li-phone').value.trim();
  const password = document.getElementById('li-pass').value;
  try {
    const { token, user } = await api('POST', '/api/auth/login', { phone, password });
    setAuth(token, user);
    render();
  } catch (e) {
    document.getElementById('auth-err').textContent = e.message;
  }
}
async function doRegister() {
  const name = document.getElementById('re-name').value.trim();
  const phone = document.getElementById('re-phone').value.trim();
  const city = document.getElementById('re-city').value.trim();
  const role = document.getElementById('re-role').value;
  const password = document.getElementById('re-pass').value;
  try {
    const { token, user } = await api('POST', '/api/auth/register', { name, phone, city, role, password });
    setAuth(token, user);
    render();
  } catch (e) {
    document.getElementById('auth-err').textContent = e.message;
  }
}

// ---------- MERCHANT ----------
async function merchantView() {
  const { shipments } = await api('GET', '/api/shipments');
  root.innerHTML = topbar() + `
    <div class="row" style="margin-bottom:14px;">
      <h2>شحناتي</h2>
      <button class="btn btn-primary" onclick="showNewShipmentForm()">+ نشر طلب شحن</button>
    </div>
    <div id="new-shipment-form"></div>
    <div id="shipment-list">${shipments.map(merchantShipmentCard).join('') || '<p class="muted">لا توجد شحنات بعد.</p>'}</div>
  `;
}
function merchantShipmentCard(s) {
  return `
    <div class="card">
      <div class="row">
        <span class="mono">${s.code}</span>
        ${statusChip(s.status)}
      </div>
      <div style="margin:8px 0; font-size:14px;">${s.pickup_location} ← ${s.dropoff_location} · ${s.weight_tons} طن</div>
      <div class="row">
        <span class="mono" style="color:var(--brand-amber); font-weight:700;">${s.proposed_price} د.ل</span>
        <button class="btn btn-outline btn-sm" onclick="openShipmentDetail(${s.id})">التفاصيل</button>
      </div>
    </div>`;
}
function showNewShipmentForm() {
  document.getElementById('new-shipment-form').innerHTML = `
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>موقع التحميل</label><input id="ns-pickup"></div>
        <div class="field"><label>موقع التسليم</label><input id="ns-dropoff"></div>
      </div>
      <div class="field"><label>وصف البضاعة</label><input id="ns-cargo"></div>
      <div class="grid-2">
        <div class="field"><label>الوزن (طن)</label><input id="ns-weight" type="number"></div>
        <div class="field"><label>السعر المقترح (د.ل)</label><input id="ns-price" type="number"></div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="createShipment()">نشر الطلب</button>
    </div>`;
}
async function createShipment() {
  try {
    await api('POST', '/api/shipments', {
      pickup_location: document.getElementById('ns-pickup').value,
      dropoff_location: document.getElementById('ns-dropoff').value,
      cargo_desc: document.getElementById('ns-cargo').value,
      weight_tons: Number(document.getElementById('ns-weight').value),
      proposed_price: Number(document.getElementById('ns-price').value),
    });
    toast('تم نشر الطلب بنجاح');
    merchantView();
  } catch (e) { toast(e.message); }
}

async function openShipmentDetail(id) {
  const { shipment, offers, escrow } = await api('GET', `/api/shipments/${id}`);
  const isMerchant = state.user.role === 'merchant';
  const isDriverParty = state.user.id === shipment.accepted_driver_id;
  root.innerHTML = topbar() + `
    <button class="btn btn-outline btn-sm" onclick="goHome()">→ رجوع</button>
    <div class="card" style="margin-top:12px;">
      <div class="row"><span class="mono">${shipment.code}</span>${statusChip(shipment.status)}</div>
      <div style="margin:8px 0;">${shipment.pickup_location} ← ${shipment.dropoff_location}</div>
      <div class="muted">${shipment.cargo_desc} · ${shipment.weight_tons} طن</div>
      <div class="mono" style="margin-top:8px; color:var(--brand-amber); font-weight:700;">
        السعر ${shipment.agreed_price || shipment.proposed_price} د.ل
      </div>
    </div>

    ${escrow ? `
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">الضمان المالي</h3>
      <div class="row"><span class="muted">الحالة</span>${statusChip(escrow.status === 'confirmed' ? 'escrow_confirmed' : 'escrow_pending')}</div>
      ${escrow.status === 'pending' && isMerchant ? `
        <div class="center" style="margin-top:10px;">
          <p class="muted">أعط هذا الكود لأقرب وكيل كاش لإيداع المبلغ</p>
          <div class="mono" style="font-size:22px; font-weight:800; margin-top:6px;">${escrow.code}</div>
        </div>` : ''}
    </div>` : ''}

    ${shipment.status === 'open' && !isMerchant && state.user.role === 'driver' ? `
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">تقديم عرض</h3>
      <div class="field"><label>السعر (د.ل)</label><input id="offer-price" type="number"></div>
      <div class="field"><label>رسالة (اختياري)</label><input id="offer-msg"></div>
      <button class="btn btn-primary" style="width:100%" onclick="submitOffer(${shipment.id})">إرسال العرض</button>
    </div>` : ''}

    ${shipment.status === 'in_transit' && (isMerchant || isDriverParty) ? `
    <div class="card center">
      <p class="muted" style="margin-bottom:10px;">عند استلام البضاعة، أكّد التسليم لتحويل المبلغ للسائق.</p>
      <button class="btn btn-secondary" onclick="deliverShipment(${shipment.id})">تأكيد التسليم</button>
    </div>` : ''}

    ${isMerchant && shipment.status === 'open' ? `
    <h3 style="margin:16px 0 8px;">العروض (${offers.length})</h3>
    ${offers.map(o => `
      <div class="card">
        <div class="row">
          <div>
            <div style="font-weight:700;">${o.driver_name}</div>
            <div class="muted">⭐ ${o.driver_rating} · ${o.driver_trips} رحلة</div>
          </div>
          <span class="mono" style="font-weight:700;">${o.price} د.ل</span>
        </div>
        ${o.message ? `<p class="muted" style="margin-top:6px;">${o.message}</p>` : ''}
        <button class="btn btn-primary btn-sm" style="width:100%; margin-top:10px;" onclick="acceptOffer(${o.id}, ${shipment.id})">قبول العرض</button>
      </div>`).join('') || '<p class="muted">لا توجد عروض بعد.</p>'}
    ` : ''}
  `;
}
async function submitOffer(shipmentId) {
  try {
    await api('POST', `/api/shipments/${shipmentId}/offers`, {
      price: Number(document.getElementById('offer-price').value),
      message: document.getElementById('offer-msg').value,
    });
    toast('تم إرسال العرض');
    openShipmentDetail(shipmentId);
  } catch (e) { toast(e.message); }
}
async function acceptOffer(offerId, shipmentId) {
  try {
    await api('POST', `/api/offers/${offerId}/accept`);
    toast('تم قبول العرض — بانتظار إيداع الضمان');
    openShipmentDetail(shipmentId);
  } catch (e) { toast(e.message); }
}
async function deliverShipment(id) {
  try {
    await api('POST', `/api/shipments/${id}/deliver`);
    toast('تم تأكيد التسليم وتحويل المبلغ للسائق');
    openShipmentDetail(id);
  } catch (e) { toast(e.message); }
}
function goHome() { render(); }

// ---------- DRIVER ----------
async function driverView() {
  const { shipments } = await api('GET', '/api/shipments');
  root.innerHTML = topbar() + `
    <h2 style="margin-bottom:14px;">الشحنات المتاحة</h2>
    <div>${shipments.map(driverShipmentCard).join('') || '<p class="muted">لا توجد شحنات مفتوحة حالياً.</p>'}</div>
  `;
}
function driverShipmentCard(s) {
  return `
    <div class="card">
      <div class="row"><span class="mono">${s.code}</span>${statusChip(s.status)}</div>
      <div style="margin:8px 0;">${s.pickup_location} ← ${s.dropoff_location} · ${s.weight_tons} طن</div>
      <div class="row">
        <span class="mono" style="color:var(--brand-amber); font-weight:700;">${s.proposed_price} د.ل</span>
        <button class="btn btn-outline btn-sm" onclick="openShipmentDetail(${s.id})">عرض وتقديم عرض سعر</button>
      </div>
    </div>`;
}

// ---------- AGENT ----------
function agentView() {
  root.innerHTML = topbar() + `
    <h2 style="margin-bottom:14px;">استقبال الإيداع</h2>
    <div class="card">
      <div class="field"><label>كود الضمان (مثال MRC-4829)</label><input id="ag-code" placeholder="MRC-0000"></div>
      <button class="btn btn-primary" style="width:100%" onclick="lookupEscrow()">بحث</button>
    </div>
    <div id="agent-result"></div>
  `;
}
async function lookupEscrow() {
  const code = document.getElementById('ag-code').value.trim();
  try {
    const { escrow, shipment, merchant } = await api('GET', `/api/escrow/lookup/${code}`);
    document.getElementById('agent-result').innerHTML = `
      <div class="card">
        <div class="row"><span class="muted">التاجر</span><span>${merchant.name}</span></div>
        <div class="row"><span class="muted">الشحنة</span><span class="mono">${shipment.code}</span></div>
        <div class="row"><span class="muted">المبلغ</span><span class="mono" style="color:var(--status-success); font-weight:700;">${escrow.amount} د.ل</span></div>
        <div class="row" style="margin-top:6px;"><span class="muted">الحالة</span>${statusChip(escrow.status === 'confirmed' ? 'escrow_confirmed' : 'escrow_pending')}</div>
        ${escrow.status === 'pending' ? `<button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="confirmEscrow('${escrow.code}')">تأكيد استلام المبلغ</button>` : ''}
      </div>`;
  } catch (e) {
    document.getElementById('agent-result').innerHTML = `<p class="muted" style="color:var(--status-alert);">${e.message}</p>`;
  }
}
async function confirmEscrow(code) {
  try {
    await api('POST', `/api/escrow/${code}/confirm`);
    toast('تم تأكيد استلام المبلغ');
    agentView();
  } catch (e) { toast(e.message); }
}

// ---------- ADMIN ----------
async function adminView() {
  const data = await api('GET', '/api/admin/overview');
  root.innerHTML = topbar() + `
    <h2 style="margin-bottom:14px;">لوحة الإدارة</h2>
    <div class="grid-2">
      <div class="card"><div class="muted">شحنات نشطة</div><div class="mono" style="font-size:24px; font-weight:800;">${data.activeShipments}</div></div>
      <div class="card"><div class="muted">إجمالي الضمان القائم</div><div class="mono" style="font-size:24px; font-weight:800;">${data.totalEscrow.toFixed(2)} د.ل</div></div>
    </div>
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">المستخدمون حسب الدور</h3>
      ${data.usersByRole.map(r => `<div class="row"><span class="muted">${r.role}</span><span class="mono">${r.c}</span></div>`).join('')}
    </div>
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">توثيق بانتظار المراجعة (${data.pendingKyc.length})</h3>
      ${data.pendingKyc.map(u => `
        <div class="row" style="margin-bottom:6px;">
          <span>${u.name} <span class="muted">(${u.role})</span></span>
          <span>
            <button class="btn btn-primary btn-sm" onclick="reviewKyc(${u.id}, 'verified')">قبول</button>
            <button class="btn btn-danger btn-sm" onclick="reviewKyc(${u.id}, 'rejected')">رفض</button>
          </span>
        </div>`).join('') || '<p class="muted">لا يوجد طلبات معلقة.</p>'}
    </div>
    <h3 style="margin:16px 0 8px;">أحدث الشحنات</h3>
    ${data.recentShipments.map(s => `
      <div class="card">
        <div class="row"><span class="mono">${s.code}</span>${statusChip(s.status)}</div>
        <div class="muted" style="margin-top:4px;">${s.pickup_location} ← ${s.dropoff_location}</div>
      </div>`).join('')}
  `;
}
async function reviewKyc(userId, decision) {
  try {
    await api('POST', `/api/kyc/${userId}/review`, { decision });
    toast('تم تحديث حالة التوثيق');
    adminView();
  } catch (e) { toast(e.message); }
}

// ---------- ROUTER ----------
function render() {
  if (!state.user) return loginView();
  const map = { merchant: merchantView, driver: driverView, agent: agentView, admin: adminView };
  (map[state.user.role] || loginView)();
}

render();
