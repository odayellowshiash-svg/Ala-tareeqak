// app.js — vanilla JS SPA for Ala Tareeqak. No build step, no framework.
'use strict';

const state = {
  token: localStorage.getItem('at_token') || null,
  user: JSON.parse(localStorage.getItem('at_user') || 'null'),
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
  setTimeout(() => t.remove(), 2600);
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
  open: ['بانتظار عروض', 'warn'],
  offer_accepted: ['تم قبول عرض', 'warn'],
  escrow_pending: ['بانتظار الضمان', 'warn'],
  escrow_confirmed: ['تم تأكيد الضمان', 'success'],
  in_transit: ['في الطريق', 'indigo'],
  disputed: ['نزاع مفتوح', 'alert'],
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
        <div class="brand-icon" style="width:56px;height:56px;font-size:30px;margin:0 auto 10px;">🚚</div>
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
        <select id="re-role" onchange="document.getElementById('re-truck-wrap').classList.toggle('hidden', this.value !== 'driver')">
          <option value="merchant">تاجر</option>
          <option value="driver">سائق</option>
          <option value="agent">وكيل كاش</option>
        </select>
      </div>
      <div class="field hidden" id="re-truck-wrap">
        <label>نوع الشاحنة</label>
        <div class="chip-select" id="re-truck-chips">
          ${['مسطحة', 'مقفلة', 'مبردة'].map((t, i) => `<div class="chip-option ${i === 0 ? 'selected' : ''}" data-val="${t}" onclick="selectChip(this,'re-truck-chips')">${t}</div>`).join('')}
        </div>
      </div>
      <div class="field"><label>كود دعوة (اختياري)</label><input id="re-referral" placeholder="مثال: KHA4821"></div>
      <div class="field"><label>كلمة المرور</label><input id="re-pass" type="password"></div>
      <button class="btn btn-primary" style="width:100%" onclick="doRegister()">إنشاء الحساب</button>
      <p id="auth-err" class="muted" style="color:var(--status-alert); margin-top:8px;"></p>`;
  }
}
function selectChip(el, containerId) {
  document.querySelectorAll(`#${containerId} .chip-option`).forEach((c) => c.classList.remove('selected'));
  el.classList.add('selected');
}
function chipValue(containerId) {
  const sel = document.querySelector(`#${containerId} .chip-option.selected`);
  return sel ? sel.dataset.val : null;
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
  const truck_type = role === 'driver' ? chipValue('re-truck-chips') : null;
  const referred_by = document.getElementById('re-referral').value.trim() || null;
  const password = document.getElementById('re-pass').value;
  try {
    const { token, user } = await api('POST', '/api/auth/register', { name, phone, city, role, truck_type, referred_by, password });
    setAuth(token, user);
    render();
  } catch (e) {
    document.getElementById('auth-err').textContent = e.message;
  }
}

