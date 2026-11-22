const fs = require("node:fs");
const vm = require("node:vm");
const zlib = require("node:zlib");
const assert = require("node:assert/strict");

const activation = fs.readFileSync("activation.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("sw.js", "utf8");
const aboutGuideSource = fs.readFileSync("about-guide.js", "utf8");
const pro = fs.readFileSync("pro.js", "utf8");
const voiceLedger = fs.readFileSync("voice-ledger.js", "utf8");
const offlineSpeechBridge = fs.readFileSync("offline-speech.js", "utf8");
const tts = fs.readFileSync("tts.js", "utf8");
const nativeSpeech = fs.readFileSync("android-native/OfflineSpeechPlugin.java", "utf8");
const androidWorkflow = fs.readFileSync(".github/workflows/android-preview.yml", "utf8");
const invoices = fs.readFileSync("invoices.js", "utf8");
const receipts = fs.readFileSync("receipts.js", "utf8");
const workforce = fs.readFileSync("workforce.js", "utf8");
const reminders = fs.readFileSync("reminders.js", "utf8");
const notebook = fs.readFileSync("notebook.js", "utf8");
const push = fs.readFileSync("push.js", "utf8");
const backup = fs.readFileSync("backup.js", "utf8");
const attachmentsSource = fs.readFileSync("attachments.js", "utf8");
const sync = fs.readFileSync("sync.js", "utf8");
const integrations = fs.readFileSync("integrations.js", "utf8");
const purchases = fs.readFileSync("purchases.js", "utf8");
const contactsSource = fs.readFileSync("contacts.js", "utf8");
const invoiceCode = fs.readFileSync("invoices.js", "utf8");
const currencySource = fs.readFileSync("currency.js", "utf8");

const reversalMatch = voiceLedger.match(/function applyWorkReversal\(data,id,reason,now,newId\)\{[\s\S]*?\n\}/);
assert.ok(reversalMatch, "financial reversal helper must exist");
const applyWorkReversal = vm.runInNewContext("(" + reversalMatch[0] + ")");

function extractFunction(source, name, helpers = {}) {
  const match = source.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}"));
  assert.ok(match, name + " helper must exist");
  return vm.runInNewContext("(" + match[0] + ")", helpers);
}

const goalProgress = extractFunction(activation, "goalProgress");
const normMatch = app.match(/function normalizeSearchText\(value\) \{[\s\S]*?\n\}/);
assert.ok(normMatch, "Arabic search normalization must exist");
const normalizeSearchText = vm.runInNewContext("(" + normMatch[0] + ")");
assert.equal(normalizeSearchText("  أَحْمَد   مُحَمَّد  "), "احمد محمد");

{
  const convertStart = currencySource.indexOf("function convert(");
  const convertEnd = currencySource.indexOf("\n}", convertStart);
  const convertSource = convertStart >= 0 && convertEnd >= 0
    ? currencySource.slice(convertStart, convertEnd + 2) : "";
  assert.ok(convertSource, "currency conversion helper must exist");

  const rates = { USD:1, EUR:0.92, TRY:34.5, SAR:3.75, AED:3.67, SYP:13000, EGP:48.5, JOD:0.71 };
  const convertCurrency = vm.runInNewContext("(" + convertSource + ")", {
    getRates: () => rates
  });
  assert.equal(convertCurrency(100, "USD", "EUR"), 92,
    "100 USD must convert to 92 EUR using units-per-USD rates");
  assert.equal(convertCurrency(92, "EUR", "USD"), 100,
    "currency conversion must reverse correctly");
  assert.equal(convertCurrency(10, "USD", "TRY"), 345,
    "10 USD must convert to 345 TRY");
  assert.equal(convertCurrency(345, "TRY", "USD"), 10,
    "TRY-to-USD conversion must use the same rate convention");
  assert.ok(currencySource.includes("const DEFAULT_RATES = { USD: 1 };") && !/SYP: *13000/.test(currencySource), "no invented exchange rates may ship as defaults");
}


{
  const projectField = fs.readFileSync(require("node:path").join(__dirname, "..", "project-field.js"), "utf8");
  const store = { projects: [{ id: "p1", name: "مشروع البناء" }] };
  const inputs = {};
  const ctx = {
    window: {},
    RB: { data: store, transact: fn => { fn(store); return true; } },
    document: { getElementById: id => inputs[id] || null }
  };
  ctx.window = ctx;
  vm.runInNewContext(projectField, ctx);
  const html = ctx.rimbookProjectInput("x-project", "p1", "المشروع");
  assert.ok(html.includes('<input id="x-project"') && html.includes("datalist") && !html.includes("<select") && !html.includes("عام"), "project field must be a typed input with suggestions and no default general project");
  assert.equal(ctx.rimbookProjectFromInput("x-project"), null, "missing field means no project");
  inputs["x-project"] = { value: "   " };
  assert.equal(ctx.rimbookProjectFromInput("x-project"), null, "blank name means no project");
  inputs["x-project"] = { value: "مشروع  البناء" };
  assert.equal(ctx.rimbookProjectFromInput("x-project"), "p1", "typed name of an existing project reuses it");
  assert.equal(store.projects.length, 1);
  inputs["x-project"] = { value: "برج الأمل" };
  const created = ctx.rimbookProjectFromInput("x-project");
  assert.ok(created && store.projects.length === 2 && store.projects[1].name === "برج الأمل", "a new typed name creates the project");
  assert.equal(ctx.rimbookProjectFromInput("x-project"), created, "saving twice must not duplicate the project");
  assert.equal(store.projects.length, 2);
}

{
  const result = goalProgress(2, 10);
  assert.equal(result.percent, 20);
  assert.equal(result.remaining, 8);
  assert.equal(result.exceeded, false);
}

{
  const result = goalProgress(12, 10);
  assert.equal(result.percent, 100);
  assert.equal(result.remaining, 0);
  assert.equal(result.exceeded, true);
}

{
  const result = goalProgress(-4, 0);
  assert.equal(result.done, 0);
  assert.equal(result.total, 0);
  assert.equal(result.percent, 0);
}

assert.ok(activation.includes("const secondary=Object.keys(VIEWS);"), "worker accounts must be able to open every available notebook screen");
assert.match(activation, /ماذا تريد أن تنجز؟/);
assert.match(activation, /كم تريد أن تنجز؟/);
assert.match(activation, /كم أنجزت حتى الآن؟/);
assert.match(activation, /حفظ الإنجاز/);
assert.ok(activation.includes("toggleGoalCustomUnit(this.value)"));
assert.ok(activation.includes("gcustomunit-label"));
assert.ok(activation.includes("rimbookProjectInput(\"projectId\""), "activation forms must use the typed project field");
assert.match(activation, /saveProfilePhoto\(this\)/);
assert.match(activation, /saveProfileField\(/);
assert.match(pro, /home-profile/);
assert.ok(activation.includes('id="profile-worker"') && activation.includes("saveProfileForm()"), "workers must be able to link their own worker record and explicitly save profile data");
assert.ok(workforce.includes('["about","حول التطبيق","info"]'), "About must be reachable from the More menu");
assert.ok(workforce.includes('["about","دليل الاستخدام","book-open"]'), "Managers must also be able to open the About user guide");
assert.ok(pro.includes('id="ppname"') && pro.includes("proAddProject()"), "project creation must provide a writable project-name field");
assert.ok(indexHtml.includes("overflow-x:hidden") && indexHtml.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "mobile layout must constrain horizontal overflow");
assert.ok(activation.includes("window.shareRimbook=async"), "Rimbook must expose native share action with fallback");
assert.ok(activation.includes("VIEWS.share="), "Share app must have a real screen action");
assert.ok(workforce.includes('["share","مشاركة التطبيق","share-2"]'), "Share app must be reachable from More menu");
assert.ok(indexHtml.includes("env(safe-area-inset-bottom"), "mobile screens must reserve space for Android navigation controls");
{
  const appFilesMatch = serviceWorker.match(/const APP_FILES = \[([\s\S]*?)\];/);
  assert.ok(appFilesMatch, "service worker must define an explicit offline app shell");
  const cachedFiles = Array.from(appFilesMatch[1].matchAll(/"([^"]+)"/g), match => match[1]);
  const scriptFiles = Array.from(indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g), match => match[1]);
  for (const script of scriptFiles) {
    assert.ok(cachedFiles.includes(script), "every local application script must be precached for offline launch: " + script);
  }
  assert.ok(serviceWorker.includes("rimbook-pwa-v32"), "offline cache must be versioned when the app shell changes");
}
{
  const routeSources = [activation, workforce, pro, invoices, receipts, purchases, contactsSource, currencySource, notebook, push, backup, offlineSpeechBridge, aboutGuideSource];
  const routeNames = ["tasks","payroll","contacts","purchases","invoices","rates","stats","profile","settings","sync","integrations","share","about"];
  const combined = routeSources.join("\\n");
  for (const route of routeNames) {
    assert.ok(combined.includes("VIEWS." + route + "=") || combined.includes("VIEWS." + route + " ="), "More-menu destination must have a real screen: " + route);
  }
}

