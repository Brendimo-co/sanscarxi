/* script.js - Updated for:
   - first 3 spins per day deterministic behavior
   - server-side 3/day enforcement
   - removed countdown and share CTA usage
   - new API endpoint
*/

/* ===========================
CONFIG
=========================== */

const API_ENDPOINT = "https://script.google.com/macros/s/AKfycbzwgkr3AN5u0nAelm-0qJZxrFvFRgj2cZtIbUpMl7Q7BzKdHvjkporVg6-Cs0PyKB8vHA/exec";

/* ===========================
DOM refs
=========================== */

const form = document.getElementById('entryForm');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const submitBtn = document.getElementById('submitBtn');
const wheelWrap = document.getElementById('wheelWrap');
const wheelCanvas = document.getElementById('wheelCanvas');
const spinBtn = document.getElementById('spinBtn');
const historyList = document.getElementById('historyList');
const resultModal = document.getElementById('resultModal');
const resultGiftEl = document.getElementById('resultGift');
const resultTierEl = document.getElementById('resultTier');
const resultInstructions = document.getElementById('resultInstructions');
const closeModal = document.getElementById('closeModal');
const modalOk = document.getElementById('modalOk');
const resultTitle = document.getElementById('resultTitle');

/* ===========================
Gifts configuration
=========================== */

const GIFTS = [
  { id: 'A1', name: 'Ödənişsiz Seç', tier: 'A', weight: 0.000 },
  { id: 'B1', name: '15 AZN Endirim', tier: 'B', weight: 0.000 },
  { id: 'B2', name: 'La Coste Qolbaq', tier: 'B', weight: 0.495 },
  { id: 'F1', name: 'Qazanmadınız', tier: 'F', weight: 13.995 },
  { id: 'B3', name: 'La Coste Parfüm', tier: 'B', weight: 0.495 },
  { id: 'B4', name: 'Qalstuk Dəsti', tier: 'B', weight: 0.000 },
  { id: 'B5', name: 'Armani Parfüm', tier: 'B', weight: 0.495 },
  { id: 'F2', name: 'Qazanmadınız', tier: 'F', weight: 17.495 },
  { id: 'B6', name: 'Hermes Qalstuk', tier: 'B', weight: 0.495 },
  { id: 'B7', name: 'Premium Kəmər', tier: 'B', weight: 0.000 },
  { id: 'B8', name: 'Premium Kaşelok', tier: 'B', weight: 0.000 },
  { id: 'F3', name: 'Qazanmadınız', tier: 'F', weight: 13 },
  { id: 'B9', name: '3 AZN Endirim', tier: 'B', weight: 0.000 },
  { id: 'B10', name: 'Qələm', tier: 'B', weight: 0.495 },
  { id: 'C1', name: '5 AZN Endirim', tier: 'C', weight: 1 },
  { id: 'F4', name: 'Qazanmadınız', tier: 'F', weight: 20 },
  { id: 'C2', name: 'Kaşelok', tier: 'C', weight: 1 },
  { id: 'C3', name: 'Kəmər', tier: 'C', weight: 1 },
  { id: 'C4', name: 'Qolbaq', tier: 'C', weight: 1 },
  { id: 'F5', name: 'Qazanmadınız', tier: 'F', weight: 19 },
  { id: 'C5', name: 'Saat', tier: 'C', weight: 1 },
  { id: 'D1', name: '2 - 10', tier: 'D', weight: 0.25 },
  { id: 'D2', name: 'Indi 10', tier: 'D', weight: 0.25 },
  { id: 'F6', name: 'Qazanmadınız', tier: 'F', weight: 1.99 },
  { id: 'D3', name: 'Dostunla 5', tier: 'D', weight: 6.25 },
  { id: 'D4', name: 'Paylaş 5', tier: 'D', weight: 0.25 }
];

/* ===========================
Helpers
=========================== */