// ---------- MERCHANT ----------
async function merchantView() {
  const { shipments } = await api('GET', '/api/shipments');
  const { balance, referral_code } = await api('GET', '/api/wallet');
  const active = shipments.filter((s) => !['delivered', 'cancelled'].includes(s.status));
  const past = shipments.filter((s) => ['delivered', 'cancelled'].includes(s.status));

  root.innerHTML = topbar() + `
    <div class="card card-banner">
      <div class="row">
        <div>
          <div style="font-size:11px; opacity:0.85;">رصيد المحفظة</div>
          <div class="mono" style="font-size:24px; font-weight:800;">${balance.toFixed(2)} <span style="font-size:12px;">د.ل</span></div>
        </div>
        <button class="btn btn-primary btn-sm">＋ إيداع</button>
      </div>
    </div>
    <div class="card card-banner gold">
      <div style="font-weight:800; font-size:13px;">🎉 عمولة 0% لأول رحلتين لكل سائق تدعوه</div>
      <div class="row" style="margin-top:8px;">
        <span class="mono" style="font-size:15px; font-weight:800;">${referral_code}</span>
        <button class="btn btn-outline btn-sm" onclick="navigator.clipboard && navigator.clipboard.writeText('${referral_code}'); toast('تم نسخ الكود')">نسخ الكود</button>
      </div>
    </div>

    <div class="row" style="margin-bottom:14px;">
      <h2>شحناتي</h2>
      <button class="btn btn-primary" onclick="showNewShipmentForm()">＋ نشر طلب شحن</button>
    </div>
    <div id="new-shipment-form"></div>
    <div>${active.map(merchantShipmentCard).join('') || '<p class="muted">لا توجد شحنات نشطة.</p>'}</div>
    ${past.length ? `<h3 style="margin:16px 0 8px;">السجل</h3>${past.map(merchantShipmentCard).join('')}` : ''}
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
        <span class="mono" style="color:var(--amber-dark); font-weight:700;">${s.agreed_price || s.proposed_price} د.ل</span>
        <button class="btn btn-outline btn-sm" onclick="openShipmentDetail(${s.id})">التفاصيل</button>
      </div>
    </div>`;
}
function showNewShipmentForm() {
  document.getElementById('new-shipment-form').innerHTML = `
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>موقع التحميل</label><input id="ns-pickup" oninput="fetchPricingHint()"></div>
        <div class="field"><label>موقع التسليم</label><input id="ns-dropoff" oninput="fetchPricingHint()"></div>
      </div>
      <div class="field"><label>وصف البضاعة</label><input id="ns-cargo"></div>
      <div class="field"><label>نوع البضاعة</label>
        <div class="chip-select" id="ns-cargo-type-chips">
          ${['مواد بناء', 'أثاث', 'مواد غذائية'].map((t, i) => `<div class="chip-option ${i === 0 ? 'selected' : ''}" data-val="${t}" onclick="selectChip(this,'ns-cargo-type-chips')">${t}</div>`).join('')}
        </div>
      </div>
      <div class="field"><label>نوع الشاحنة المطلوب</label>
        <div class="chip-select" id="ns-truck-chips">
          ${['مسطحة', 'مقفلة', 'مبردة'].map((t, i) => `<div class="chip-option ${i === 0 ? 'selected' : ''}" data-val="${t}" onclick="selectChip(this,'ns-truck-chips')">${t}</div>`).join('')}
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>الوزن (طن)</label><input id="ns-weight" type="number"></div>
        <div class="field"><label>السعر المقترح (د.ل)</label><input id="ns-price" type="number"></div>
      </div>
      <div id="pricing-hint"></div>
      <button class="btn btn-primary" style="width:100%" onclick="createShipment()">نشر الطلب</button>
    </div>`;
}
let pricingHintTimer = null;
function fetchPricingHint() {
  clearTimeout(pricingHintTimer);
  pricingHintTimer = setTimeout(async () => {
    const pickup = document.getElementById('ns-pickup').value.trim();
    const dropoff = document.getElementById('ns-dropoff').value.trim();
    const hintEl = document.getElementById('pricing-hint');
    if (!pickup || !dropoff) { hintEl.innerHTML = ''; return; }
    try {
      const data = await api('GET', `/api/pricing-hint?pickup=${encodeURIComponent(pickup)}&dropoff=${encodeURIComponent(dropoff)}`);
      hintEl.innerHTML = data.available
        ? `<div class="hint-box">💡 الأسعار المعتادة على هذا المسار: ${data.min} – ${data.max} د.ل (بناءً على ${data.count} رحلة سابقة)</div>`
        : '';
    } catch (e) { /* silent */ }
  }, 400);
}
async function createShipment() {
  try {
    await api('POST', '/api/shipments', {
      pickup_location: document.getElementById('ns-pickup').value,
      dropoff_location: document.getElementById('ns-dropoff').value,
      cargo_desc: document.getElementById('ns-cargo').value,
      cargo_type: chipValue('ns-cargo-type-chips'),
      truck_type: chipValue('ns-truck-chips'),
      weight_tons: Number(document.getElementById('ns-weight').value),
      proposed_price: Number(document.getElementById('ns-price').value),
    });
    toast('تم نشر الطلب بنجاح');
    merchantView();
  } catch (e) { toast(e.message); }
}