assert.match(activation, /project:selectedProject\(\)/);
assert.ok(activation.includes('row.status="archived"') && activation.includes("archivedAt=Date.now()"), "archiving must preserve project-linked records instead of detaching them");
assert.ok(pro.includes('rimbookProjectFromInput("pproject")'), "task form must resolve the typed project name");
assert.ok(pro.includes('aria-label="فتح الملف الشخصي"'));
assert.ok(!pro.includes('id="proSearch"'), "only one unified search box should be installed");
assert.ok(app.includes("RB.data.goals||[]"));
assert.ok(app.includes("RB.data.habits||[]"));
assert.ok(app.includes('kind==="goal"'));
assert.ok(app.includes('event:"موعد"'));
assert.match(pro, /pill\("مباشر","ok"\)/);

assert.ok(activation.includes('row.type==="work"'));
assert.ok(activation.includes("بقيد عكسي موثق"));
assert.ok(voiceLedger.includes('row.type==="work"'));
assert.ok(voiceLedger.includes("لن يؤثر ذلك في أي حركة مالية"));
assert.ok(invoices.includes("الحذف النهائي للفواتير متوقف"));
assert.ok(activation.includes('row.status="archived"') && activation.includes("archivedAt=Date.now()"), "archiving keeps project history intact");
assert.ok(activation.includes("reverseWorkEntry"));
assert.ok(voiceLedger.includes("تصحيح بقيد عكسي"));
assert.ok(voiceLedger.includes("تم عكسه بقيد موثق"));
assert.ok(voiceLedger.includes("countedRows.filter(w=>w.k===\"work\")"));
assert.ok(receipts.includes("ملغى بقيد عكسي موثق"));
assert.ok(receipts.includes('worker_payment:"تسديد أجر عامل"') && receipts.includes('worker_advance:"سلفة عامل"'), "worker payroll movements must be eligible for linked receipts");
assert.ok(receipts.includes('Number(x.workerPaid)||0') && receipts.includes('Number(x.workerAdvance)||0'), "worker receipts must print the exact payroll payment or advance amount");
assert.ok(receipts.includes('const available=RB.all("work").filter(x=>["payment","advance","expense","worker_payment","worker_advance"]'), "worker payroll movements must appear in the receipt attachment selector");

{
  const data = { items: [{ type: "work", id: "pay-1", k: "payment", d: "2026-11-20", rec: 100, due: 0, advance: 0, expense: 0, ds: "دفعة" }] };
  const result = applyWorkReversal(data, "pay-1", "المبلغ أُدخل خطأ", 1234, "rev-1");
  assert.equal(result.ok, true);
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].rec, 100, "original amount must remain unchanged");
  assert.equal(data.items[0].reversedBy, "rev-1");
  assert.equal(data.items[1].rec, -100, "reversal must offset the original amount");
  assert.equal(data.items[1].reversalOf, "pay-1");
  assert.equal(data.items[1].correctionReason, "المبلغ أُدخل خطأ");
  assert.equal(data.items.reduce((sum, row) => sum + row.rec, 0), 0, "net received amount must return to zero");
  const duplicate = applyWorkReversal(data, "pay-1", "محاولة ثانية", 2345, "rev-2");
  assert.equal(duplicate.ok, false, "an original entry can only be reversed once");
  assert.equal(data.items.length, 2);
  const reverseOfReverse = applyWorkReversal(data, "rev-1", "محاولة عكس العكس", 3456, "rev-3");
  assert.equal(reverseOfReverse.ok, false, "a reversal entry cannot itself be reversed");
  assert.equal(data.items.length, 2);
}

{
  const data = { items: [{ type: "work", id: "work-1", k: "work", due: 75, overtimePay: 15, otHours: 1.5, normalHours: 8 }] };
  const result = applyWorkReversal(data, "work-1", "تصحيح ساعات العمل", 1234, "rev-work");
  assert.equal(result.ok, true);
  assert.equal(data.items[1].due, -75);
  assert.equal(data.items[1].overtimePay, -15);
  assert.equal(data.items[1].otHours, -1.5);
  assert.equal(data.items[1].normalHours, -8);
  assert.equal(data.items.reduce((sum, row) => sum + row.due, 0), 0, "net due must be offset");
}

{
  const data = { items: [{ type: "work", id: "pay-2", k: "payment", rec: 10 }] };
  const result = applyWorkReversal(data, "pay-2", "لا", 1234, "rev-short");
  assert.equal(result.ok, false, "a meaningful reason is required");
  assert.equal(data.items.length, 1, "invalid correction must not change data");
}

assert.ok(pro.includes('if(profile.role==="worker")'), "worker must receive a dedicated simplified home screen");
for (const action of ["work", "holiday", "payment", "advance", "expense"]) {
  assert.ok(pro.includes("voiceLedgerQuick(\\'" + action + "\\')"), "worker home must expose the " + action + " quick action");
}
assert.ok(pro.includes("voiceLedgerStart()"), "worker home must expose speech input");
assert.ok(pro.includes("مراجعة حسابي وسجل الحركات"), "worker home must provide a clear route to their ledger");
assert.ok(voiceLedger.includes("راجع ما فهمه التطبيق قبل الحفظ"), "speech entries must be reviewed before saving");


const attendanceStart = voiceLedger.indexOf('const ATTENDANCE=');
const attendanceEnd = voiceLedger.indexOf("\n}", voiceLedger.indexOf("function hasAttendance", attendanceStart)) + 2;
assert.ok(attendanceStart >= 0 && attendanceEnd > attendanceStart, "attendance duplicate helper must exist");
const attendanceSource = voiceLedger.slice(attendanceStart, attendanceEnd);

{
  const confirmStart = voiceLedger.indexOf("window.voiceLedgerConfirm=function(){");
  const confirmEnd = voiceLedger.indexOf("\n};", confirmStart);
  assert.ok(confirmStart >= 0 && confirmEnd > confirmStart, "voice confirmation handler must exist");
  const confirmSource = voiceLedger.slice(confirmStart, confirmEnd + 3);
  function voiceConfirmHarness(saveOk) {
    const data = { items: [] };
    let rendered = 0;
    const messages = [];
    const context = {
      pending: { date: "2026-11-21", raw: "اليوم عمل واصل دفعة 10", items: [
        { k: "work", d: "2026-11-21", due: 50 },
        { k: "payment", d: "2026-11-21", rec: 10 }
      ] },
      window: {},
      D: {
        profile: { role: "owner", workerId: null },
        settings: { dailyRate: 50, holidayPayPercent: 0, normalHoursPerDay: 8, overtimeEnabled: false, otRate: 0 },
        workers: [],
        items: []
      },
      RB: { transact(mutator) { if (!saveOk) return false; mutator(data); return true; } },
      render() { rendered++; },
      toast(message) { messages.push(message); },
      Date,
      Math
    };
    vm.runInNewContext(attendanceSource + confirmSource + ";", context);
    return { context, data, messages, get rendered() { return rendered; } };
  }
  const failed = voiceConfirmHarness(false);
  failed.context.window.voiceLedgerConfirm();
  assert.equal(failed.data.items.length, 0, "failed voice save must not append partial entries");
  assert.ok(failed.context.pending, "failed voice save must keep the review available for retry");
  assert.equal(failed.rendered, 0, "failed voice save must not advance the screen");
  const succeeded = voiceConfirmHarness(true);
  succeeded.context.window.voiceLedgerConfirm();
  assert.equal(succeeded.data.items.length, 3, "two parsed entries and one voice audit log must save together");
  assert.equal(succeeded.data.items[0].voiceText, "اليوم عمل واصل دفعة 10");
  assert.equal(succeeded.data.items[2].type, "voice_log");
  assert.equal(succeeded.context.pending, null, "successful voice save must clear the pending review");
  assert.equal(succeeded.rendered, 1);
}

