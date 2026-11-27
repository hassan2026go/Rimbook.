const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const L = require("../ledger-core.js"), Cal = require("../calendar-core.js"), E = require("../employment-core.js"), P = require("../projects-core.js");

/* ---------------- a small DOM-free harness that loads the real modules ---------------- */
const els = {}, toasts = [], storage = new Map(), opened = [], docListeners = {}, RBcalls = [];
const dummy = () => ({ textContent: "", addEventListener() {}, style: {}, dataset: {} });
const makeEl = tag => ({ tag, dataset: {}, style: {}, value: "", checked: false, innerHTML: "", id: "", setAttribute() {}, addEventListener() {}, click() {}, remove() { delete els[this.id]; }, append() {}, querySelector: () => dummy() });
const ctx = {
  console, JSON, Math, Date, Number, String, Array, Object, Set, Map, BigInt, Promise, Error, File: class { constructor(p, n, o) { this.name = n; this.type = (o || {}).type; } },
  Event: class { constructor(t) { this.type = t; } },
  setTimeout: fn => { fn(); return 0; }, clearTimeout() {},
  esc: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  iso: d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), toast: m => toasts.push(m), render() {}, go() {},
  confirm: () => true, prompt: () => "", VIEWS: { more: () => "<div>more</div>" }, TABS: {},
  RB: { data: { settings: { currency: "USD" }, items: [], workers: [], projects: [{ id: "main1", name: "مشروع الفيلا" }], profile: { role: "employee" } }, add() { RBcalls.push("add"); }, transact() { RBcalls.push("transact"); } },
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  Blob: class { constructor(p) { this.text = p.join(""); } }, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  navigator: { onLine: true }, FileReader: class {}, location: { protocol: "https:", origin: "https://rimbook.example", pathname: "/", href: "https://rimbook.example/" },
  open: url => { opened.push(url); return {}; },
  document: { getElementById: id => els[id] || null, createElement: tag => makeEl(tag), body: { append(el) { if (el.id) els[el.id] = el; } }, addEventListener: (n, fn) => { docListeners[n] = fn; }, activeElement: null }
};
ctx.window = ctx; ctx.window.open = ctx.open;
ctx.window.RimbookLedgerCore = L; ctx.window.RimbookCalendarCore = Cal; ctx.window.RimbookEmploymentCore = E; ctx.window.RimbookProjectsCore = P; ctx.window.RimbookDiaryCore = require("../diary-core.js");
vm.createContext(ctx);
const run = f => vm.runInContext(read(f), ctx);
for (const f of ["ledgers.js", "calendar.js", "employment.js", "projects.js", "share-center.js", "backup-all.js", "dictation.js", "diary.js"]) run(f);
const set = (id, props) => { els[id] = Object.assign(makeEl("input"), { id }, props); };
const rbBefore = JSON.stringify(ctx.RB.data);

