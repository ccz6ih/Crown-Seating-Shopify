/*
 * Crown Seating Quiz — UI.
 * Renders one question per screen, then a results page that explains every recommendation.
 * Scoring and product data live in crown-quiz-engine.js.
 */
(function () {
  'use strict';

  var Engine = window.CrownQuizEngine;
  var root = document.getElementById('crown-quiz');
  if (!Engine || !root) return;

  var QUESTIONS = Engine.QUESTIONS;
  var TOTAL = QUESTIONS.length;
  var STORE_KEY = 'crownQuizState.v2';
  var PRACTICE_TYPES = [
    'Solo Practice',
    'Small Group (2-4 doctors)',
    'Large Practice (5+ doctors)',
    'DSO/Corporate',
    'Mobile/Satellite Clinic'
  ];

  var state = { step: 1, answers: {}, view: 'quiz' };
  var startedAt = Date.now();
  var lastPointer = false;
  var advanceTimer = null;

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ step: state.step, answers: state.answers })); } catch (e) {}
  }
  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && saved.answers) {
        state.answers = saved.answers;
        state.step = Math.min(TOTAL, Math.max(1, saved.step || 1));
      }
    } catch (e) {}
  }
  function clearSaved() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function track(fn) {
    try {
      var a = window.CrownSeatingAnalytics;
      if (a && typeof a[fn] === 'function') a[fn].apply(a, Array.prototype.slice.call(arguments, 1));
    } catch (e) {}
  }
  function gtagEvent(name, params) {
    try { if (typeof gtag !== 'undefined') gtag('event', name, params); } catch (e) {}
  }

  function icon(state_) {
    var paths = {
      match: '<path d="M5 12.5l4.5 4.5L19 7.5" />',
      partial: '<path d="M6 12h12" />',
      neutral: '<path d="M6 12h12" />',
      miss: '<path d="M7 7l10 10M17 7L7 17" />'
    };
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[state_] || paths.neutral) + '</svg>';
  }
  var STATE_LABEL = { match: 'Matches', partial: 'Close', neutral: 'No preference', miss: 'Does not match' };

  // ---------- quiz screens ----------
  function renderQuestion() {
    var q = QUESTIONS[state.step - 1];
    var current = state.answers[q.key];
    var pct = Math.round(((state.step - 1) / TOTAL) * 100);
    var why = q.why;
    if (q.key === 'budget') {
      var b = Engine.priceBounds();
      why = 'Crown stools run from ' + Engine.money(b.min) + ' to ' + Engine.money(b.max) + '. Tell us your range and we weigh price alongside fit.';
    }

    var options = q.options.map(function (o, i) {
      var id = 'cq-' + q.key + '-' + i;
      var checked = current === o.value;
      return '<div class="cq-opt">' +
        '<input class="cq-opt__input" type="radio" name="' + esc(q.key) + '" id="' + id + '" value="' + esc(o.value) + '"' + (checked ? ' checked' : '') + '>' +
        '<label class="cq-opt__label" for="' + id + '">' +
          '<span class="cq-opt__mark" aria-hidden="true"></span>' +
          '<span class="cq-opt__text"><span class="cq-opt__title">' + esc(o.label) + '</span>' +
          (o.help ? '<span class="cq-opt__help">' + esc(o.help) + '</span>' : '') + '</span>' +
        '</label></div>';
    }).join('');

    root.innerHTML =
      '<div class="cq-progress" role="progressbar" aria-valuemin="1" aria-valuemax="' + TOTAL + '" aria-valuenow="' + state.step + '" aria-label="Quiz progress">' +
        '<div class="cq-progress__meta"><span>Question ' + state.step + ' of ' + TOTAL + '</span><span>' + (TOTAL - state.step + 1 === 1 ? 'Last question' : (TOTAL - state.step + 1) + ' left') + '</span></div>' +
        '<div class="cq-progress__track"><div class="cq-progress__bar" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      '<fieldset class="cq-card">' +
        '<legend class="cq-card__legend"><h2 class="cq-card__title" id="cq-title" tabindex="-1">' + esc(q.title) + '</h2></legend>' +
        '<div class="cq-why">' +
          '<p><strong>Why we ask</strong> ' + esc(why) + '</p>' +
          '<p><strong>What it changes</strong> ' + esc(q.effect) + '</p>' +
        '</div>' +
        '<div class="cq-opts" role="radiogroup" aria-labelledby="cq-title">' + options + '</div>' +
        (q.note ? '<p class="cq-note">' + esc(q.note) + '</p>' : '') +
      '</fieldset>' +
      '<div class="cq-nav">' +
        '<button type="button" class="cq-btn cq-btn--ghost" data-act="back"' + (state.step === 1 ? ' hidden' : '') + '>Back</button>' +
        '<button type="button" class="cq-btn cq-btn--primary" data-act="next"' + (current ? '' : ' disabled') + '>' + (state.step === TOTAL ? 'See my recommendation' : 'Continue') + '</button>' +
      '</div>';
  }

  function go(step, focus) {
    clearTimeout(advanceTimer);
    state.step = step;
    state.view = 'quiz';
    save();
    renderQuestion();
    track('trackQuestionStart', step);
    if (focus) {
      var t = document.getElementById('cq-title');
      if (t) t.focus({ preventScroll: true });
      var top = root.getBoundingClientRect().top + window.pageYOffset - 16;
      if (top < window.pageYOffset) window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function advance() {
    var q = QUESTIONS[state.step - 1];
    if (!state.answers[q.key]) return;
    track('trackQuestionComplete', state.step, state.answers[q.key]);
    if (state.step < TOTAL) go(state.step + 1, true);
    else showResults();
  }

  // ---------- results ----------
  function liveFetch(handle) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 6000) : null;
    return fetch('/products/' + encodeURIComponent(handle) + '.js', { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (res.status === 404) return { gone: true };
        if (!res.ok) return { error: true };
        return res.json().then(function (j) { return { live: j, handle: handle }; });
      })
      .catch(function () { if (timer) clearTimeout(timer); return { error: true }; });
  }

  // Try the listed handle, then any duplicate listings. 404 = retired, so skip the product.
  function resolve(candidate) {
    var handles = [candidate.product.handle].concat(candidate.product.altHandles || []);
    var i = 0;
    function next() {
      if (i >= handles.length) return Promise.resolve({ candidate: candidate, gone: true });
      return liveFetch(handles[i++]).then(function (r) {
        if (r.gone) return next();
        return { candidate: candidate, live: r.live || null, handle: r.handle || candidate.product.handle };
      });
    }
    return next();
  }

  function pick(candidates, n) {
    return Promise.all(candidates.map(resolve)).then(function (rs) {
      var kept = rs.filter(function (r) { return !r.gone; });
      if (!kept.length) kept = rs.map(function (r) { return { candidate: r.candidate, live: null, handle: r.candidate.product.handle }; });
      return kept.slice(0, n).map(function (r) {
        var p = r.candidate.product, L = r.live;
        return {
          score: r.candidate.score,
          breakdown: r.candidate.breakdown,
          product: p,
          title: L && L.title ? L.title : p.name,
          price: L && typeof L.price === 'number' ? L.price / 100 : p.price,
          image: L && (L.featured_image || (L.images && L.images[0])) || '',
          url: '/products/' + encodeURIComponent(r.handle),
          type: p.role
        };
      });
    });
  }

  function imgUrl(src, w) {
    if (!src) return '';
    if (!/^(https?:)?\/\//.test(src)) return src;
    return src.replace(/^\/\//, 'https://') + (src.indexOf('?') === -1 ? '?' : '&') + 'width=' + w;
  }

  function reasonsHTML(rec, onlyMatches) {
    var items = rec.breakdown;
    if (onlyMatches) items = items.filter(function (b) { return b.state === 'match'; }).slice(0, 2);
    return '<ul class="cq-reasons">' + items.map(function (b) {
      return '<li class="cq-reason cq-reason--' + b.state + '">' +
        '<span class="cq-reason__icon">' + icon(b.state) + '<span class="cq-sr">' + STATE_LABEL[b.state] + ':</span></span>' +
        '<span class="cq-reason__body"><strong>' + esc(b.label) + '</strong> ' + esc(b.text) + '</span>' +
        (onlyMatches ? '' : '<span class="cq-reason__pts">' + b.points + '/' + b.max + '</span>') +
      '</li>';
    }).join('') + '</ul>';
  }

  function typeLabel(t) { return t === 'assistant' ? 'Assistant stool' : 'Operator stool'; }

  function primaryHTML(rec, heading) {
    return '<article class="cq-primary">' +
      '<div class="cq-primary__media">' +
        (rec.image ? '<img src="' + esc(imgUrl(rec.image, 720)) + '" alt="' + esc(rec.title) + '" width="720" height="720" loading="eager">' : '<div class="cq-primary__ph" aria-hidden="true"></div>') +
      '</div>' +
      '<div class="cq-primary__body">' +
        '<p class="cq-eyebrow">' + esc(heading) + '</p>' +
        '<h3 class="cq-primary__title">' + esc(rec.title) + '</h3>' +
        '<p class="cq-meta"><span class="cq-tag">' + typeLabel(rec.type) + '</span><span class="cq-tag cq-tag--soft">' + (rec.product.style === 'saddle' ? 'Saddle seat' : 'Round seat') + '</span></p>' +
        '<div class="cq-score"><span class="cq-score__num">' + Math.round(rec.score) + '%</span><span class="cq-score__label">fit with your answers</span></div>' +
        '<p class="cq-price">From ' + Engine.money(rec.price) + ' <span>base price · upholstery and options extra</span></p>' +
        '<h4 class="cq-subhead">Why we picked it</h4>' +
        reasonsHTML(rec, false) +
        '<a class="cq-btn cq-btn--primary cq-btn--block" href="' + esc(rec.url) + '" data-track="view_primary">View ' + esc(rec.title) + '</a>' +
      '</div></article>';
  }

  function altHTML(rec, label) {
    return '<article class="cq-alt">' +
      '<a class="cq-alt__media" href="' + esc(rec.url) + '" tabindex="-1" aria-hidden="true">' +
        (rec.image ? '<img src="' + esc(imgUrl(rec.image, 360)) + '" alt="" width="360" height="360" loading="lazy">' : '<div class="cq-primary__ph"></div>') +
      '</a>' +
      '<div class="cq-alt__body">' +
        '<p class="cq-eyebrow">' + esc(label) + '</p>' +
        '<h4 class="cq-alt__title"><a href="' + esc(rec.url) + '">' + esc(rec.title) + '</a></h4>' +
        '<p class="cq-alt__meta">' + Math.round(rec.score) + '% fit · From ' + Engine.money(rec.price) + '</p>' +
        reasonsHTML(rec, true) +
        '<a class="cq-link" href="' + esc(rec.url) + '">View details</a>' +
      '</div></article>';
  }

  function summaryHTML() {
    return '<section class="cq-summary" aria-labelledby="cq-sum-h"><h3 class="cq-subhead" id="cq-sum-h">Your answers</h3><ul class="cq-chips">' +
      QUESTIONS.map(function (q, i) {
        var o = q.options.filter(function (x) { return x.value === state.answers[q.key]; })[0];
        return '<li><button type="button" class="cq-chip" data-act="edit" data-step="' + (i + 1) + '" aria-label="Change answer: ' + esc(q.title) + '">' +
          '<span class="cq-chip__q">' + esc(q.title.replace(/\?$/, '')) + '</span><span class="cq-chip__a">' + esc(o ? o.label : '') + '</span></button></li>';
      }).join('') + '</ul></section>';
  }

  function methodHTML() {
    var W = Engine.WEIGHTS;
    return '<details class="cq-method"><summary>How we chose these stools</summary><div class="cq-method__body">' +
      '<p>First we filter by role, so operators only see operator stools and assistants only see assistant stools. Then each remaining stool is scored out of 100 on five things:</p>' +
      '<table class="cq-table"><thead><tr><th scope="col">Factor</th><th scope="col">What we compare</th><th scope="col">Points</th></tr></thead><tbody>' +
      Engine.METHOD.map(function (m) { return '<tr><th scope="row">' + esc(m.label) + '</th><td>' + esc(m.desc) + '</td><td>' + W[m.key] + '</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<p>The percentage is how closely a stool fits your answers. It is not a quality rating, since every Crown stool is built to the same standard. Prices are base prices; upholstery upgrades and options are extra. If anything looks off, a test sit is the best final check.</p>' +
      '</div></details>';
  }

  function leadHTML() {
    return '<section class="cq-lead" id="cq-lead" aria-labelledby="cq-lead-h">' +
      '<h3 class="cq-lead__title" id="cq-lead-h">Save these results</h3>' +
      '<p class="cq-lead__sub">Get your recommendation by email, and a Crown Seating specialist can follow up if you would like help choosing.</p>' +
      '<form id="cq-lead-form" class="cq-form" novalidate>' +
        '<div class="cq-form__row"><label class="cq-field"><span>First name</span><input name="firstName" type="text" autocomplete="given-name" required></label>' +
        '<label class="cq-field"><span>Last name</span><input name="lastName" type="text" autocomplete="family-name" required></label></div>' +
        '<label class="cq-field"><span>Work email</span><input name="email" type="email" autocomplete="email" inputmode="email" required></label>' +
        '<div class="cq-form__row"><label class="cq-field"><span>Practice name <em>(optional)</em></span><input name="practice_name" type="text" autocomplete="organization"></label>' +
        '<label class="cq-field"><span>Phone <em>(optional)</em></span><input name="phone" type="tel" autocomplete="tel" inputmode="tel"></label></div>' +
        '<label class="cq-field"><span>Practice type <em>(optional)</em></span><select name="practice_type"><option value="">Select one</option>' +
          PRACTICE_TYPES.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('') + '</select></label>' +
        '<label class="cq-check"><input type="checkbox" name="marketing_consent" required><span>Email me my results and Crown Seating product information. You can unsubscribe any time.</span></label>' +
        '<p class="cq-form__error" id="cq-lead-error" role="alert" hidden></p>' +
        '<button type="submit" class="cq-btn cq-btn--primary cq-btn--block">Email my results</button>' +
      '</form></section>';
  }

  function showResults() {
    state.view = 'results';
    save();
    root.innerHTML = '<div class="cq-loading" role="status"><span class="cq-spinner" aria-hidden="true"></span>Finding your best fit…</div>';
    scrollToQuiz();

    var rec = Engine.recommend(state.answers);
    var multi = state.answers.role === 'Multiple Roles';
    Promise.all([pick(rec.results, 3), multi ? pick(rec.assisting, 1) : Promise.resolve([])]).then(function (out) {
      var picks = out[0], assist = out[1];
      if (!picks.length) {
        root.innerHTML = '<div class="cq-card"><h2 class="cq-card__title" tabindex="-1" id="cq-title">We could not load your results</h2><p>Please try again, or contact us and we will help you choose.</p><button type="button" class="cq-btn cq-btn--primary" data-act="restart">Start over</button></div>';
        return;
      }
      state.picks = picks;

      var primaryLabel = multi ? 'Best operator stool for you' : 'Your best match';
      var alts = picks.slice(1).map(function (r, i) { return altHTML(r, 'Also consider'); }).join('');
      root.innerHTML =
        '<div class="cq-results">' +
          '<header class="cq-results__head"><p class="cq-eyebrow">Your recommendation</p>' +
          '<h2 class="cq-results__title" id="cq-title" tabindex="-1">' + (multi ? 'Here are your best matches' : 'We recommend the ' + esc(picks[0].title)) + '</h2>' +
          '<p class="cq-results__sub">Based on your six answers. Below each pick, you can see exactly which answers it matched and where it falls short.</p></header>' +
          primaryHTML(picks[0], primaryLabel) +
          (assist.length ? '<h3 class="cq-section-h">For assisting</h3>' + primaryHTML(assist[0], 'Best assistant stool for you') : '') +
          (alts ? '<h3 class="cq-section-h">Other good fits</h3><div class="cq-alts">' + alts + '</div>' : '') +
          summaryHTML() +
          methodHTML() +
          leadHTML() +
          '<div class="cq-nav cq-nav--end"><button type="button" class="cq-btn cq-btn--ghost" data-act="restart">Retake the quiz</button></div>' +
        '</div>';

      var title = document.getElementById('cq-title');
      if (title) title.focus({ preventScroll: true });
      root.dataset.complete = 'true';
      var results = document.getElementById('results');
      if (results) results.style.display = 'block';

      var forHubspot = picks.concat(assist).map(function (r) {
        return { product: { name: r.title, price: r.price, modelNumber: r.product.code, series: r.product.series, style: r.product.style }, score: r.score };
      });
      state.hubspotRecs = forHubspot;
      track('trackQuizCompletion', forHubspot, Date.now() - startedAt);
      gtagEvent('quiz_completed', { event_category: 'Crown Seating Quiz', event_label: 'Quiz Completed', value: 1 });
    });
  }

  function scrollToQuiz() {
    var top = root.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  // ---------- lead capture ----------
  function submitLead(form) {
    var err = document.getElementById('cq-lead-error');
    var btn = form.querySelector('button[type="submit"]');
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    err.hidden = true;

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
    if (!data.firstName || !data.lastName) return fail('Please enter your first and last name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) return fail('Please enter a valid email address.');
    if (!form.marketing_consent.checked) return fail('Please tick the box so we can email your results.');

    btn.disabled = true;
    btn.textContent = 'Sending…';
    var hs = window.CrownSeatingHubSpot;
    var full = {};
    Object.keys(state.answers).forEach(function (k) { full[k] = state.answers[k]; });
    Object.keys(data).forEach(function (k) { full[k] = data[k]; });

    var submit = hs && typeof hs.submitQuizToHubSpot === 'function'
      ? hs.submitQuizToHubSpot(full, state.hubspotRecs || [])
      : Promise.resolve({ success: false });

    submit.then(function (r) { return !!(r && r.success); }).catch(function () { return false; }).then(function (ok) {
      if (ok) {
        form.innerHTML = '<div class="cq-success" role="status"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l3 3 5-6"/></svg><div><strong>Thank you, ' + esc(data.firstName) + '.</strong><p>We have your details for ' + esc(data.email) + '.</p></div></div>';
        gtagEvent('email_captured', { event_category: 'Crown Seating Quiz', event_label: 'Quiz Email Capture Success', value: 1 });
      } else {
        btn.disabled = false;
        btn.textContent = 'Email my results';
        fail('Something went wrong sending that. Please try again, or contact us directly.');
      }
    });
  }

  // ---------- events ----------
  // The invisible radio overlays its label, so a tap lands on either; both count as a pointer pick.
  root.addEventListener('pointerdown', function (e) { lastPointer = !!e.target.closest('.cq-opt'); });

  root.addEventListener('change', function (e) {
    var input = e.target;
    if (!input.classList || !input.classList.contains('cq-opt__input')) return;
    state.answers[input.name] = input.value;
    save();
    var next = root.querySelector('[data-act="next"]');
    if (next) next.disabled = false;
    // Tap to continue; keyboard users press Continue so focus is never taken from them.
    if (lastPointer) {
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(advance, reduceMotion() ? 0 : 280);
    }
    lastPointer = false;
  });

  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'next') advance();
    else if (act === 'back') { if (state.step > 1) go(state.step - 1, true); }
    else if (act === 'edit') { go(parseInt(el.getAttribute('data-step'), 10) || 1, true); }
    else if (act === 'restart') {
      state.answers = {}; state.hubspotRecs = null; delete root.dataset.complete;
      clearSaved(); startedAt = Date.now();
      var results = document.getElementById('results');
      if (results) results.style.display = 'none';
      go(1, true);
    }
  });

  root.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'cq-lead-form') { e.preventDefault(); submitLead(e.target); }
  });

  // ---------- boot ----------
  // Runs on DOMContentLoaded so the analytics helper (which creates its tracker then) is ready first.
  function boot() {
    load();
    var startStep = 1;
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (!state.answers[QUESTIONS[i].key]) { startStep = i + 1; break; }
    }
    if (!Engine.missingAnswers(state.answers).length) showResults();
    else go(startStep, false);
  }
  if (document.readyState === 'complete') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