{
  const parseStart = voiceLedger.indexOf("function parseSpoken(raw){");
  const parseEnd = voiceLedger.indexOf("\n}", parseStart);
  assert.ok(parseStart >= 0 && parseEnd > parseStart, "voice parser must be extractable for worker isolation tests");
  const parseSource = voiceLedger.slice(parseStart, parseEnd + 2);
  const parseWorkerVoice = vm.runInNewContext("(" + parseSource + ")", {
    normalize: value => String(value || "").toLowerCase(),
    today: () => "2026-11-21",
    iso: date => date.toISOString().slice(0,10),
    Date,
    D: {
      profile: { role: "worker", workerId: "w1" },
      workers: [{ id: "w1", name: "علي", active: true }, { id: "w2", name: "سليم", active: true }],
      projects: [],
      settings: { dailyRate: 50, holidayPayPercent: 0 }
    },
    window: { rimbookWorkerDailyRate: () => 50 }
  });
  const otherWorker = parseWorkerVoice("عمل سليم");
  assert.match(otherWorker.error, /لا يمكنك تسجيل حركة باسم عامل آخر/);
  const ownWorker = parseWorkerVoice("عمل");
  assert.equal(ownWorker.items[0].workerId, "w1", "worker voice entries without a spoken name must use the linked worker");
  assert.equal(ownWorker.items[0].person, "علي");
}

{
  const confirmStart = voiceLedger.indexOf("window.voiceLedgerConfirm=function(){");
  const confirmEnd = voiceLedger.indexOf("\n};", confirmStart);
  const confirmSource = voiceLedger.slice(confirmStart, confirmEnd + 3);
  const data = { items: [] };
  {
    const messages = [];
    const ctx = {
      pending: null,
      window: {},
      D: { profile: { role: "owner" }, workers: [], settings: { dailyRate: 50, holidayPayPercent: 0, normalHoursPerDay: 8 }, items: data.items },
      RB: { transact(mutator) { mutator(data); return true; } },
      render() {}, toast(m) { messages.push(m); }, Date, Math
    };
    vm.runInNewContext(attendanceSource + confirmSource + ";", ctx);
    const say = k => { ctx.pending = { date: "2026-11-21", raw: k, items: [{ k, d: "2026-11-21", due: 50 }] }; ctx.window.voiceLedgerConfirm(); };
    say("work"); say("work"); say("holiday");
    assert.equal(data.items.filter(x => x.type === "work").length, 1, "attendance must be accepted once per day even when no worker is named");
    assert.ok(messages.some(m => /مرة|واحد/.test(m)), "the duplicate must be explained to the user");
    data.items.length = 0;
  }
  const context = {
    pending: { date: "2026-11-21", raw: "دفعة 25", items: [{ k: "payment", d: "2026-11-21", rec: 25, workerId: "w2", person: "سليم" }] },
    window: {
      rimbookWorkerDailyRate: () => 50,
      rimbookCalculateWorkerPay: () => ({ workerDue: 0, overtimePay: 0 })
    },
    D: {
      profile: { role: "worker", workerId: "w1" },
      workers: [{ id: "w1", name: "علي", active: true }, { id: "w2", name: "سليم", active: true }],
      settings: { dailyRate: 50, holidayPayPercent: 0, normalHoursPerDay: 8, overtimeEnabled: false, otRate: 0 },
      items: data.items
    },
    RB: { transact(mutator) { mutator(data); return true; } },
    render() {},
    toast() {},
    Date,
    Math
  };
  vm.runInNewContext(attendanceSource + confirmSource + ";", context);
  context.window.voiceLedgerConfirm();
  assert.equal(data.items[0].workerId, "w1", "worker confirmation must override any submitted worker id with the linked identity");
  assert.equal(data.items[0].person, "علي", "worker confirmation must use the linked worker name");
  assert.equal(data.items[1].workerId, "w1", "the voice audit log must remain linked to the same worker");
}

assert.ok(workforce.includes("VIEWS.workers"), "worker directory must be part of the app");
assert.ok(workforce.includes("VIEWS.workday"), "daily attendance must be part of the app");
assert.ok(workforce.includes("VIEWS.payroll"), "monthly payroll statement must be part of the app");
assert.ok(workforce.includes('wageType === "weekly"'), "weekly wages must be converted using configured workdays");
assert.ok(workforce.includes('wageType === "monthly"'), "monthly wages must be converted using configured workdays");
assert.ok(workforce.includes("workerDue") && workforce.includes("workerPaid") && workforce.includes("workerAdvance"), "worker accruals, payments and advances must remain separate");
assert.ok(workforce.includes("ستبقى جميع سجلاته وحساباته محفوظة"), "worker archiving must preserve historical accounts");
assert.ok(notebook.includes("VIEWS.notebook"), "notes, appointments and reminders must share one notebook screen");
assert.ok(notebook.includes("delete VIEWS.habits") && notebook.includes("delete TABS.habits"), "habits must be removed from the active app");
assert.ok(notebook.includes('agenda: "notebook"') && notebook.includes('notes: "notebook"') && notebook.includes('reminders: "notebook"'), "old navigation links must resolve to the unified notebook");
assert.ok(push.includes("event.reminderEnabled===false") && push.includes("if(!event.t||event.reminderEnabled===false)return"), "disabled or untimed reminders must not notify");
assert.ok(pro.includes("مستحقات العمال المتبقية") && pro.includes("إدارة العمال واليومية"), "management dashboard must show worker payroll and routes");
assert.ok(pro.includes("window.rimbookWorkerSummary(worker.id,workerMonth)") && workforce.includes("window.rimbookWorkerSummary = summary"), "worker home balance must use the same cumulative carry-forward calculation as payroll");


assert.ok(backup.includes("collectRimbookBackup") && backup.includes("restoreRimbookBackup"), "one full backup and restore format must be shared across the app");
assert.ok(backup.includes("ATT_DB.get") && backup.includes("ATT_DB.put"), "full backups must include and restore IndexedDB attachments");
assert.ok(backup.includes("function validateFullBackupPayload(payload)") &&
  backup.includes("payload.version > VERSION") &&
  backup.includes("seen.has(item.aid)") &&
  backup.includes("item.size !== blob.size"),
  "full backup restore must validate version, duplicate attachment IDs and exact attachment sizes before writing");
assert.ok(backup.includes("const previous = new Map()") &&
  backup.includes("const written = []") &&
  backup.includes("rollbackErrors") &&
  backup.includes("await ATT_DB.del(aid)"),
  "failed full backup restore must roll back changed attachments and remove newly-created ones");
assert.ok(backup.includes("return restoreFullBackupPayload(payload)"),
  "full backup restore must use the validated rollback-safe restore path");