(async () => {
  /* ======== 1. share center ======== */
  const S = ctx.RimbookShare;
  assert.equal(S.digits("+٩٦٦ 55-123 4567"), "966551234567"); assert.equal(S.digits("00966551234567"), "966551234567");
  const wa = S.link("whatsapp", { text: "مرحباً\nجدولي", phone: "+966 55 123 4567" });
  assert.equal(wa.url, "https://wa.me/966551234567?text=" + encodeURIComponent("مرحباً\nجدولي")); assert.equal(wa.tooLong, false);
  const em = S.link("email", { text: "نص", email: "a@b.co", subject: "جدول" }); assert.equal(em.url, "mailto:a%40b.co?subject=" + encodeURIComponent("جدول") + "&body=" + encodeURIComponent("نص"));
  assert.ok(S.link("sms", { text: "x", phone: "٠٥٥١٢٣" }).url.startsWith("sms:0551"));
  assert.equal(S.link("whatsapp", { text: "ا".repeat(900), phone: "1" }).tooLong, true, "long messages are flagged before they get truncated");
  assert.equal(S.emailOk("bad@"), false); assert.equal(S.emailOk("x@y.org"), true);
  S.open({ title: "إرسال الجدول", text: "نص الجدول", phone: "", email: "" });
  assert.ok(els["rimbook-share-modal"].innerHTML.includes("لا يُرسل شيء لأي خدمة قبل اختيارك"));
  set("sc-text", { value: "نص الجدول" }); set("sc-phone", { value: "+966 55 111 2222" }); set("sc-email", { value: "x@y.org" }); set("sc-remember", { checked: true }); set("sc-rname", { value: "المدير" });
  await ctx.rimbookShareSend("whatsapp");
  assert.equal(opened.at(-1), "https://wa.me/966551112222?text=" + encodeURIComponent("نص الجدول"));
  assert.equal(S.recipients().length, 1, "recipient saved only because the box was ticked");
  set("sc-remember", { checked: false }); set("sc-rname", { value: "آخر" }); await ctx.rimbookShareSend("sms"); assert.equal(S.recipients().length, 1);
  set("sc-email", { value: "bad" }); const n0 = opened.length; await ctx.rimbookShareSend("email"); assert.equal(opened.length, n0, "invalid email is not sent");
  set("sc-text", { value: "" }); await ctx.rimbookShareSend("whatsapp"); assert.ok(toasts.some(t => /لا يوجد نص/.test(t)));

  /* ======== 2. dictation ======== */
  const D = ctx.RimbookDictation;
  const field = (v, extra) => Object.assign({ tagName: "INPUT", type: "text", value: v || "", selectionStart: (v || "").length, selectionEnd: (v || "").length, maxLength: -1, dataset: {}, events: [],
    getAttribute(n) { return this[n] !== undefined ? this[n] : (n === "type" ? this.type : null); }, dispatchEvent(e) { this.events.push(e.type); } }, extra || {});
  assert.equal(D.isDictatable(field()), true); assert.equal(D.isDictatable({ tagName: "TEXTAREA", dataset: {} }), true);
  assert.equal(D.isDictatable(field("", { type: "number" })), false); assert.equal(D.isDictatable(field("", { type: "date" })), false);
  assert.equal(D.isDictatable(field("", { inputmode: "decimal" })), false, "amount fields are never dictated");
  assert.equal(D.isDictatable(field("", { readOnly: true })), false); assert.equal(D.isDictatable(field("", { dataset: { noDictation: "1" } })), false);
  const f1 = field("اجتماع"); assert.ok(D.insertText(f1, "  مع المورد  غداً ").ok); assert.equal(f1.value, "اجتماع مع المورد غداً"); assert.deepEqual(f1.events, ["input", "change"]);
  const f2 = field("ابدأ النهاية", { selectionStart: 4, selectionEnd: 4 }); D.insertText(f2, "وسط"); assert.equal(f2.value, "ابدأ وسط النهاية"); assert.equal(f2.selectionStart, 8);
  const f3 = field("12345", { maxLength: 8 }); const r3 = D.insertText(f3, "abcdefgh"); assert.equal(f3.value.length <= 8, true); assert.equal(r3.truncated, true);
  assert.equal(D.insertText(field("x", { maxLength: 1 }), "yy").ok, false); assert.equal(D.insertText(field(), "   ").ok, false);
  // native engine path: offline Arabic model or phone recognizer, decided by the speech bridge
  ctx.window.Capacitor = { isNativePlatform: () => true };
  let calledWith = null, partialDuring = null; ctx.rimbookOfflineSpeechPartial = () => "old";
  ctx.rimbookOfflineSpeechStart = async (lang, pref) => { calledWith = [lang, pref]; partialDuring = typeof ctx.rimbookOfflineSpeechPartial; return { transcript: "كتابة بالصوت" }; };
  const target = field("ملاحظة:"); D._setTarget(target);
  docListeners.focusin({ target }); assert.ok(els["rimbook-dictation-bar"], "the mic bar appears on a text field");
  const res = await D.start();
  assert.deepEqual(calledWith, ["ar", "auto"]); assert.equal(res.ok, true); assert.equal(target.value, "ملاحظة: كتابة بالصوت");
  assert.equal(ctx.rimbookOfflineSpeechPartial(), "old", "the previous partial-result handler is restored");
  ctx.rimbookOfflineSpeechStart = async () => { throw new Error("لا يوجد اتصال ومحرك العربية المحلي غير مثبت"); };
  toasts.length = 0; const bad = await D.start(); assert.equal(bad.ok, false); assert.ok(toasts.some(t => /غير مثبت/.test(t)), "offline without the model explains what to do");
  assert.equal(D.state.listening, false);
  ctx.rimbookOfflineSpeechStart = async () => ({ transcript: "" }); assert.equal((await D.start()).ok, false);
  // browser path
  ctx.window.Capacitor = undefined;
  toasts.length = 0; assert.equal((await D.start()).ok, false); assert.ok(toasts.some(t => /غير متاح في هذا المتصفح/.test(t)));
  ctx.SpeechRecognition = class { start() { setTimeout2(() => { this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "من المتصفح" }], { isFinal: true })] }); this.onend(); }); } stop() {} };
  function setTimeout2(fn) { fn(); }
  const t2 = field(""); D._setTarget(t2); assert.equal((await D.start()).ok, true); assert.equal(t2.value, "من المتصفح");
  ctx.navigator.onLine = false; toasts.length = 0; assert.equal((await D.start()).ok, false); assert.ok(toasts.some(t => /يحتاج إنترنت/.test(t))); ctx.navigator.onLine = true;
  delete ctx.SpeechRecognition;

  /* ======== 3. projects: own file, own account, own schedule ======== */
  const proj = () => JSON.parse(storage.get("rimbook_projects_v1"));
  const led = () => JSON.parse(storage.get("rimbook_ledgers_v1"));
  const cal = () => JSON.parse(storage.get("rimbook_calendar_v1"));
  set("pj-name", { value: "فيلا الورود" }); set("pj-client", { value: "أبو سالم" }); set("pj-desc", { value: "" }); set("pj-main", { value: "main1" }); set("pj-account", { checked: true });
  ctx.projCreate();
  set("pj-name", { value: "مبنى الشرق" }); set("pj-main", { value: "" }); ctx.projCreate();
  assert.equal(proj().projects.length, 2); const [A, B] = proj().projects;
  assert.ok(A.bookId && B.bookId && A.bookId !== B.bookId, "each project gets its own account");
  assert.equal(led().books.length, 2); assert.ok(led().books.some(b => b.name === "مشروع: فيلا الورود"));
  assert.equal(ctx.RimbookProjects.list().length, 2);
  assert.ok(ctx.RimbookLedgers.post({ bookId: A.bookId, kind: "income", amount: 500000, date: "2026-11-20" }).ok);
  assert.ok(ctx.RimbookLedgers.post({ bookId: B.bookId, kind: "expense", amount: 12000, date: "2026-11-21" }).ok);
  assert.equal(ctx.RimbookLedgers.summary(A.bookId).cash, 500000); assert.equal(ctx.RimbookLedgers.summary(B.bookId).cash, -12000, "project accounts never mix");
  ctx.calOpenItem("appointment", "2026-12-01", null, A.id);
  assert.ok(els["rimbook-cal-modal"].innerHTML.includes("فيلا الورود"), "the calendar form offers the project");
  set("ci-type", { value: "appointment" }); set("ci-title", { value: "معاينة الموقع" }); set("ci-date", { value: "2026-12-01" }); set("ci-time", { value: "10:00" }); set("ci-body", { value: "" }); set("ci-remind", { value: "" }); set("ci-project", { value: A.id });
  ctx.__calMode = "none"; ctx.calSaveItem();
  assert.equal(cal().items[0].projectId, A.id); assert.equal(ctx.RimbookCalendar.itemsForProject(A.id).length, 1); assert.equal(ctx.RimbookCalendar.itemsForProject(B.id).length, 0);
  ctx.projAddFile = ctx.projAddFile; set("pj-f-title", { value: "قرار" }); set("pj-f-body", { value: "اعتماد المخطط" }); ctx.projGo(A.id); ctx.projAddFile(A.id);
  assert.equal(proj().projects[0].files.length, 1); assert.equal(proj().projects[1].files.length, 0, "each project has its own file");
  const view = ctx.VIEWS.myprojects(); assert.ok(view.includes("5,000.00") && view.includes("معاينة الموقع") && view.includes("اعتماد المخطط"));
  ctx.projShare(A.id); const reportHtml = els["rimbook-share-modal"].innerHTML;
  assert.ok(reportHtml.includes("فيلا الورود") && reportHtml.includes("5,000.00") && reportHtml.includes("معاينة الموقع") && !reportHtml.includes(B.id));
  ctx.projEntry(A.id); assert.ok(els["rimbook-ledger-modal"], "adds an entry straight into the project's own account");
  ctx.projStatus(A.id, "archived"); assert.equal(ctx.RimbookProjects.list().length, 1);
  assert.deepEqual(RBcalls, [], "the hub never writes into the main app data");

  /* ======== 4. unified backup ======== */
  const ALL = ctx.RimbookBackupAll;
  set("emp-ename", { value: "شركة النور" }); set("emp-ecur", { value: "USD" }); ctx.empAddEmployer();
  const bundle = JSON.parse(JSON.stringify(ALL.build(1)));
  assert.deepEqual(Object.keys(bundle.modules).sort(), ["calendar", "diary", "employment", "ledgers", "projects"]);
  assert.equal(ALL.verify(bundle).ok, true);
  const tampered = JSON.parse(JSON.stringify(bundle)); tampered.modules.ledgers.data.entries[0].amount += 1;
  assert.equal(ALL.verify(tampered).ok, false, "a changed file is rejected");
  assert.equal(ALL.verify({ format: "x" }).ok, false);
  const countsBefore = ["ledgers", "calendar", "employment", "projects", "diary"].map(k => ctx.RimbookData[k].count());
  ctx.projGo(null); set("pj-name", { value: "مشروع إضافي" }); set("pj-main", { value: "" }); set("pj-account", { checked: false }); ctx.projCreate();
  assert.notEqual(ctx.RimbookData.projects.count(), countsBefore[3]);
  assert.equal(ALL.apply(bundle).ok, true);
  assert.deepEqual(["ledgers", "calendar", "employment", "projects", "diary"].map(k => ctx.RimbookData[k].count()), countsBefore, "restore returns every module to the backup state");
  assert.equal(ALL.undo().ok, true); assert.equal(ctx.RimbookData.projects.count(), countsBefore[3] + 1, "undo brings back the state before the restore");
  // all-or-nothing: a failing module rolls the others back
  const realImport = ctx.RimbookData.employment.import; ctx.RimbookData.employment.import = () => ({ ok: false, error: "فشل مصطنع" });
  ctx.RimbookLedgers.post({ bookId: B.bookId, kind: "income", amount: 777, date: "2026-11-22" });
  const snapshotBefore = JSON.stringify(ctx.RimbookData.ledgers.export().data);
  const failed = ALL.apply(bundle); assert.equal(failed.ok, false); assert.match(failed.error, /لم يتغير شيء/);
  assert.equal(JSON.stringify(ctx.RimbookData.ledgers.export().data), snapshotBefore, "a failed restore leaves every module exactly as it was");
  ctx.RimbookData.employment.import = realImport;

  /* ======== 5. fully offline notebook: nothing needed from the network ======== */
  const html = read("index.html"), sw = read("sw.js");
  const scripts = [...html.matchAll(/<script[^>]+src="\.\/([^"]+)"/g)].map(m => m[1]);
  const cached = new Set([...sw.matchAll(/"\.\/([^"]*)"/g)].map(m => m[1]));
  for (const s of scripts) { assert.ok(fs.existsSync(path.join(root, s)), s + " exists"); assert.ok(cached.has(s), s + " is precached for offline use"); }
  for (const f of ["dictation.js", "share-center.js", "backup-all.js", "projects.js", "notebook.js", "voice-ledger.js", "offline-speech.js", "manifest.webmanifest"]) assert.ok(cached.has(f), f + " cached");
  assert.ok(!/<(script|link|img|iframe)[^>]+(src|href)="https?:/i.test(html), "no remote script, stylesheet or image is required to start the app");
  assert.ok(!/importScripts\(|https?:\/\/(?!hassan2026go)/.test(sw.replace(/\/\/.*$/gm, "")), "the service worker fetches nothing remote at install");
  for (const f of scripts.filter(s => /^(notebook|reminders|voice-ledger|offline-speech|dictation|share-center|calendar|ledgers|employment|projects)/.test(s))) {
    assert.ok(!/fetch\(\s*["'`]https?:/.test(read(f)), f + " makes no remote requests");
  }
  assert.ok(read(".github/workflows/android-preview.yml").includes("apply_alarm_patch.py") && read(".github/workflows/android-release.yml").includes("apply_alarm_patch.py"));
  assert.equal(JSON.stringify(ctx.RB.data), rbBefore, "main app data untouched by all add-ons");
  console.log("Final release tests passed.");
})().catch(e => { console.error(e); process.exit(1); });
