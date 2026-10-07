/*
 * Crown Seating Quiz — data + scoring engine (no DOM access, unit-testable in Node).
 *
 * HOW A RECOMMENDATION IS MADE
 *   1. Role is a hard filter: operators only see operator stools, assistants only see assistant
 *      stools. ("Multiple Roles" gets the best operator stool plus one assistant pick, labelled.)
 *   2. Every remaining stool is scored out of 100 on five factors (WEIGHTS below).
 *   3. Each point awarded or withheld is recorded with a plain-English reason, which the results
 *      page shows so customers can see exactly why a stool was chosen.
 *
 * PRODUCT DATA
 *   Edit PRODUCTS to change what the quiz can recommend. Live price, title and photo are fetched
 *   from Shopify at result time (/products/<handle>.js); a handle that no longer resolves is skipped
 *   automatically, so a retired product never gets recommended. The values below are the fallback.
 *   `note` flags rows whose role was inferred from the model code and should be confirmed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CrownQuizEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRODUCTS = [
    { handle: "denver-c130ab", name: "Denver C130AB", series: "Denver", code: "C130AB", role: "operator", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 2020 },
    { handle: "durango-c90ssab", name: "Durango C90SSAB", series: "Durango", code: "C90SSAB", role: "assistant", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["petite","average","broad"], use: ["heavy","intensive"], price: 1978 },
    { handle: "telluride-c50abt", name: "Telluride C50ABT", series: "Telluride", code: "C50ABT", role: "assistant", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 2094 },
    { handle: "virtu®c120oml-large-seat", name: "virtù®C120OML (Large Seat)", series: "virtù®", code: "C120OML", role: "operator", style: "traditional", seatWidth: 20, heights: ["medium","tall"], builds: ["broad"], use: ["heavy","intensive"], price: 1879 },
    { handle: "sterling-c85sd", name: "Sterling C85SD", series: "Sterling", code: "C85SD", role: "operator", style: "traditional", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["heavy","intensive"], price: 1898, note: "inferred-from-model-code" },
    { handle: "keystonec40d", name: "Keystone C40D", series: "Keystone", code: "C40D", role: "operator", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["moderate","heavy"], price: 1098 },
    { handle: "aurora-c140d", name: "Aurora C140D", series: "Aurora", code: "C140D", role: "operator", style: "traditional", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["light","moderate"], price: 970, note: "inferred-from-model-code" },
    { handle: "crestone-c20d", name: "Crestone C20D", series: "Crestone", code: "C20D", role: "operator", style: "traditional", seatWidth: 16, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["light","moderate"], price: 513, note: "inferred-from-model-code" },
    { handle: "durango-c90ss-1", name: "Durango C90SS", series: "Durango", code: "C90SS", role: "operator", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["petite","average","broad"], use: ["moderate","heavy"], price: 1108, note: "inferred-from-model-code" },
    { handle: "vail-c30hs", name: "Vail C30HS", series: "Vail", code: "C30HS", role: "operator", style: "traditional", seatWidth: 16, heights: ["small","medium","tall"], builds: ["petite"], use: ["light","moderate"], price: 961 },
    { handle: "glenwood-c35d", name: "Glenwood C35D", series: "Glenwood", code: "C35D", role: "operator", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["light","moderate"], price: 789 },
    { handle: "durangoc90ss-1", name: "DurangoC90SS", series: "DurangoC90SS", code: "C90SS", role: "operator", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["petite","average","broad"], use: ["moderate","heavy"], price: 1108, note: "inferred-from-model-code, duplicate-listing" },
    { handle: "canyon-c160d", name: "Canyon C160D", series: "Canyon", code: "C160D", role: "operator", style: "saddle", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["moderate","heavy"], price: 1399, note: "inferred-from-model-code" },
    { handle: "steamboat-c60d-1", name: "Steamboat C60D", series: "Steamboat", code: "C60D", role: "operator", style: "traditional", seatWidth: 20, heights: ["small","medium","tall"], builds: ["broad"], use: ["heavy","intensive"], price: 1770 },
    { handle: "aspen-c70dl-large-seat", name: "Aspen C70DL Large Seat", series: "Aspen", code: "C70DL", role: "operator", style: "traditional", seatWidth: 20, heights: ["medium","tall"], builds: ["broad"], use: ["heavy","intensive"], price: 1718 },
    { handle: "silverton-c150d-1", name: "Silverton C150D", series: "Silverton", code: "C150D", role: "operator", style: "saddle", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["moderate","heavy"], price: 1108, note: "inferred-from-model-code" },
    { handle: "durango-c90ssb-1", name: "Durango C90SSB", series: "Durango", code: "C90SSB", role: "operator", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 1512, note: "inferred-from-model-code" },
    { handle: "durango-c90sbb", name: "Durango C90SBB", series: "Durango", code: "C90SBB", role: "operator", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 1546, note: "inferred-from-model-code" },
    { handle: "q-a-c-queen-anne-chair-1", name: "Q.A.C. (Queen Anne Chair)", series: "Q.A.C.", code: "QAC", role: "operator", style: "saddle", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["moderate","heavy"], price: 1108, note: "inferred-from-model-code" },
    { handle: "denver-c130db", name: "Denver C130DB", series: "Denver", code: "C130DB", role: "operator", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 1554 },
    { handle: "durango-c90sb-1", name: "Western Saddle", series: "Western", code: "C90SB", role: "operator", style: "saddle", seatWidth: 16, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["moderate","heavy"], price: 1046, note: "inferred-from-model-code" },
    { handle: "denver-c130d", name: "Denver C130D", series: "Denver", code: "C130D", role: "operator", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["moderate","heavy"], price: 1108 },
    { handle: "virtu®c120dm-1", name: "virtù®C120DM", series: "virtù®C120DM", code: "C120DM", role: "operator", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average"], use: ["moderate","heavy"], price: 1400, note: "inferred-from-model-code" },
    { handle: "virtu®-c120dml-large-seat-1", name: "virtù® C120DML (Large Seat)", series: "virtù®", code: "C120DML", role: "operator", style: "traditional", seatWidth: 20, heights: ["medium","tall"], builds: ["broad"], use: ["heavy","intensive"], price: 1662, note: "inferred-from-model-code" },
    { handle: "aurora-c140a", name: "Aurora C140A", series: "Aurora", code: "C140A", role: "assistant", style: "traditional", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["moderate","heavy"], price: 1248 },
    { handle: "crestone-c20a", name: "Crestone C20A", series: "Crestone", code: "C20A", role: "assistant", style: "traditional", seatWidth: 16, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["light","moderate"], price: 691 },
    { handle: "glenwood-c35a", name: "Glenwood C35A", series: "Glenwood", code: "C35A", role: "assistant", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["light","moderate"], price: 926 },
    { handle: "keystone-c40ar", name: "Keystone C40AR", series: "Keystone", code: "C40AR", role: "assistant", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["moderate","heavy"], price: 1337, note: "inferred-from-model-code" },
    { handle: "steamboat-c60abt", name: "Steamboat C60ABT", series: "Steamboat", code: "C60ABT", role: "assistant", style: "traditional", seatWidth: 20, heights: ["small","medium","tall"], builds: ["broad"], use: ["heavy","intensive"], price: 2157 },
    { handle: "sterling-c85sa-1", name: "Sterling C85SA", series: "Sterling", code: "C85SA", role: "assistant", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 2348 },
    { handle: "durango-c90ssa", name: "Durango C90SSA", series: "Durango", code: "C90SSA", role: "assistant", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["petite","average","broad"], use: ["heavy","intensive"], price: 1557, note: "inferred-from-model-code" },
    { handle: "durango-c90sbab", name: "Western Saddle Assistant seating with Backrest", series: "Western", code: "C90SBAB", role: "assistant", style: "saddle", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 1978 },
    { handle: "virtu®-c120dm", name: "virtù® C120DM", series: "virtù®", code: "C120DM", role: "operator", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average"], use: ["moderate","heavy"], price: 1400, note: "inferred-from-model-code, duplicate-listing" },
    { handle: "colorado-c170d", name: "Colorado C170D", series: "Colorado", code: "C170D", role: "operator", style: "saddle", seatWidth: 19, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["moderate","heavy"], price: 1108 },
    { handle: "aurora-c140ab", name: "Aurora C140AB", series: "Aurora", code: "C140AB", role: "assistant", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 1818 },
    { handle: "colorado-c170dba", name: "Colorado C170DBA", series: "Colorado", code: "C170DBA", role: "operator", style: "saddle", seatWidth: 19, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 1655, note: "inferred-from-model-code" },
    { handle: "durango-c90sba-1", name: "Western Style Assistant Saddle Stool", series: "Western", code: "C90SBA", role: "assistant", style: "saddle", seatWidth: 16, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["heavy","intensive"], price: 1557 },
    { handle: "aspen-c70ds", name: "Aspen C70DS", series: "Aspen", code: "C70DS", role: "operator", style: "traditional", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["heavy","intensive"], price: 1718 },
    { handle: "silverton-c150a", name: "Silverton Dental Stool C150A", series: "Silverton", code: "C150A", role: "assistant", style: "saddle", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["heavy","intensive"], price: 1557, note: "inferred-from-model-code" },
    { handle: "pinnacle-c180d", name: "Pinnacle C180D", series: "Pinnacle", code: "C180D", role: "operator", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 1545, note: "inferred-from-model-code" },
    { handle: "pinnacle-c180abt", name: "Pinnacle C180ABT", series: "Pinnacle", code: "C180ABT", role: "assistant", style: "traditional", seatWidth: 18, heights: ["small","medium","tall"], builds: ["average","broad"], use: ["heavy","intensive"], price: 2060, note: "inferred-from-model-code" },
    { handle: "aurora-c140db", name: "Aurora C140DB", series: "Aurora", code: "C140DB", role: "operator", style: "traditional", seatWidth: 17, heights: ["small","medium","tall"], builds: ["petite","average"], use: ["light","moderate"], price: 970 },
  ];

  var WEIGHTS = { style: 25, budget: 25, build: 20, usage: 20, height: 10 };

  // Answer values are unchanged from the previous quiz so HubSpot property options keep matching.
  var QUESTIONS = [
    {
      key: 'role',
      title: 'What is your role?',
      why: 'Operators and assistants sit and work differently, so Crown builds different stools for each. We only show you the type made for your role.',
      effect: 'Filters the lineup to operator or assistant stools.',
      options: [
        { value: 'General Dentist', label: 'General Dentist', help: 'Operator stools' },
        { value: 'Specialist (Endo/Perio/Oral Surgery)', label: 'Specialist', help: 'Endo, perio or oral surgery · Operator stools' },
        { value: 'Dental Hygienist', label: 'Dental Hygienist', help: 'Operator stools' },
        { value: 'Dental Assistant', label: 'Dental Assistant', help: 'Assistant stools' },
        { value: 'Multiple Roles', label: 'More than one role', help: "We'll show one operator pick and one assistant pick" }
      ]
    },
    {
      key: 'height',
      title: 'How tall are you?',
      why: 'Height sets how much cylinder range you need to keep your thighs level and your work at a comfortable height.',
      effect: "Removes stools that don't cover your height range.",
      options: [
        { value: 'Under 5\'4" - Petite', label: 'Under 5\'4"', help: 'Needs a lower minimum seat height' },
        { value: '5\'4" - 5\'10" - Average', label: '5\'4" to 5\'10"', help: 'Fits the standard height range' },
        { value: 'Over 5\'10" - Tall', label: 'Over 5\'10"', help: 'Needs a higher maximum seat height' }
      ]
    },
    {
      key: 'body_type',
      title: 'Which best describes your build?',
      why: "Seat width and frame capacity differ by model. A seat that's too narrow or too wide changes how well you're supported.",
      effect: "Matches your build to each stool's designed range.",
      options: [
        { value: 'Petite or Lightweight Build', label: 'Petite or lightweight', help: 'Smaller seat, easier to move' },
        { value: 'Average Build', label: 'Average', help: 'Standard seat width' },
        { value: 'Larger Build or Heavy-Duty Needs', label: 'Larger build or heavy-duty needs', help: 'Wider seat, more support' }
      ]
    },
    {
      key: 'style',
      title: 'Which seat style do you prefer?',
      why: 'Saddle seats open the hip angle and suit forward-leaning work. Round seats feel familiar and suit upright work. Neither is right for everyone.',
      effect: 'The biggest factor in the score (25 points).',
      options: [
        { value: 'Traditional Round', label: 'Traditional round', help: 'A familiar, upright feel' },
        { value: 'Saddle Style', label: 'Saddle', help: 'Open hip angle, good for leaning in' },
        { value: 'Open to Recommendations', label: "I'm not sure yet", help: "We'll weigh the other answers" }
      ]
    },
    {
      key: 'usage_intensity',
      title: 'How many hours a day will you sit?',
      why: 'Daily hours decide how much cushioning and durability you need from a stool.',
      effect: "Matches each stool's rated daily use.",
      options: [
        { value: 'Light (2-4 hours)', label: '2 to 4 hours', help: 'Part-time or occasional' },
        { value: 'Moderate (4-6 hours)', label: '4 to 6 hours', help: 'A standard clinical day' },
        { value: 'Heavy (6-8 hours)', label: '6 to 8 hours', help: 'Full days with long procedures' },
        { value: 'Intensive (8+ hours)', label: '8+ hours', help: 'Extended sessions, multiple procedures' }
      ]
    },
    {
      key: 'budget',
      title: "What's your budget for the stool?",
      why: 'Crown stools range widely in price. Tell us your range and we will weigh price alongside fit.',
      effect: 'Stools inside your range score full points; the further outside, the fewer.',
      note: 'Prices are for the base stool. Upholstery upgrades and options are extra.',
      options: [
        { value: 'Under $1,000', label: 'Under $1,000', min: 0, max: 1000 },
        { value: '$1,000 - $1,500', label: '$1,000 to $1,500', min: 1000, max: 1500 },
        { value: '$1,500 - $2,000', label: '$1,500 to $2,000', min: 1500, max: 2000 },
        { value: '$2,000 and up', label: '$2,000 and up', min: 2000, max: Infinity },
        { value: 'Flexible', label: "I'm flexible", help: 'Show me the best fit' }
      ]
    }
  ];

  var METHOD = [
    { key: 'style', label: 'Seat style', desc: 'Saddle or round, matched to your preference.' },
    { key: 'budget', label: 'Budget', desc: 'Base price compared with your range.' },
    { key: 'build', label: 'Build', desc: "Your build against the model's designed range." },
    { key: 'usage', label: 'Daily use', desc: "Your hours against the model's rated use." },
    { key: 'height', label: 'Height', desc: "Whether the model covers your height range." }
  ];

  var USE_ORDER = ['light', 'moderate', 'heavy', 'intensive'];
  var USE_NAMES = { light: 'light', moderate: 'moderate', heavy: 'heavy', intensive: 'intensive' };
  var BUILD_ORDER = ['petite', 'average', 'broad'];
  var BUILD_NAMES = { petite: 'petite', average: 'average', broad: 'larger' };
  var HEIGHT_MAP = { 'Under 5\'4" - Petite': 'small', '5\'4" - 5\'10" - Average': 'medium', 'Over 5\'10" - Tall': 'tall' };
  var HEIGHT_NAMES = { small: 'under 5\'4"', medium: '5\'4" to 5\'10"', tall: 'over 5\'10"' };
  var BUILD_MAP = { 'Petite or Lightweight Build': 'petite', 'Average Build': 'average', 'Larger Build or Heavy-Duty Needs': 'broad' };
  var USE_MAP = { 'Light (2-4 hours)': 'light', 'Moderate (4-6 hours)': 'moderate', 'Heavy (6-8 hours)': 'heavy', 'Intensive (8+ hours)': 'intensive' };
  var STYLE_MAP = { 'Traditional Round': 'traditional', 'Saddle Style': 'saddle', 'Open to Recommendations': 'any' };
  var STYLE_NAMES = { traditional: 'round', saddle: 'saddle' };

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function budgetRange(answer) {
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (QUESTIONS[i].key !== 'budget') continue;
      for (var j = 0; j < QUESTIONS[i].options.length; j++) {
        if (QUESTIONS[i].options[j].value === answer) return QUESTIONS[i].options[j];
      }
    }
    return null;
  }

  function joinNames(list, names) {
    var out = list.map(function (x) { return names[x] || x; });
    if (out.length <= 1) return out.join('');
    return out.slice(0, -1).join(', ') + ' and ' + out[out.length - 1];
  }

  function scoreProduct(p, a) {
    var parts = [];

    // Seat style
    var wantStyle = STYLE_MAP[a.style] || 'any';
    var styleName = STYLE_NAMES[p.style] || p.style;
    if (wantStyle === 'any') {
      parts.push({ key: 'style', label: 'Seat style', points: 18, max: WEIGHTS.style, state: 'neutral',
        text: "You weren't sure on style. This is a " + styleName + ' seat.' });
    } else if (wantStyle === p.style) {
      parts.push({ key: 'style', label: 'Seat style', points: WEIGHTS.style, max: WEIGHTS.style, state: 'match',
        text: 'A ' + styleName + ' seat, as you preferred.' });
    } else {
      parts.push({ key: 'style', label: 'Seat style', points: 0, max: WEIGHTS.style, state: 'miss',
        text: 'This is a ' + styleName + ' seat; you preferred ' + (STYLE_NAMES[wantStyle] || wantStyle) + '.' });
    }

    // Budget
    var range = budgetRange(a.budget);
    if (!range || a.budget === 'Flexible' || range.min === undefined) {
      parts.push({ key: 'budget', label: 'Budget', points: 18, max: WEIGHTS.budget, state: 'neutral',
        text: "You're flexible on budget. Base price " + money(p.price) + '.' });
    } else if (p.price >= range.min && p.price <= range.max) {
      parts.push({ key: 'budget', label: 'Budget', points: WEIGHTS.budget, max: WEIGHTS.budget, state: 'match',
        text: money(p.price) + ' is inside your budget.' });
    } else {
      var over = p.price > range.max;
      var d = over ? (p.price - range.max) / range.max : (range.min - p.price) / range.min;
      var pts = d <= 0.1 ? 17 : (d <= 0.25 ? 8 : 0);
      // Below the range is a saving, not a problem: only penalise lightly.
      if (!over) pts = Math.max(pts, 14);
      parts.push({ key: 'budget', label: 'Budget', points: pts, max: WEIGHTS.budget, state: pts >= 14 ? 'partial' : 'miss',
        text: money(p.price) + (over ? ' is above your budget.' : ' is below your budget.') });
    }

    // Build
    var userBuild = BUILD_MAP[a.body_type] || 'average';
    var buildsText = joinNames(p.builds, BUILD_NAMES);
    if (p.builds.indexOf(userBuild) !== -1) {
      parts.push({ key: 'build', label: 'Build', points: WEIGHTS.build, max: WEIGHTS.build, state: 'match',
        text: 'Designed for ' + buildsText + ' builds, including yours.' });
    } else {
      var near = p.builds.some(function (b) { return Math.abs(BUILD_ORDER.indexOf(b) - BUILD_ORDER.indexOf(userBuild)) === 1; });
      parts.push({ key: 'build', label: 'Build', points: near ? 10 : 0, max: WEIGHTS.build, state: near ? 'partial' : 'miss',
        text: 'Designed for ' + buildsText + ' builds; you chose ' + (BUILD_NAMES[userBuild] || userBuild) + '.' });
    }

    // Daily use
    var userUse = USE_MAP[a.usage_intensity] || 'moderate';
    var uIdx = USE_ORDER.indexOf(userUse);
    var rated = p.use.map(function (x) { return USE_ORDER.indexOf(x); });
    var lo = Math.min.apply(null, rated), hi = Math.max.apply(null, rated);
    var useText = joinNames(p.use, USE_NAMES);
    if (uIdx >= lo && uIdx <= hi) {
      parts.push({ key: 'usage', label: 'Daily use', points: WEIGHTS.usage, max: WEIGHTS.usage, state: 'match',
        text: 'Rated for ' + useText + ' daily use.' });
    } else if (uIdx < lo) {
      parts.push({ key: 'usage', label: 'Daily use', points: 14, max: WEIGHTS.usage, state: 'partial',
        text: 'Rated for ' + useText + ' use, more than you need.' });
    } else {
      var gap = uIdx - hi;
      parts.push({ key: 'usage', label: 'Daily use', points: gap === 1 ? 8 : 0, max: WEIGHTS.usage, state: gap === 1 ? 'partial' : 'miss',
        text: 'Rated for ' + useText + ' use; you sit longer than that.' });
    }

    // Height
    var userHeight = HEIGHT_MAP[a.height] || 'medium';
    if (p.heights.indexOf(userHeight) !== -1) {
      parts.push({ key: 'height', label: 'Height', points: WEIGHTS.height, max: WEIGHTS.height, state: 'match',
        text: 'Covers your height (' + HEIGHT_NAMES[userHeight] + ').' });
    } else {
      parts.push({ key: 'height', label: 'Height', points: 0, max: WEIGHTS.height, state: 'miss',
        text: "Not designed for your height (" + HEIGHT_NAMES[userHeight] + ')' + '.' });
    }

    var total = parts.reduce(function (s, x) { return s + x.points; }, 0);
    return { product: p, score: total, breakdown: parts };
  }

  // Fold duplicate listings (same model code + price) into one candidate with alternate handles.
  function uniqueProducts(list) {
    var seen = {}, out = [];
    list.forEach(function (p) {
      var k = p.code + '|' + p.price;
      if (p.code !== '?' && seen[k]) { seen[k].altHandles.push(p.handle); return; }
      var copy = {}; for (var key in p) copy[key] = p[key];
      copy.altHandles = [];
      seen[k] = copy; out.push(copy);
    });
    return out;
  }

  function rank(list, answers) {
    var range = budgetRange(answers.budget);
    var mid = range && range.min !== undefined && isFinite(range.max) ? (range.min + range.max) / 2 : null;
    return list.map(function (p) { return scoreProduct(p, answers); }).sort(function (x, y) {
      if (y.score !== x.score) return y.score - x.score;
      if (mid !== null) return Math.abs(x.product.price - mid) - Math.abs(y.product.price - mid);
      return x.product.price - y.product.price;
    });
  }

  function missingAnswers(answers) {
    return QUESTIONS.filter(function (q) { return !answers[q.key]; }).map(function (q) { return q.key; });
  }

  /**
   * @returns {{ role: string, primaryType: string, results: Array, assisting: Array }}
   *   results   — ranked candidates of the role's stool type (UI shows the first few that resolve live)
   *   assisting — only for "Multiple Roles": ranked assistant candidates
   */
  function recommend(answers) {
    var all = uniqueProducts(PRODUCTS);
    var isAssistant = answers.role === 'Dental Assistant';
    var primaryType = isAssistant ? 'assistant' : 'operator';
    var results = rank(all.filter(function (p) { return p.role === primaryType; }), answers);
    var assisting = answers.role === 'Multiple Roles'
      ? rank(all.filter(function (p) { return p.role === 'assistant'; }), answers) : [];
    return { role: answers.role, primaryType: primaryType, results: results.slice(0, 8), assisting: assisting.slice(0, 6) };
  }

  function priceBounds() {
    var prices = PRODUCTS.map(function (p) { return p.price; });
    return { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) };
  }

  return {
    PRODUCTS: PRODUCTS, QUESTIONS: QUESTIONS, WEIGHTS: WEIGHTS, METHOD: METHOD,
    recommend: recommend, scoreProduct: scoreProduct, missingAnswers: missingAnswers,
    money: money, priceBounds: priceBounds
  };
});