assert.ok(backup.includes("backupEncrypted") && backup.includes("gdriveUpload") && backup.includes("shareFileWhatsApp"), "encrypted, Google Drive and WhatsApp backup routes must use full backups");
assert.ok(integrations.includes("window.collectRimbookBackup()") && integrations.includes("if(!response.ok)"), "Dropbox must upload a full backup including attachments and check HTTP response status");
assert.ok(integrations.includes("rimbook-full-backup.json") && integrations.includes("!result.ok"), "Telegram must send a full backup and verify the API result");
assert.ok(integrations.includes("ليس مزامنة تلقائية"), "Google Drive must be described as manual backup rather than continuous sync");
assert.ok(integrations.includes("if(!response.ok)") && integrations.includes("Notion رفض إنشاء الملاحظة"), "Notion must not report success when its API rejects a note");
assert.ok(integrations.includes("لم يُختبر تسجيل الدخول إلى Google Drive بعد"), "Google Drive setup must not be reported as a successful connection test");
assert.ok(integrations.includes("const saved = RB.transact") && integrations.includes("if(!allowed.has(key))"), "integration settings must validate keys and report success only after a committed save");
assert.ok(!/firebase|fbApiKey|customDomain/i.test(integrations), "Firebase and domain integrations must be removed before implementation");
assert.ok(app.includes('sync:["🔄","نسخ ونقل"]'), "manual backup and device transfer must not be mislabeled as automatic synchronization");
assert.ok(aboutGuideSource.includes("لا تتضمن النسخ الاحتياطية كلمات مرور أو رموز وصول"), "the user guide must explain that integration secrets are excluded from backups");
assert.ok(sync.includes("rimbook-backup-chunk") && sync.includes("restoreRimbookBackup"), "direct device transfer must carry and restore chunked full backups");
assert.ok(sync.includes("waitForIceGatheringComplete") && sync.includes("waitForDataChannelCapacity"), "device transfer must wait for complete ICE candidates and apply data-channel backpressure");
assert.ok(sync.includes("RTC_MAX_TRANSFER_CHARS = 40 * 1024 * 1024") && sync.includes("maxTotalAttachmentBytes: 25 * 1024 * 1024"), "device transfer must enforce mobile-safe size limits before allocating large buffers");
assert.ok(backup.includes("maxTotalAttachmentBytes") && backup.includes("حجم المرفقات يتجاوز الحد المسموح لهذه العملية"), "backup collection must support an attachment cap before reading blobs");
assert.ok(!sync.includes("setTimeout(r, 1500)"), "manual fixed delays must not be used instead of waiting for ICE gathering");
assert.ok(activation.includes("backupLocal()") && activation.includes("backupZip()") && activation.includes("backupEncrypted()") && activation.includes("shareViaAny()"), "backup settings must expose complete backup and sharing actions");
{
  const data = { items: [{ type: "work", id: "worker-pay", k: "worker_payment", workerId: "w1", workerDue: 120, workerPaid: 30, workerAdvance: 10, lateHours: 1 }] };
  const result = applyWorkReversal(data, "worker-pay", "تصحيح دفعة العامل", 4567, "worker-rev");
  assert.equal(result.ok, true);
  assert.equal(data.items[1].workerDue, -120);
  assert.equal(data.items[1].workerPaid, -30);
  assert.equal(data.items[1].workerAdvance, -10);
  assert.equal(data.items[1].lateHours, -1);
  assert.equal(data.items[1].workerId, "w1");
  const invoicePayment = {items:[{type:"work",id:"invoice-pay",k:"payment",invoiceId:"inv-9",invoiceNumber:"0009",rec:25}]};
  const invoiceResult = applyWorkReversal(invoicePayment,"invoice-pay","تصحيح قبض فاتورة",5678,"invoice-rev");
  assert.equal(invoiceResult.ok,true);
  assert.equal(invoicePayment.items[1].invoiceId,"inv-9","invoice payment reversals must remain linked to the original invoice");
  assert.equal(invoicePayment.items.reduce((sum,row)=>sum+(Number(row.rec)||0),0),0,"reversing an invoice payment must restore its outstanding balance");
}


assert.ok(voiceLedger.includes("window.voiceAudioStart") && voiceLedger.includes("new MediaRecorder"), "the worker voice log must record original microphone audio");
assert.ok(voiceLedger.includes("window.voiceAudioPlay") && voiceLedger.includes("voice-audio-"), "the worker voice log must support playback of saved audio");
assert.ok(voiceLedger.includes("attachments:[{aid,name,type,size:blob.size}]"), "recorded audio must be linked to the backup attachment system");


assert.ok(backup.includes("buildStoredZip") && backup.includes("parseStoredZip"), "full ZIP backup and restore must be implemented");
assert.ok(backup.includes("window.backupZip") && backup.includes("window.restoreZip"), "ZIP actions must be callable from settings");
assert.ok(activation.includes("backupZip()") && activation.includes("restoreZip(this)"), "settings must expose ZIP export and restore");
assert.ok(activation.includes("rimbookCoreSettingsView"), "the settings hub must preserve storage/payroll settings and link to advanced centers");
assert.ok(activation.includes("profile-worker") && app.includes('"workerId"'), "a worker profile must link to its worker record");
assert.ok(pro.includes("profile.workerId") && voiceLedger.includes("workerId=workerMatch?.id"), "worker personal views and voice records must be associated with the correct worker");


assert.ok(purchases.includes("VIEWS.purchases") && purchases.includes("addRimbookPurchase"), "purchases and materials must have a real management screen");
assert.ok(purchases.includes("addPurchasePayment") && purchases.includes("cancelRimbookPurchase"), "supplier payments and cancellations must be recorded rather than deleting purchases");
assert.ok(purchases.includes("window.rimbookProjectPurchasesTotal"), "purchases must roll up into project costs");
assert.ok(purchases.includes("window.rimbookPurchaseAccounting = purchaseAccounting") && pro.includes("window.rimbookPurchaseAccounting(p).remaining"), "dashboard purchase balances must reuse the same integer-cent accounting as the purchase ledger");
assert.ok(app.includes('target.type === "work"') && app.includes("لا يمكن حذف حركة عمل أو حساب"), "financial work records must be protected from hard deletion");
assert.ok(activation.includes('row.status="archived"') && activation.includes("archivedAt=Date.now()"), "project archival must preserve linked records in the active override");
assert.ok(!activation.includes("data.projects=data.projects.filter(p=>p.id!==id)"), "archiving must not hard-delete projects");
assert.ok(pro.includes('id="ptworker"') && workforce.includes("VIEWS.tasks = function"), "tasks must be assignable to workers and filtered in worker view");
assert.ok(pro.includes("purchasesCost") && pro.includes("supplierBalance"), "project and financial reports must include purchases and supplier balances");
assert.ok(pro.includes("recordedCosts=Math.round((payroll+expenses+purchasesCost)*100)/100") && pro.includes("فرق الفواتير عن التكاليف (مؤشر غير نهائي)"), "project cards must total recorded costs and clearly avoid presenting the comparison as net profit");
assert.ok(pro.includes("إجمالي الفواتير") && pro.includes("المقبوض على الفواتير") && pro.includes("مقبوضات غير مرتبطة بفواتير"), "project cards must separate invoiced revenue, invoice collections and unlinked receipts");
assert.ok(pro.includes("window.rimbookInvoiceSummary(i).remaining>0") && pro.includes("invoiceOutstanding="), "unpaid invoice balances must be reflected separately in project receivables without double-counting work-ledger dues");
assert.ok(workforce.includes('["purchases","المشتريات والمواد"') && workforce.includes('ROLES.worker.tabs=["home","projects","agenda","tasks","ledger","voice","more"]'), "main navigation must keep all notebook functions available to worker accounts");