async function openShipmentDetail(id) {
  const { shipment, offers, escrow, dispute, rated } = await api('GET', `/api/shipments/${id}`);
  const isMerchant = state.user.role === 'merchant';
  const isDriverParty = state.user.id === shipment.accepted_driver_id;
  const isPartyToChat = isMerchant ? state.user.id === shipment.merchant_id : isDriverParty;

  root.innerHTML = topbar() + `
    <button class="btn btn-outline btn-sm" onclick="goHome()">→ رجوع</button>
    <div class="card" style="margin-top:12px;">
      <div class="row"><span class="mono">${shipment.code}</span>${statusChip(shipment.status)}</div>
      <div style="margin:8px 0;">${shipment.pickup_location} ← ${shipment.dropoff_location}</div>
      <div class="muted">${shipment.cargo_type} · ${shipment.truck_type} · ${shipment.weight_tons} طن</div>
      <div class="mono" style="margin-top:8px; color:var(--amber-dark); font-weight:700;">
        ${shipment.agreed_price || shipment.proposed_price} د.ل
      </div>
    </div>

    ${['escrow_pending','escrow_confirmed','in_transit','disputed','delivered'].includes(shipment.status) ? trackingTimeline(shipment) : ''}

    ${dispute ? `
    <div class="card" style="border-color: var(--status-alert);">
      <div class="row"><strong style="color:var(--status-alert);">⚠ نزاع مفتوح</strong><span class="chip alert">${dispute.issue_type}</span></div>
      <p class="muted" style="margin-top:6px;">${dispute.description}</p>
      ${state.user.role === 'admin' ? `
        <div class="row" style="margin-top:10px; gap:6px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="resolveDispute(${dispute.id}, 'merchant')">لصالح التاجر (استرداد)</button>
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="resolveDispute(${dispute.id}, 'driver')">لصالح السائق (صرف)</button>
        </div>` : `<p class="muted" style="margin-top:6px;">الضمان مجمّد حتى يراجع الإدارة الحالة — عادة خلال 24 ساعة.</p>`}
    </div>` : ''}

    ${escrow ? `
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">الضمان المالي</h3>
      <div class="row"><span class="muted">الحالة</span>${statusChip(escrow.status === 'confirmed' ? 'escrow_confirmed' : escrow.status === 'frozen' ? 'disputed' : 'escrow_pending')}</div>
      ${escrow.status === 'pending' && isMerchant ? `
        <div class="center" style="margin-top:10px;">
          <p class="muted">أعط هذا الكود لأقرب وكيل كاش لإيداع المبلغ</p>
          <div class="mono" style="font-size:22px; font-weight:800; margin-top:6px;">${escrow.code}</div>
          <div class="hint-box" style="margin-top:10px; text-align:right;">
            💳 محافظ رقمية (موبي كاش، سداد، إدفعلي) — متاحة قريباً خلف واجهة موحّدة
          </div>
        </div>` : ''}
    </div>` : ''}

    ${shipment.status === 'open' && !isMerchant && state.user.role === 'driver' ? `
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">تقديم عرض</h3>
      <div class="field"><label>السعر (د.ل)</label><input id="offer-price" type="number"></div>
      <div class="field"><label>رسالة (اختياري)</label><input id="offer-msg"></div>
      <button class="btn btn-primary" style="width:100%" onclick="submitOffer(${shipment.id})">إرسال العرض</button>
    </div>` : ''}

    ${['in_transit'].includes(shipment.status) && isPartyToChat ? chatBox(shipment.id) : ''}

    ${shipment.status === 'in_transit' && (isMerchant || isDriverParty) ? `
    <div class="card center">
      <p class="muted" style="margin-bottom:10px;">عند استلام البضاعة، أكّد التسليم لتحويل المبلغ للسائق.</p>
      <div class="row" style="gap:6px;">
        <button class="btn btn-secondary" style="flex:1;" onclick="deliverShipment(${shipment.id})">تأكيد التسليم</button>
        <button class="btn btn-outline" style="flex:1;" onclick="showDisputeForm(${shipment.id})">🚩 فتح نزاع</button>
      </div>
    </div>
    <div id="dispute-form"></div>` : ''}

    ${shipment.status === 'delivered' && !rated && (isMerchant || isDriverParty) ? ratingBox(shipment.id) : ''}

    ${isMerchant && shipment.status === 'open' ? `
    <h3 style="margin:16px 0 8px;">العروض (${offers.length})</h3>
    🔒 <span class="muted">رقم هاتف السائق يظهر بعد تأكيد الطلب وإيداع الضمان</span>
    ${offers.map((o) => `
      <div class="card">
        <div class="row">
          <div>
            <div style="font-weight:700;">${o.driver_name} <span class="badge-tier">${o.tier_emoji} ${o.tier}</span></div>
            <div class="muted">⭐ ${o.driver_rating} · ${o.driver_trips} رحلة</div>
          </div>
          <span class="mono" style="font-weight:700;">${o.price} د.ل</span>
        </div>
        ${o.message ? `<p class="muted" style="margin-top:6px;">${o.message}</p>` : ''}
        <button class="btn btn-primary btn-sm" style="width:100%; margin-top:10px;" onclick="acceptOffer(${o.id}, ${shipment.id})">اختيار هذا العرض</button>
      </div>`).join('') || '<p class="muted">📭 لسه ما وصلت عروض — عادة أول عرض يوصل خلال ساعات قليلة.</p>'}
    ` : ''}
  `;
}