function sanitizePhone(raw) {
  let s = (raw || '').trim();
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+') && /^\d{9}$/.test(s)) s = '+994' + s;
  if (/^0\d{9}$/.test(s)) s = '+994' + s.slice(1);
  return s;
}

function stateKey(phone) { return `brendimo_state_${phone}`; }

function loadState(phone) {
  try {
    const raw = localStorage.getItem(stateKey(phone));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveState(phone, state) {
  localStorage.setItem(stateKey(phone), JSON.stringify(state));
}

function weightedRandomPick(allowE = false) {
  const pool = GIFTS.filter(g => allowE ? true : g.tier !== 'E');
  const totalWeight = pool.reduce((s, x) => s + Number(x.weight || 0), 0);
  if (totalWeight <= 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const r = Math.random() * totalWeight;
  let acc = 0;
  for (let i = 0; i < pool.length; i++) {
    acc += Number(pool[i].weight);
    if (r <= acc) return pool[i];
  }
  return pool[pool.length - 1];
}

// Returns number of spins recorded locally for this phone for today's date (YYYY-MM-DD)
function getLocalSpinsToday(phone) {
  const state = loadState(phone);
  if (!state || !state.spins || !state.spins.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  return state.spins.filter(s => (s.date || '').slice(0, 10) === today).length;
}

/* ===========================
Canvas wheel rendering + animation
=========================== */

const canvas = wheelCanvas;
const ctx = wheelCanvas.getContext("2d");
let currentRotation = 0;
let isSpinning = false;
let lastRenderedPool = [];
let center = { x: 0, y: 0 };
let radius = 0;

function computeVisualSize() {
  const wrapRect = wheelWrap.getBoundingClientRect();
  return Math.min(wrapRect.width, window.innerHeight * 2);
}

function setCanvasSize(size) {
  const dpr = window.devicePixelRatio || 1;
  wheelCanvas.width = size * dpr;
  wheelCanvas.height = size * dpr;
  wheelCanvas.style.width = size + "px";
  wheelCanvas.style.height = size + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  center = { x: wheelCanvas.width / (2 * dpr), y: wheelCanvas.height / (2 * dpr) };
  radius = size / 2 - 20;
}

function resizeAndDraw() {
  const size = computeVisualSize();
  setCanvasSize(size);
  drawWheel(lastRenderedPool.length ? lastRenderedPool : GIFTS.filter(g => g.tier !== 'E'));
}

window.addEventListener('resize', () => requestAnimationFrame(resizeAndDraw));
window.addEventListener('orientationchange', resizeAndDraw);
window.addEventListener('load', resizeAndDraw);

function shadeColor(hex, percent) {
  var f = parseInt(hex.slice(1), 16), t = percent < 0 ? 0 : 255, p = percent < 0 ? percent * -1 : percent;
  var R = f >> 16, G = f >> 8 & 0x00FF, B = f & 0x0000FF;
  return "#" + (0x1000000 + (Math.round((t - R) * p / 100) + R) * 0x10000 + (Math.round((t - G) * p / 100) + G) * 0x100 + (Math.round((t - B) * p / 100) + B)).toString(16).slice(1);
}

function drawWheel(pool) {
  lastRenderedPool = pool.slice();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = ctx.createRadialGradient(center.x - 120, center.y - 120, radius * 0.1, center.x, center.y, radius);
  g.addColorStop(0, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius + 8, 0, Math.PI * 2);
  ctx.fill();

  const total = pool.length || 1;
  const slice = (Math.PI * 2) / total;

  for (let i = 0; i < total; i++) {
    const start = i * slice;
    const end = start + slice;
    const tier = pool[i].tier;
    let color;
    switch (tier) {
      case 'A': color = '#00A86B'; break;
      case 'B': color = '#8B00FF'; break;
      case 'C': color = '#0047AB'; break;
      case 'D': color = '#B8860B'; break;
      case 'F': color = '#E10600'; break;
      default: color = '#6b6b6b';
    }
    const alt = i % 2 === 0 ? color : shadeColor(color, -8);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.arc(center.x, center.y, radius, start + currentRotation, end + currentRotation);
    ctx.closePath();
    ctx.fillStyle = alt;
    ctx.fill();

    ctx.translate(center.x, center.y);
    const angle = start + slice / 2 + currentRotation;
    ctx.rotate(angle);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(12, radius * 0.06)}px serif`;
    const text = pool[i].name || '';
    ctx.fillText(text, radius - 10, 6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.arc(center.x, center.y, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.arc(center.x, center.y, 56, 0, Math.PI * 2);
  ctx.fill();
}

function degreesToRadians(d) { return d * Math.PI / 180; }
function radiansToDegrees(r) { return r * 180 / Math.PI; }

function spinToIndex(selectedIndex, pool, cb) {
  if (isSpinning) return;
  isSpinning = true;
  spinBtn.classList.add('disabled');
  spinBtn.disabled = true;
  const total = pool.length || 1;
  const slice = (360 / total);
  const sectorCenterDeg = selectedIndex * slice + slice / 2;
  let targetDeg = 360 * 6 + (270 - sectorCenterDeg);
  const startDeg = radiansToDegrees(currentRotation);
  const duration = 5200 + Math.random() * 800;
  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const newDeg = startDeg + (targetDeg - startDeg) * eased;
    currentRotation = degreesToRadians(newDeg);
    drawWheel(pool);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      currentRotation = degreesToRadians(targetDeg % 360);
      drawWheel(pool);
      isSpinning = false;
      cb && cb();
    }
  }
  requestAnimationFrame(step);
}

/* ===========================
UI helpers
=========================== */

function enableWheelUI() {
  wheelWrap.classList.remove('inactive');
  spinBtn.classList.remove('disabled');
  spinBtn.disabled = false;
}

function disableWheelUI() {
  wheelWrap.classList.add('inactive');
  spinBtn.classList.add('disabled');
  spinBtn.disabled = true;
}

/* initialize wheel */
function initWheel() {
  lastRenderedPool = GIFTS.slice();
  drawWheel(lastRenderedPool);
}
initWheel();

/* Input validation */
function validateInputs(name, phone) {
  if (!name || name.trim().length < 2) return { ok: false, msg: 'Tam ad daxil edin' };
  const p = sanitizePhone(phone);
  const re = /^\+?[0-9]{8,15}$/;
  if (!re.test(p)) return { ok: false, msg: 'WhatsApp nömrəsini düzgün daxil edin' };
  return { ok: true, phone: p };
}

/* ===========================
Robust API client: POST then JSONP fallback
=========================== */

async function postToApi(data) {
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Non-OK response');
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json;
    } catch (e) {
      throw new Error('Invalid JSON from POST');
    }
  } catch (err) {
    console.warn('POST failed, trying JSONP fallback due to CORS or network:', err);
    const params = Object.assign({}, data);
    const qs = Object.keys(params)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k] || '')))
      .join('&');
    const cbName = 'brendimo_cb_' + Math.random().toString(36).slice(2,9);
    const url = API_ENDPOINT + (qs ? ('?' + qs + '&') : '?') + 'callback=' + cbName;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 11000);
      function cleanup() {
        clearTimeout(timeout);
        try { delete window[cbName]; } catch (e) {}
        const s = document.getElementById(cbName + '_script');
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }
      window[cbName] = function(resp) { cleanup(); resolve(resp); };
      const script = document.createElement('script');
      script.id = cbName + '_script';
      script.src = url;
      script.onerror = function() { cleanup(); reject(new Error('JSONP script error')); };
      document.body.appendChild(script);
    });
  }
}

/* ===========================
Form submission (check)
=========================== */

form.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (isSpinning) return;
  const name = fullNameInput.value.trim();
  const phoneRaw = phoneInput.value.trim();
  const v = validateInputs(name, phoneRaw);
  if (!v.ok) { alert(v.msg); return; }
  const phone = v.phone;

  submitBtn.disabled = true;
  submitBtn.classList.add('disabled');
  submitBtn.innerText = 'Yoxlanılır...';

  try {
    const payload = { action: 'check', name, phone };
    const resp = await postToApi(payload);
    if (!resp || !resp.allowed) {
      alert(resp && resp.message ? resp.message : 'Bu nömrə üçün bu gün icazə yoxdur');
      disableWheelUI();
      submitBtn.disabled = false;
      submitBtn.classList.remove('disabled');
      submitBtn.innerText = 'Çarx aktiv deyil';
      return;
    }

    // ✅ Spin allowed
    sessionStorage.setItem('brendimo_current', JSON.stringify({
      phone: phone,
      name: name,
      serverSpinNumber: resp.spinNumber || 1,
      firstSpin: !!resp.firstSpin
    }));

    drawWheel(GIFTS.filter(g => g.tier !== 'E'));
    enableWheelUI();
    submitBtn.innerText = 'Çarx hazırdır';
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');
  } catch (err) {
    console.error(err);
    alert('Server ilə əlaqə zamanı xəta baş verdi');
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');
    submitBtn.innerText = 'Qatıl və Şansını Yoxla';
  }
});

/* ===========================
Consolidated spin handler (first-3-spins deterministic)
=========================== */

spinBtn.addEventListener('click', async function() {
  if (spinBtn.disabled || isSpinning) return;
  const sessRaw = sessionStorage.getItem('brendimo_current');
  if (!sessRaw) { alert('Əvvəlcə formu doldurun və serverə göndərin'); return; }
  const sess = JSON.parse(sessRaw);
  const phone = sess.phone;
  const name = sess.name;

  disableWheelUI();
  const pool = lastRenderedPool.length ? lastRenderedPool : GIFTS.slice();

  // Determine which spin of the day this will be using local history
  const localTodayCount = getLocalSpinsToday(phone);
  const nextSpinToday = (localTodayCount || 0) + 1;

  let selected;
  if (nextSpinToday === 1) {
    selected = GIFTS.find(g => g.tier === 'F' && /Qazanmad/i.test(g.name)) || { id: 'F_custom', name: 'Qazanmadınız', tier: 'F', weight: 0 };
  } else if (nextSpinToday === 2) {
    selected = GIFTS.find(g => g.name && /3\s*AZN|3 AZN/i.test(g.name)) || { id: 'B_3azn', name: '3 AZN Endirim', tier: 'B', weight: 0 };
  } else if (nextSpinToday === 3) {
    const choices = ['5 AZN Endirim', 'Kaşelok', 'Kəmər', 'Qolbaq', 'Saat'];
    const choiceName = choices[Math.floor(Math.random() * choices.length)];
    selected = GIFTS.find(g => g.name === choiceName) || { id: 'C3_special_' + choiceName.replace(/\s+/g,'_'), name: choiceName, tier: 'C', weight: 0 };
  } else {
    selected = weightedRandomPick(false);
  }

  let targetIndex = pool.findIndex(item => item.id === selected.id);
  let tempAdded = false;
  if (targetIndex < 0) {
    pool.push(selected);
    targetIndex = pool.length - 1;
    tempAdded = true;
  }

  try { const s = document.getElementById('sfx-spin'); if (s) { s.currentTime = 0; s.play(); } } catch(e){}

  spinToIndex(targetIndex, pool, async function() {
    // update session counter locally
    sessionStorage.setItem('brendimo_current', JSON.stringify({
      phone: phone,
      name: name,
      serverSpinNumber: (sess.serverSpinNumber || 1) + 1,
      firstSpin: false
    }));

    const payload = {
      action: 'log',
      name: name,
      phone: phone,
      spinNumber: (sess.serverSpinNumber || 1),
      giftName: selected.name,
      tier: selected.tier
    };

    try {
      const resp = await postToApi(payload);
      console.log('LOG response from server:', resp);

      // Save into local state (for history and counting)
      let state = loadState(phone) || { phone, name, spins: [], extraSpins: 0 };
      const nowIso = new Date().toISOString();
      state.spins = state.spins || [];
      state.spins.push({
        date: nowIso,
        spinNumber: resp && resp.spinNumber ? resp.spinNumber : (sess.serverSpinNumber || 1),
        giftId: selected.id,
        giftName: selected.name,
        tier: selected.tier
      });
      saveState(phone, state);
      renderHistory(state);

      try { burstConfetti(); const winSfx = document.getElementById('sfx-win'); if (winSfx) winSfx.play(); } catch (e) {}

      // Show customized modal variant based on the spin number of the day we used
      showResultModalWithSpinNumber(selected, resp, nextSpinToday);

      // Server controls actual allowedNextSpin; if allowed, re-enable
      if (resp && resp.allowedNextSpin) {
        enableWheelUI();
        drawWheel(GIFTS.filter(g => g.tier !== 'E'));
      } else {
        disableWheelUI();
      }

      // Cleanup temporary pool addition
      if (tempAdded) {
        lastRenderedPool = GIFTS.filter(g => g.tier !== 'E').slice();
        drawWheel(lastRenderedPool);
      }
    } catch (err) {
      console.error('Log error', err);
      alert('Serverə yazılarkən xəta oldu');
      enableWheelUI();
    }
  });
});

/* ===========================
Modal controls + custom modal variants
=========================== */

function showResultModalWithSpinNumber(selected, resp, spinNumberToday) {
  try {
    resultGiftEl.innerText = selected.name || (resp && resp.gift) || 'Təşəkkür edirik!';
    resultTierEl.innerText = 'Kateqoriya: ' + (selected.tier || (resp && resp.tier) || '');

    // Clear existing modal actions
    const modalActions = resultModal.querySelector('.modal-actions');
    modalActions.innerHTML = '';

    let instr = '';

    if (spinNumberToday === 1) {
      instr = 'Təəssüf ki, qazanmadınız!. Sənin üçün bir şans daha veririk. Şansını yenidən yoxla! ';
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn primary';
      retryBtn.innerText = 'Yenidən çevir';
      retryBtn.addEventListener('click', () => {
        closeResultModal();
        enableWheelUI();
      });
      modalActions.appendChild(retryBtn);
    } else if (spinNumberToday === 2) {
      instr = '3 AZN Endirim Qazandın!. Əgər istərsən 3 AZN endirimi götürə və ya yenidən çevirə bilərsən!.';
      const takeBtn = document.createElement('button');
      takeBtn.className = 'btn';
      takeBtn.innerText = '3 AZN götür';
      takeBtn.addEventListener('click', () => {
        try {
          const sessRaw = sessionStorage.getItem('brendimo_current');
          if (sessRaw) {
            const sess = JSON.parse(sessRaw);
            const st = loadState(sess.phone) || { phone: sess.phone, name: sess.name, spins: [] };
            const last = st.spins && st.spins[st.spins.length - 1];
            if (last) last.taken = true;
            saveState(sess.phone, st);
          }
        } catch (e) { console.warn(e); }
        alert('3 AZN endiriminiz qeydə alındı. Sifariş üçün DM vasitəsilə əlaqə saxlayın.');
        closeResultModal();
      });
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn primary';
      retryBtn.innerText = 'Yenidən çevir';
      retryBtn.addEventListener('click', () => {
        closeResultModal();
        enableWheelUI();
      });
      modalActions.appendChild(takeBtn);
      modalActions.appendChild(retryBtn);
    } else if (spinNumberToday === 3) {
      instr = 'Təbrik edirik! ' + selected.name + ' qazandın. 30 dəqiqə ərzində sifarişi tamamla, hədiyyən 2x (iki qat) olsun.';
      const okBtn = document.createElement('button');
      okBtn.className = 'btn primary';
      okBtn.innerText = 'Bitir';
      okBtn.addEventListener('click', () => closeResultModal());
      modalActions.appendChild(okBtn);
    } else {
      instr = (resp && resp.message) ? resp.message : '';
      const okBtn = document.createElement('button');
      okBtn.className = 'btn primary';
      okBtn.innerText = 'Bitir';
      okBtn.addEventListener('click', () => closeResultModal());
      modalActions.appendChild(okBtn);
    }

    resultInstructions.innerText = instr;

    resultModal.classList.remove('hidden');
    resultModal.style.display = 'flex';
    resultModal.style.zIndex = '99999';
    resultModal.style.opacity = '1';
    document.body.style.overflow = 'hidden';

    const focusable = resultModal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    if (focusable && focusable.length) focusable[0].focus();
  } catch (err) {
    console.error('Error showing modal', err);
  }
}

function closeResultModal() {
  resultModal.classList.add('hidden');
  resultModal.style.display = 'none';
  resultModal.style.opacity = '0';
  document.body.style.overflow = '';
}

closeModal.addEventListener('click', closeResultModal);
modalOk.addEventListener('click', closeResultModal);

/* ===========================
History rendering
=========================== */

function renderHistory(state) {
  historyList.innerHTML = '';
  if (!state || !state.spins || state.spins.length === 0) {
    const li = document.createElement('li');
    li.innerText = 'Hələ tarixçə yoxdur';
    historyList.appendChild(li);
    return;
  }
  for (let s of state.spins.slice().reverse()) {
    const li = document.createElement('li');
    li.innerText = `${new Date(s.date).toLocaleString()} — ${s.giftName} [${s.tier}] (Spin #${s.spinNumber})`;
    historyList.appendChild(li);
  }
}

/* ===========================
Engagement: confetti + SFX hooks
=========================== */

function burstConfetti() {
  try {
    const count = 40;
    for (let i=0;i<count;i++){
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.left = (50 + (Math.random()-0.5)*40) + '%';
      el.style.top = '10%';
      el.style.background = ['#ffd166','#ef476f','#06d6a0','#118ab2'][Math.floor(Math.random()*4)];
      el.style.position = 'fixed';
      el.style.width = '10px';
      el.style.height = '16px';
      el.style.borderRadius = '3px';
      el.style.pointerEvents = 'none';
      el.style.zIndex = 999999;
      document.body.appendChild(el);
      const dur = 1400 + Math.random()*800;
      el.animate([
        { transform: `translateY(0) rotate(${Math.random()*360}deg)`, opacity: 1 },
        { transform: `translateY(${300 + Math.random()*300}px) rotate(${Math.random()*720}deg)`, opacity: 0 }
      ], { duration: dur, easing: 'cubic-bezier(.15,.8,.25,1)'});
      setTimeout(()=> el.remove(), dur+60);
    }
  } catch(e){ console.warn(e); }
}

/* ===========================
Responsive canvas resize
=========================== */

window.addEventListener('resize', () => {
  const minSize = Math.min(window.innerWidth, window.innerHeight) * 0.9;
  const size = minSize;
  wheelCanvas.width = size * devicePixelRatio;
  wheelCanvas.height = size * devicePixelRatio;
  const canvasSize = size * devicePixelRatio;
  center = { x: wheelCanvas.width / 2, y: wheelCanvas.height / 2 };
  radius = canvasSize / 2 - 20;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  drawWheel(lastRenderedPool.length ? lastRenderedPool : GIFTS.filter(g => g.tier !== 'E'));
});

// Run once on load
window.dispatchEvent(new Event('resize'));

/* ===========================
On load: render last local history
=========================== */

(function tryLoadLast() {
  const cur = sessionStorage.getItem('brendimo_current');
  if (cur) {
    try {
      const sess = JSON.parse(cur);
      const s = loadState(sess.phone);
      if (s) { renderHistory(s); return; }
    } catch (e) {}
  }
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith('brendimo_state_')) {
      try {
        const state = JSON.parse(localStorage.getItem(key));
        if (state && state.phone) {
          renderHistory(state);
          break;
        }
      } catch (e) { continue; }
    }
  }
})();

/* End of script.js */