const payrollMonthEnd = extractFunction(workforce, "monthEndDate");
const payrollValidDate = extractFunction(workforce, "isValidLedgerDate");
const payrollSummary = extractFunction(workforce, "summary", {
  isValidLedgerDate:payrollValidDate,
  monthEndDate:payrollMonthEnd,
  workRows:id=>[
    {id:"w1",d:"2026-10-15",k:"work",workerDue:100},
    {id:"w1",d:"2026-11-05",k:"worker_payment",workerPaid:80},
    {id:"w1",d:"2026-11-10",k:"worker_advance",workerAdvance:10},
    {id:"w1",d:"2026-12-02",k:"worker_payment",workerPaid:20}
  ]
});
{
  const november=payrollSummary("w1","2026-11");
  assert.equal(november.due,0,"monthly earned wages must remain attributed to their work month");
  assert.equal(november.paid,80);
  assert.equal(november.advances,10);
  assert.equal(november.balance,10,"the monthly payroll balance must carry forward unpaid prior-month wages");
  const december=payrollSummary("w1","2026-12");
  assert.equal(december.balance,-10,"cumulative balances must include later payments and show overpayment if present");
}
{
  const rows=[
    {id:"w2",d:"2024-02-28",k:"work",workerDue:100},
    {id:"w2",d:"2024-02-29",k:"work",workerDue:50},
    {id:"w2",d:"2024-03-01",k:"worker_payment",workerPaid:40},
    {id:"w2",d:"2024-02-30",k:"worker_payment",workerPaid:999}
  ];
  const summaryFor=extractFunction(workforce,"summary",{monthEndDate:payrollMonthEnd,isValidLedgerDate:payrollValidDate,workRows:()=>rows});
  assert.equal(summaryFor("w2","2024-02").due,150,"monthly accrual totals must exclude impossible dates too");
  assert.equal(summaryFor("w2","2024-02").balance,150,
    "leap-year February carry-forward must include Feb 29 but exclude March 1 and impossible Feb 30");
  assert.equal(summaryFor("w2","2024-03").balance,110,
    "March balance must carry the valid February wages and include March payments");
  assert.equal(summaryFor("w2","2024-13").balance,0,
    "an invalid payroll month must not include arbitrary ledger rows");
  assert.equal(summaryFor("w2","2023-02").balance,0,
    "a non-leap February must end on February 28");
}
const calculateWorkerPay = extractFunction(workforce, "calculateWorkerPay");
{
  const fullDay = calculateWorkerPay("work", 100, 8, 0, 8, 2, 15, true, 50);
  assert.deepEqual({...fullDay}, {base:100, overtimePay:30, workerDue:130}, "full day plus two overtime hours");
  const lateDay = calculateWorkerPay("work", 100, 8, 2, 8, 2, 15, true, 50);
  assert.deepEqual({...lateDay}, {base:75, overtimePay:30, workerDue:105}, "late hours reduce base accrual");
  const holiday = calculateWorkerPay("holiday", 100, 8, 0, 8, 2, 15, true, 50);
  assert.deepEqual({...holiday}, {base:50, overtimePay:0, workerDue:50}, "holiday must never receive work overtime pay");
  const absence = calculateWorkerPay("absence", 100, 8, 0, 8, 2, 15, true, 50);
  assert.deepEqual({...absence}, {base:0, overtimePay:0, workerDue:0}, "absence must not accrue base or overtime");
  const disabled = calculateWorkerPay("work", 100, 8, 0, 8, 2, 15, false, 50);
  assert.deepEqual({...disabled}, {base:100, overtimePay:0, workerDue:100}, "disabled overtime must record no overtime pay");
  const invalidRates = calculateWorkerPay("work", -100, 8, -2, 8, 2, -15, true, 50);
  assert.deepEqual({...invalidRates}, {base:0,overtimePay:0,workerDue:0},"negative wage and overtime rates must never create negative pay or inflate hours");
  const invalidPlan = calculateWorkerPay("work",100,8,0,-8,2,15,true,50);
  assert.deepEqual({...invalidPlan},{base:100,overtimePay:30,workerDue:130},"an invalid planned-hours setting must fall back safely instead of multiplying wages");
  const infiniteInputs = calculateWorkerPay("work",Infinity,8,0,8,Infinity,Infinity,true,50);
  assert.deepEqual({...infiniteInputs},{base:0,overtimePay:0,workerDue:0},"non-finite wage and overtime values must never enter payroll totals");
}
assert.ok(workforce.includes("normalHours > planned"), "normal hours cannot exceed configured standard hours");
assert.ok(workforce.includes("!x.reversedBy).length"), "reversed holidays and absences must not remain counted");


const invoiceTotals = extractFunction(invoiceCode, "invoiceTotals", {invoiceCents:value=>Math.round((Number(value)||0)*100)});
let invoiceLedgerRows=[];
const invoicePaymentSummary = extractFunction(invoiceCode, "invoicePaymentSummary", {
  RB:{all:()=>invoiceLedgerRows},
  invoiceTotals:inv=>invoiceTotals(inv),
  invoiceCents:value=>Math.round((Number(value)||0)*100)
});
{
  const totals=invoiceTotals({items:[{qty:3,price:0.1},{qty:2,price:0.2}],tax:5,discount:0});
  assert.deepEqual({...totals},{sub:0.7,tax:0.04,disc:0,total:0.74},"invoice totals must round to cents without floating-point drift");
  const invoice={id:"inv-1",items:[{qty:2,price:50}],paid:false};
  assert.deepEqual({...invoicePaymentSummary(invoice)},{total:100,paid:0,remaining:100,overpaid:0,status:"unpaid",paymentRows:0});
  invoiceLedgerRows=[{invoiceId:"inv-1",rec:25}];
  assert.deepEqual({...invoicePaymentSummary(invoice)},{total:100,paid:25,remaining:75,overpaid:0,status:"partial",paymentRows:1},"partial receipts must reduce only the matching invoice balance");
  invoiceLedgerRows=[{invoiceId:"inv-1",rec:100}];
  assert.deepEqual({...invoicePaymentSummary(invoice)},{total:100,paid:100,remaining:0,overpaid:0,status:"paid",paymentRows:1},"full receipts must close the invoice");
  invoiceLedgerRows=[{invoiceId:"inv-1",rec:100},{invoiceId:"inv-1",rec:-100}];
  assert.deepEqual({...invoicePaymentSummary(invoice)},{total:100,paid:0,remaining:100,overpaid:0,status:"unpaid",paymentRows:2},"reversing a receipt must restore the invoice balance");
  invoiceLedgerRows=[{invoiceId:"inv-1",rec:110}];
  assert.equal(invoicePaymentSummary(invoice).overpaid,10,"excess customer receipts must be surfaced instead of silently hidden");
}
const customerInvoiceSummary = extractFunction(invoiceCode, "customerInvoiceSummary", {
  invoicePaymentSummary,
  invoiceCents:value=>Math.round((Number(value)||0)*100)
});
{
  const customers=[
    {id:"c1",type:"client",name:"شركة النور"},
    {id:"c2",type:"client",name:"شركة النور"},
    {id:"c3",type:"client",name:"عميل منفرد"}
  ];
  const invoices=[
    {id:"ci-1",clientContactId:"c1",client:"شركة النور",items:[{qty:1,price:100}]},
    {id:"ci-2",client:"عميل منفرد",items:[{qty:2,price:25}]},
    {id:"ci-3",client:"شركة النور",items:[{qty:1,price:900}]}
  ];
  invoiceLedgerRows=[{invoiceId:"ci-1",rec:30}];
  assert.deepEqual({...customerInvoiceSummary(customers[0],invoices,customers)},
    {invoices:1,total:100,paid:30,remaining:70,overpaid:0,unpaid:0,partial:1,paidInvoices:0},
    "customer account must aggregate invoices explicitly linked to the contact");
  assert.deepEqual({...customerInvoiceSummary(customers[2],invoices,customers)},
    {invoices:1,total:50,paid:0,remaining:50,overpaid:0,unpaid:1,partial:0,paidInvoices:0},
    "a unique exact customer name may safely link a legacy invoice without a contact id");
  assert.equal(customerInvoiceSummary(customers[1],invoices,customers).invoices,0,
    "legacy invoices must not be ambiguously assigned when multiple customers share a name");
}
assert.ok(invoiceCode.includes("window.rimbookCustomerInvoiceSummary") &&
  contactsSource.includes("window.rimbookCustomerInvoiceSummary(c)") &&
  contactsSource.includes("المتبقي على العميل"),
  "customer contact cards must show invoice balances from the shared invoice ledger");