function trackingTimeline(shipment) {
  const steps = [
    { key: 'escrow_pending', label: 'تأكيد الطلب والضمان' },
    { key: 'in_transit', label: 'التحميل والانطلاق' },
    { key: 'delivered', label: 'التسليم' },
  ];
  const order = ['escrow_pending', 'escrow_confirmed', 'in_transit', 'disputed', 'delivered'];
  const currentIdx = order.indexOf(shipment.status);
  return `
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:12px;">مسار الشحنة</h3>
      <div class="timeline">
        ${steps.map((s, i) => {
          const stepIdx = order.indexOf(s.key === 'in_transit' ? 'in_transit' : s.key);
          const done = currentIdx > stepIdx || shipment.status === 'delivered';
          const active = shipment.status === s.key || (s.key === 'in_transit' && shipment.status === 'disputed');
          return `<div class="timeline-step ${done && s.key !== 'delivered' ? 'done' : ''} ${active ? 'active' : ''} ${shipment.status === 'delivered' ? 'done' : ''}">
            <div class="t">${s.label}</div>
            <div class="d">${active ? 'الحالة الحالية' : done ? 'مكتمل' : 'قادم'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function chatBox(shipmentId) {
  return `
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">🔓 المحادثة</h3>
      <div class="chat-box" id="chat-box">جارِ التحميل...</div>
      <div class="chat-input-row">
        <input id="chat-input" placeholder="اكتب رسالة...">
        <button class="btn btn-primary btn-sm" onclick="sendMessage(${shipmentId})">إرسال</button>
      </div>
      <p class="muted" style="margin-top:6px; font-size:11px;">🚫 مشاركة أرقام الهواتف أو روابط التواصل خارج المنصة غير مسموحة</p>
    </div>
    <script>loadMessages(${shipmentId})</script>
  `;
}
async function loadMessages(shipmentId) {
  try {
    const { messages } = await api('GET', `/api/shipments/${shipmentId}/messages`);
    const box = document.getElementById('chat-box');
    if (!box) return;
    box.innerHTML = messages.map((m) => `
      <div class="chat-msg ${m.sender_id === state.user.id ? 'mine' : 'theirs'}">${m.content}</div>
    `).join('') || '<p class="muted" style="text-align:center;">لا توجد رسائل بعد</p>';
    box.scrollTop = box.scrollHeight;
  } catch (e) { /* ignore */ }
}
async function sendMessage(shipmentId) {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;
  try {
    await api('POST', `/api/shipments/${shipmentId}/messages`, { content });
    input.value = '';
    loadMessages(shipmentId);
  } catch (e) {
    toast(e.message);
  }
}

function showDisputeForm(shipmentId) {
  document.getElementById('dispute-form').innerHTML = `
    <div class="card">
      <h3 style="font-size:14px; margin-bottom:8px;">الإبلاغ عن مشكلة</h3>
      <div class="field"><label>نوع المشكلة</label>
        <div class="chip-select" id="dp-type-chips">
          ${['بضاعة تالفة', 'نقص في الكمية', 'تأخير في التسليم'].map((t, i) => `<div class="chip-option ${i === 0 ? 'selected' : ''}" data-val="${t}" onclick="selectChip(this,'dp-type-chips')">${t}</div>`).join('')}
        </div>
      </div>
      <div class="field"><label>الوصف</label><textarea id="dp-desc" rows="3"></textarea></div>
      <div class="hint-box">🔒 الضمان يُجمّد فوراً فور فتح النزاع، والطرف الآخر لديه 24 ساعة للرد</div>
      <button class="btn btn-danger" style="width:100%" onclick="openDispute(${shipmentId})">إرسال البلاغ</button>
    </div>`;
}
async function openDispute(shipmentId) {
  try {
    await api('POST', `/api/shipments/${shipmentId}/disputes`, {
      issue_type: chipValue('dp-type-chips'),
      description: document.getElementById('dp-desc').value,
    });
    toast('تم فتح النزاع — الضمان مجمّد الآن');
    openShipmentDetail(shipmentId);
  } catch (e) { toast(e.message); }
}
async function resolveDispute(disputeId, favor) {
  try {
    await api('POST', `/api/disputes/${disputeId}/resolve`, { favor });
    toast('تم حل النزاع');
    adminView();
  } catch (e) { toast(e.message); }
}

function ratingBox(shipmentId) {
  return `
    <div class="card center" id="rating-box">
      <h3 style="font-size:14px; margin-bottom:4px;">قيّم رحلتك</h3>
      <div class="stars" id="stars">
        ${[1,2,3,4,5].map((n) => `<span class="star" data-n="${n}" onclick="setStars(${n})">★</span>`).join('')}
      </div>
      <div class="field"><textarea id="rating-comment" rows="2" placeholder="تعليق (اختياري)"></textarea></div>
      <button class="btn btn-primary" style="width:100%" onclick="submitRating(${shipmentId})">إرسال التقييم</button>
    </div>`;
}
let selectedStars = 0;
function setStars(n) {
  selectedStars = n;
  document.querySelectorAll('#stars .star').forEach((s) => s.classList.toggle('filled', Number(s.dataset.n) <= n));
}
async function submitRating(shipmentId) {
  if (!selectedStars) return toast('اختر عدد النجوم');
  try {
    await api('POST', `/api/shipments/${shipmentId}/rate`, { stars: selectedStars, comment: document.getElementById('rating-comment').value });
    toast('شكراً على تقييمك');
    selectedStars = 0;
    openShipmentDetail(shipmentId);
  } catch (e) { toast(e.message); }
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
    toast('تم اختيار العرض — بانتظار إيداع الضمان');
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
  const open = shipments.filter((s) => s.status === 'open');
  const mine = shipments.filter((s) => s.status !== 'open');
  root.innerHTML = topbar() + `
    ${mine.length ? `<h2 style="margin-bottom:10px;">رحلاتي</h2>${mine.map(driverShipmentCard).join('')}` : ''}
    <h2 style="margin:14px 0;">الشحنات المتاحة على مسارك</h2>
    <div>${open.map(driverShipmentCard).join('') || '<p class="muted">لا توجد شحنات مفتوحة حالياً.</p>'}</div>
  `;
}
function driverShipmentCard(s) {
  return `
    <div class="card">
      <div class="row"><span class="mono">${s.code}</span>${statusChip(s.status)}</div>
      <div style="margin:8px 0;">${s.pickup_location} ← ${s.dropoff_location} · ${s.weight_tons} طن</div>
      <div class="row">
        <span class="mono" style="color:var(--amber-dark); font-weight:700;">${s.agreed_price || s.proposed_price} د.ل</span>
        <button class="btn btn-outline btn-sm" onclick="openShipmentDetail(${s.id})">${s.status === 'open' ? 'عرض وتقديم عرض سعر' : 'التفاصيل'}</button>
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
  const { disputes } = await api('GET', '/api/admin/disputes');
  root.innerHTML = topbar() + `
    <h2 style="margin-bottom:14px;">لوحة الإدارة</h2>
    <div class="grid-2">
      <div class="card"><div class="muted">شحنات نشطة</div><div class="mono" style="font-size:22px; font-weight:800;">${data.activeShipments}</div></div>
      <div class="card"><div class="muted">إجمالي الضمان القائم</div><div class="mono" style="font-size:22px; font-weight:800;">${data.totalEscrow.toFixed(2)} د.ل</div></div>
      <div class="card"><div class="muted">نزاعات مفتوحة</div><div class="mono" style="font-size:22px; font-weight:800; color:var(--status-alert);">${data.openDisputes}</div></div>
      <div class="card"><div class="muted">رسائل محظورة (محاولات تواصل خارجي)</div><div class="mono" style="font-size:22px; font-weight:800;">${data.blockedMessages}</div></div>
    </div>

    ${disputes.length ? `
    <h3 style="margin:16px 0 8px;">النزاعات المفتوحة</h3>
    ${disputes.map((d) => `
      <div class="card" style="border-color: var(--status-alert);">
        <div class="row"><span class="mono">${d.shipment_code}</span><span class="chip alert">${d.issue_type}</span></div>
        <p class="muted" style="margin-top:6px;">فتحه: ${d.opened_by_name}</p>
        <p style="margin-top:6px; font-size:13px;">${d.description}</p>
        <div class="row" style="margin-top:10px; gap:6px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="resolveDispute(${d.id}, 'merchant')">لصالح التاجر</button>
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="resolveDispute(${d.id}, 'driver')">لصالح السائق</button>
        </div>
      </div>`).join('')}
    ` : ''}

    <h3 style="margin:16px 0 8px;">المستخدمون حسب الدور</h3>
    <div class="card">
      ${data.usersByRole.map((r) => `<div class="row"><span class="muted">${r.role}</span><span class="mono">${r.c}</span></div>`).join('')}
    </div>
    <h3 style="margin:16px 0 8px;">توثيق بانتظار المراجعة (${data.pendingKyc.length})</h3>
    <div class="card">
      ${data.pendingKyc.map((u) => `
        <div class="row" style="margin-bottom:6px;">
          <span>${u.name} <span class="muted">(${u.role})</span></span>
          <span>
            <button class="btn btn-primary btn-sm" onclick="reviewKyc(${u.id}, 'verified')">قبول</button>
            <button class="btn btn-danger btn-sm" onclick="reviewKyc(${u.id}, 'rejected')">رفض</button>
          </span>
        </div>`).join('') || '<p class="muted">لا يوجد طلبات معلقة.</p>'}
    </div>
    <h3 style="margin:16px 0 8px;">أحدث الشحنات</h3>
    ${data.recentShipments.map((s) => `
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