const purchaseAccounting = extractFunction(purchases, "purchaseAccounting", {
  cents: value => Math.round((Number(value) || 0) * 100)
});
const supplierSummary = extractFunction(purchases, "supplierSummary", {
  purchaseAccounting,
  cents: value => Math.round((Number(value) || 0) * 100)
});
const appendPurchaseRefund = extractFunction(purchases, "appendPurchaseRefund", {
  cents: value => Math.round((Number(value) || 0) * 100)
});
{
  const active = purchaseAccounting({total:0.1+0.2,payments:[{amount:0.1},{amount:0.1}],refunds:[],status:"active"});
  assert.deepEqual({...active}, {paid:0.2, refunded:0, remaining:0.1, netCost:0.3, supplierBalance:0.1}, "supplier balance must use integer cents");
  const cancelled = purchaseAccounting({total:100,payments:[{amount:60}],refunds:[{amount:20}],status:"cancelled"});
  assert.deepEqual({...cancelled}, {paid:60, refunded:20, remaining:0, netCost:40, supplierBalance:0}, "cancelled purchase cost must equal paid minus refunded, with no open supplier liability");
  const legacy = {payments:[{amount:60}],refunds:[{amount:10}]};
  assert.equal(appendPurchaseRefund(legacy,20,"2026-11-21","ref-2"),true,"a further partial refund within the unpaid refund limit must be accepted");
  assert.deepEqual(legacy.refunds.map(x=>x.amount),[10,20],"new refunds must append without overwriting historical refunds");
  assert.equal(appendPurchaseRefund(legacy,31,"2026-11-21","ref-3"),false,"cumulative refunds must never exceed the amount actually paid");
  assert.equal(legacy.refunds.length,2,"a rejected over-refund must not alter the refund history");
  assert.equal(appendPurchaseRefund(legacy,0,"2026-11-21","ref-4"),true,"a cancellation with no additional refund must preserve history");
  assert.equal(legacy.refunds.length,2);
  const suppliers=supplierSummary("s1",[
    {contactId:"s1",total:100,payments:[{amount:25}],refunds:[],status:"active"},
    {contactId:"s1",total:50,payments:[{amount:50}],refunds:[],status:"active"},
    {contactId:"s1",total:40,payments:[{amount:30}],refunds:[{amount:10}],status:"cancelled"},
    {contactId:"s2",total:900,payments:[],refunds:[],status:"active"}
  ]);
  assert.deepEqual({...suppliers},{purchases:3,total:190,paid:105,refunded:10,netCost:170,outstanding:75,cancelled:1},"supplier account must aggregate only purchases linked to that contact and reuse cancellation/refund accounting");
}
assert.ok(purchases.includes("window.rimbookSupplierSummary") && contactsSource.includes("window.rimbookSupplierSummary(c.id)"), "supplier contact cards must show balances from the shared purchasing ledger");
assert.ok(pro.includes("window.rimbookPurchaseAccounting?window.rimbookPurchaseAccounting(p)") , "financial reports must reuse purchase-ledger accounting");
assert.ok(pro.includes("window.rimbookFinancialSummary") && pro.includes("مقبوضات غير مرتبطة بفواتير"), "financial reporting must separate invoice receivables from unlinked cash and operating accounts");
{
  const start = pro.indexOf("function rimbookFinancialSummary(");
  const end = pro.indexOf("\n}", start);
  assert.ok(start >= 0 && end > start, "financial summary helper must exist");
  const summarySource = pro.slice(start, end + 2);
  const summarize = vm.runInNewContext("(" + summarySource + ")");
  const workRows = [
    { rec: 25, invoiceId: "i1" },
    { rec: 10 },
    { due: 80 },
    { workerDue: 100 },
    { workerPaid: 40 },
    { workerAdvance: 10 },
    { expense: 15 }
  ];
  const invoices = [{ id: "i1" }, { id: "i2" }];
  const invoiceSummary = invoice => invoice.id === "i1"
    ? { total: 100, paid: 25, remaining: 75 }
    : { total: 50, paid: 50, remaining: 0 };
  const purchases = [{ total: 60, payments: [{ amount: 40 }], refunds: [] }];
  const purchaseSummary = purchase => ({
    paid: 40, refunded: 0, netCost: 60, supplierBalance: 20
  });
  const result = summarize(workRows, invoices, purchases, invoiceSummary, purchaseSummary);
  assert.equal(result.invoiceTotal, 150, "invoice totals must come from actual invoices, not generic work-ledger dues");
  assert.equal(result.invoicePaid, 75);
  assert.equal(result.invoiceRemaining, 75);
  assert.equal(result.cashReceived, 35, "cash received must include linked and unlinked receipts once");
  assert.equal(result.unlinkedReceipts, 10);
  assert.equal(result.unlinkedDue, 80, "non-invoiced dues must remain a separate legacy/work-ledger balance");
  assert.equal(result.payrollBalance, 50, "worker payroll liability must remain separate from customer receivables");
  assert.equal(result.purchaseCost, 60);
  assert.equal(result.supplierBalance, 20);
  assert.equal(result.cashOutflow, 105, "cash outflow must combine actual payroll, advances, expenses and net supplier payments");
  assert.equal(result.netCashFlow, -70);
}



{
  const calcStart = workforce.indexOf("function calculateWorkerPay(");
  const calcEnd = workforce.indexOf("\n  window.rimbookCalculateWorkerPay", calcStart);
  assert.ok(calcStart >= 0 && calcEnd > calcStart, "payroll calculator source must exist");
  const calculate = vm.runInNewContext("(" + workforce.slice(calcStart, calcEnd).trim() + ")");
  const dailyRateStart = workforce.indexOf("function workerDailyRate(");
  const dailyRateEnd = workforce.indexOf("\n  function calculateWorkerPay", dailyRateStart);
  assert.ok(dailyRateStart >= 0 && dailyRateEnd > dailyRateStart, "daily wage conversion helper must exist");
  const dailyRate = vm.runInNewContext("(" + workforce.slice(dailyRateStart, dailyRateEnd).trim() + ")", {
    RB: { data: { settings: { payrollDaysPerWeek: 6, payrollDaysPerMonth: 26 } } }
  });
  assert.equal(dailyRate({ wageType: "weekly", wageRate: 600 }), 100,
    "weekly wages must convert using configured workdays per week");
  assert.equal(dailyRate({ wageType: "monthly", wageRate: 2600 }), 100,
    "monthly wages must convert using configured workdays per month");
  assert.equal(dailyRate({ wageType: "daily", wageRate: 125 }), 125);
  assert.deepEqual({ ...calculate("work",100,8,2,8,2,15,true,50) },
    { base:75, overtimePay:30, workerDue:105 },
    "late hours must reduce base pay and enabled overtime must be added separately");
  assert.equal(calculate("work",100,8,0,8,2,15,false,50).workerDue,100,
    "disabled overtime must not increase worker pay");
  assert.equal(calculate("holiday",100,0,0,8,0,15,true,50).workerDue,50,
    "holiday pay must follow the configured percentage");
  assert.equal(calculate("absence",100,8,0,8,4,15,true,100).workerDue,0,
    "absence must not create a wage entitlement");
  assert.equal(calculate("work",100,8,-2,8,-3,-5,true,50).workerDue,100,
    "negative hours and rates must not create negative deductions or overtime");
  assert.equal(calculate("work",100,8,0,8,0,0,true,50).workerDue,100);
}

assert.ok(workforce.includes("window.rimbookCalculateWorkerPay = calculateWorkerPay"), "voice and quick-entry screens must use the shared payroll calculator");
assert.ok(workforce.includes("const duplicate=workRows(worker.id)"), "a worker must not receive duplicate attendance for the same date");
assert.ok(voiceLedger.includes("window.rimbookCalculateWorkerPay"), "voice and quick entries must calculate worker wages using the shared payroll policy");
assert.ok(voiceLedger.includes("item.workerDue=pay.workerDue"), "quick worker entries must store the same calculated due as daily attendance");
assert.ok(voiceLedger.includes("duplicateAttendance=entries.find"), "voice confirmation must reject duplicate worker attendance");
assert.ok(voiceLedger.includes('hasAttendance(worker?worker.id:null,today())'), "quick entries must reject duplicate attendance for today");
assert.ok(pro.includes("const recent=rows.slice()"), "worker home must show the latest personal activity");
assert.ok(pro.includes("📋 مهامي") && pro.includes("بقية أقسام المفكرة متاحة لك"), "worker home must link assigned tasks and clearly expose the full notebook navigation");
assert.ok(app.includes("function workerCanOpenView(target)") && app.includes('"projects","agenda","tasks","ledger","voice","notebook"') && app.includes("لا يمكن تغيير صفة العامل"), "worker navigation must expose notebook routes while keeping the account role fixed");
assert.ok(activation.includes("ربط حسابك بملف العامل") && activation.includes("اختر الملف المطابق"), "workers must be able to choose and save their linked worker profile");
assert.ok(workforce.includes('ROLES.worker.tabs=["home","projects","agenda","tasks","ledger","voice","more"]') && !workforce.includes('ROLES.worker.tabs=["home","voice","more"]'), "worker navigation must expose the full notebook, not a restricted mini-app");
{
  const accessMatch = app.match(/function workerCanOpenView\(target\) \{[\s\S]*?\n\}/);
  assert.ok(accessMatch, "worker route access policy must exist");
  const canOpen = vm.runInNewContext("(" + accessMatch[0] + ")", { RB: { data: { profile: { role: "worker" } } } });
  for (const route of ["home","voice","tasks","profile","settings","more","about"]) assert.equal(canOpen(route), true, "worker route should remain available: " + route);
  for (const route of ["projects","agenda","ledger","notebook","contacts","purchases","invoices","sync","integrations","stats","rates","share"]) assert.equal(canOpen(route), true, "worker should open notebook route: " + route);
  for (const route of ["payroll","workers","workday"]) assert.equal(canOpen(route), false, "worker must not open manager-only workforce controls: " + route);
  const managerCanOpen = vm.runInNewContext("(" + accessMatch[0] + ")", { RB: { data: { profile: { role: "employee" } } } });
  assert.equal(managerCanOpen("payroll"), true, "management navigation remains available");
}
assert.ok(pro.includes("آخر حركاتك هذا الشهر"), "worker home must label the personal activity list clearly");



assert.ok(attachmentsSource.includes("const saved = RB.transact(data =>"), "attaching a file must commit its record reference through the guarded storage transaction");
assert.ok(attachmentsSource.includes("if(!saved){") && attachmentsSource.includes("await ATT_DB.del(aid)"), "a newly stored file must be rolled back when its record reference cannot be saved");
assert.ok(attachmentsSource.indexOf("const saved = RB.transact(data =>") < attachmentsSource.indexOf("await ATT_DB.del(aid);\n    render();"), "deleting an attachment must update the record before deleting the stored blob");
assert.ok(attachmentsSource.includes("t.onabort = () => finishError(t.error)"), "IndexedDB aborts must reject the attachment operation instead of leaving it pending");


assert.ok(backup.includes("const referenced = new Set()") && backup.includes("seen.size !== referenced.size"), "full restore must reject backups with missing or unreferenced attachment payloads");
assert.ok(backup.includes("!Number.isSafeInteger(item.size)") && backup.includes("item.size !== blob.size"), "full restore must require exact safe attachment sizes");
assert.ok(backup.includes("payload.attachments.length > 10000") && backup.includes("maxAttachmentSize = 256 * 1024 * 1024") && backup.includes("maxTotalAttachmentSize = 512 * 1024 * 1024"), "JSON restore must cap attachment count and total decoded size before allocating blobs");


assert.ok(voiceLedger.includes('.replace(/٫/g,".").replace(/٬/g,"")'), "spoken Arabic decimal amounts must be normalized before parsing");
assert.ok(voiceLedger.includes("Voice attachment cleanup failed") && voiceLedger.includes("تعذر ربط التسجيل بسجل المفكرة"), "failed voice-log writes must clean up the stored audio attachment");

async function runZipCompatibilityTest() {
  const crc32 = extractFunction(backup, "crc32");
  const concatBytes = parts => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  };
  const u16 = value => new Uint8Array([value & 255, (value >>> 8) & 255]);
  const u32 = value => new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
  const buildStoredZip = extractFunction(backup, "buildStoredZip", { concatBytes, u16, u32, crc32, Uint8Array, TextEncoder });
  function extractAsyncFunction(name, helpers) {
    const start = backup.indexOf("async function " + name + "(");
    const end = backup.indexOf("\n  }", start);
    assert.ok(start >= 0 && end > start, name + " async helper must exist");
    return vm.runInNewContext("(" + backup.slice(start, end + 4) + ")", helpers);
  }
  const inflateRawZipEntry = extractAsyncFunction("inflateRawZipEntry", { DecompressionStream, Blob, Response, Uint8Array });
  const parseStoredZip = extractAsyncFunction("parseStoredZip", {
    crc32, inflateRawZipEntry, DataView, TextDecoder, Uint8Array,
    DecompressionStream, Blob, Response, Error
  });
  const storedArchive = buildStoredZip([
    { name: "rimbook-backup.json", data: new TextEncoder().encode("{}") },
    { name: "attachments/test.bin", data: new Uint8Array([1,2,3,4]) }
  ]);
  const storedFiles = await parseStoredZip(storedArchive);
  assert.equal(new TextDecoder().decode(storedFiles.get("rimbook-backup.json")), "{}",
    "Rimbook's own stored ZIP export must round-trip through the importer");
  assert.deepEqual(Array.from(storedFiles.get("attachments/test.bin")), [1,2,3,4]);

  const name = Buffer.from("rimbook-backup.json", "utf8");
  const original = Buffer.from('{"format":"rimbook-full-backup","version":1}', "utf8");
  const compressed = zlib.deflateRawSync(original);
  const crc = crc32(new Uint8Array(original));
  const flags = 0x0808;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(name.length, 26);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(compressed.length, 8);
  descriptor.writeUInt32LE(original.length, 12);
  const localPart = Buffer.concat([local, name, compressed, descriptor]);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(original.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralPart = Buffer.concat([central, name]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  const archive = Buffer.concat([localPart, centralPart, end]);
  const parsed = await parseStoredZip(new Uint8Array(archive));
  assert.equal(new TextDecoder().decode(parsed.get("rimbook-backup.json")), original.toString(),
    "ZIP restore must accept DEFLATE entries with a standard data descriptor and central directory");
}
runZipCompatibilityTest()
  .then(() => console.log("UI behavior and ZIP compatibility tests passed."))
  .catch(error => { console.error(error); process.exitCode = 1; });


{
  const installStart = indexHtml.indexOf("let installEvent = null;");
  const installEnd = indexHtml.indexOf("})();", installStart);
  assert.ok(installStart >= 0 && installEnd > installStart, "install controller must be present");
  const installCode = indexHtml.slice(installStart, installEnd + 5);
  assert.match(indexHtml, /id="btnInstall"[^>]*hidden/, "install button starts hidden until install controller initializes");
  assert.match(installCode, /const refreshInstallButton = \(\) => \{ button\.hidden = isStandalone\(\) \|\| isNativeAndroid\(\); \}/,
    "install button must be shown in browser mode and hidden only in standalone/native app mode");
  assert.match(installCode, /beforeinstallprompt/, "native install prompt event must be supported");
  assert.match(installCode, /isNativeAndroid/, "native APK must be detected by the PWA install controller");
  assert.match(installCode, /isStandalone\(\) \|\| isNativeAndroid\(\)/, "PWA install button must stay hidden inside the native APK");
  assert.match(installCode, /choice\.outcome === "accepted"/, "install acceptance must be handled");
  assert.match(installCode, /appinstalled/, "button must hide after the browser confirms installation");
  assert.match(installCode, /button\.disabled = true/, "accepted install prompt must prevent duplicate install requests while installation completes");
  assert.match(installCode, /button\.textContent = "📲 تثبيت التطبيق"/, "dismissed prompt must restore the install button label");
  assert.match(installCode, /Safari.*إضافة إلى الشاشة الرئيسية/, "iOS users must receive manual installation instructions");
  assert.match(installCode, /قائمة المتصفح/, "unsupported browsers must receive manual installation instructions");
}

const aboutGuide = fs.readFileSync("about-guide.js", "utf8");
assert.ok(indexHtml.includes('<script src="./about-guide.js"></script>'), "the detailed Arabic user guide must load after feature modules");
assert.ok(aboutGuide.includes('VIEWS.about = function ()'), "About must render the in-app user guide");
for (const topic of ["المشاريع وربط السجلات", "العمال والدوام والأجور", "الصوت: التحدث والتسجيل الأصلي", "حفظ البيانات والنسخ الاحتياطي ونقل الجهاز", "حل المشكلات الشائعة"]) {
  assert.ok(aboutGuide.includes(topic), "the user guide must explain " + topic);
}
assert.ok(aboutGuide.includes("تحويل الكلام إلى نص يحتاج إنترنت") && aboutGuide.includes("ما يعمل دون إنترنت"), "the guide must state honestly that speech-to-text requires internet and list what works offline");
assert.ok(indexHtml.includes('<script src="./offline-speech.js"></script>') && indexHtml.indexOf("offline-speech.js") < indexHtml.indexOf("voice-ledger.js"), "native speech bridge must load before the voice ledger");
assert.ok(offlineSpeechBridge.includes('registerPlugin("RimbookOfflineSpeech")') && offlineSpeechBridge.includes('addListener("result"'), "the web UI must connect to the native on-device speech plugin");
assert.ok(offlineSpeechBridge.includes("requestPermissions()") && voiceLedger.includes("rimbookOfflineSpeechRequestMic"), "Android must request microphone permission explicitly before recording");
assert.ok(offlineSpeechBridge.includes("45 * 1000") && offlineSpeechBridge.includes("انتهت مهلة الاستماع"), "offline speech UI must not hang indefinitely if Android returns no recognition result");
assert.ok(nativeSpeech.includes("createOnDeviceSpeechRecognizer") && nativeSpeech.includes("checkRecognitionSupport") && nativeSpeech.includes("getInstalledOnDeviceLanguages"), "Android must use the explicit on-device recognizer and inspect installed language packs");
assert.ok(nativeSpeech.includes('"ar-SA"') && nativeSpeech.includes("triggerModelDownload"), "Android speech bridge must target Arabic and support requesting its local model");
assert.ok(androidWorkflow.includes("registerPlugin(OfflineSpeechPlugin.class)") && androidWorkflow.includes("android.speech.RecognitionService"), "APK workflow must register the native speech plugin and declare speech-service visibility");
const nativeSpeechBranchStart = voiceLedger.indexOf("if(isNative&&typeof window.rimbookOfflineSpeechStart");
const browserSpeechBranchStart = voiceLedger.indexOf("const SR=window.SpeechRecognition", nativeSpeechBranchStart);
assert.ok(nativeSpeechBranchStart >= 0 && browserSpeechBranchStart > nativeSpeechBranchStart, "Android voice entry must prefer the native offline recognizer");
assert.ok(!voiceLedger.slice(nativeSpeechBranchStart, browserSpeechBranchStart).includes("SpeechRecognition"), "native offline recognition must not silently fall back to a network-capable browser recognizer");
assert.ok(voiceLedger.includes("new MediaRecorder(audioStream)") && voiceLedger.includes("ATT_DB.put(aid"), "original voice recording must be saved locally as an attachment");
assert.ok(voiceLedger.includes("window.SpeechRecognition||window.webkitSpeechRecognition"), "spoken text input must retain a clearly separate browser fallback");

{
  const parseStart = workforce.indexOf("function parseWorkerMoney(");
  const parseEnd = workforce.indexOf("\n  window.rimbookParseWorkerMoney", parseStart);
  assert.ok(parseStart >= 0 && parseEnd > parseStart, "worker money parser must exist");
  const parseMoney = vm.runInNewContext("(" + workforce.slice(parseStart, parseEnd).trim() + ")", {
    digits: value => String(value || "").replace(/[٠-٩۰-۹]/g, ch => {
      const a="٠١٢٣٤٥٦٧٨٩", p="۰۱۲۳۴۵۶۷۸۹", i=a.indexOf(ch); return String(i >= 0 ? i : p.indexOf(ch));
    })
  });
  assert.equal(parseMoney("1500"),1500);
  assert.equal(parseMoney("1,500"),1500);
  assert.equal(parseMoney("1.500,75"),1500.75);
  assert.equal(parseMoney("١٢٣٤٥٦٧٨٩٠"),1234567890);
  assert.equal(parseMoney("١.٥٠٠,٧٥"),1500.75);
  assert.ok(Number.isNaN(parseMoney("1,2,3")));
}
{
  const match = reminders.match(/function validReminderDate\(value\) \{[\s\S]*?\n \}/);
  assert.ok(match, "strict calendar date validator must exist");
  const validDate = vm.runInNewContext("(" + match[0] + ")");
  assert.equal(validDate("2026-02-28"),true);
  assert.equal(validDate("2026-02-31"),false);
  assert.equal(validDate("2026-13-01"),false);
  assert.equal(validDate("2026-2-01"),false);
  assert.ok(reminders.includes('if(date<today())return toast("اختر اليوم أو تاريخاً قادماً")'), "past reminder dates must remain rejected");
}
assert.ok(app.includes("function toggleRimbookTheme()") && app.includes("data.settings.theme = next"), "theme switch must persist the selected theme");
assert.ok(app.includes('onclick="toggleRimbookTheme()"'), "theme button must call the persistent theme switch");


assert.ok(workforce.includes('ROLES.worker.tabs=["home","projects","agenda","tasks","ledger","voice","more"]'), "worker navigation must retain the full notebook instead of a miniature isolated app");
assert.ok(workforce.includes("const managerLedgerView = VIEWS.ledger") && workforce.includes("هذه البيانات تخص ملف العامل المرتبط بك فقط"), "worker ledger must be filtered to the linked worker record");
assert.ok(workforce.includes('["notebook","الملاحظات","book-open"]') && workforce.includes('["sync","النسخ الاحتياطي","database"]'), "workers must be able to open notebook and backup tools from More");
assert.ok(app.includes('RB.data.profile.role === "worker" && key === "role"'), "workers may link a worker file but cannot change their account role");
assert.ok(offlineSpeechBridge.includes("rimbookNativeSpeak") && offlineSpeechBridge.includes("rimbookNativeStopSpeaking"), "native Android read-aloud bridge must be exposed");
assert.ok(tts.includes("window.rimbookNativeSpeak") && tts.includes("speechSynthesis"), "read-aloud must prefer native Android TTS and keep a browser fallback");
assert.ok(nativeSpeech.includes("SpeechRecognizer.createSpeechRecognizer(getContext())") && nativeSpeech.includes("SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext())"), "speech recognition must automatically fall back to the Android system recognizer");
assert.ok(nativeSpeech.includes("public void speakText(PluginCall call)") && nativeSpeech.includes("public void stopSpeaking(PluginCall call)"), "Android plugin must provide actual speech playback controls");
assert.ok(!voiceLedger.includes('if(info.languageStatus==="downloadable")throw new Error'), "speech recognition must not force manual Arabic model download before first use");

assert.ok(voiceLedger.includes("function handleVoiceTranscript(transcript,fromText)") && voiceLedger.includes('title:"ملاحظة صوتية"'), "unrecognized speech must be saved as a notebook note instead of being discarded");

assert.ok(voiceLedger.includes('info.languageStatus==="installed"&&info.offlineAvailable!==false') && nativeSpeech.includes('call.getBoolean("preferOffline", false)'), "speech must automatically choose online/system recognition when the Arabic offline model is not ready");

assert.ok(workforce.includes("حساب العامل") && workforce.includes("ملفي الشخصي وربط العامل") && workforce.includes("سجل عملي وحساباتي"), "worker profile and personal ledger must be reachable directly from settings");
