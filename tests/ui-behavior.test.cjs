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
const business = fs.readFileSync("business.js", "utf8");
const contactsSource = fs.readFileSync("contacts.js", "utf8");
const invoiceCode = fs.readFileSync("invoices.js", "utf8");

const reversalMatch = voiceLedger.match(/function applyWorkReversal\(data,id,reason,now,newId\)\{[\s\S]*?\n\}/);
assert.ok(reversalMatch, "financial reversal helper must exist");
const applyWorkReversal = vm.runInNewContext("(" + reversalMatch[0] + ")");

function extractFunction(source, name, helpers = {}) {
  const match = source.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}"));
  assert.ok(match, name + " helper must exist");
  return vm.runInNewContext("(" + match[0] + ")", helpers);
}

const projectOptions = extractFunction(activation, "projectOptions");
const goalProgress = extractFunction(activation, "goalProgress");
const normMatch = app.match(/function normalizeSearchText\(value\) \{[\s\S]*?\n\}/);
assert.ok(normMatch, "Arabic search normalization must exist");
const normalizeSearchText = vm.runInNewContext("(" + normMatch[0] + ")");
assert.equal(normalizeSearchText("  أَحْمَد   مُحَمَّد  "), "احمد محمد");

{
  const result = projectOptions([], null);
  assert.equal(result.hasProjects, false);
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0][0], "");
  assert.match(result.options[0][1], /عام/);
  assert.equal(result.selected, "");
}

{
  const projects = [
    { id: "p1", name: "مشروع البناء" },
    { id: "p2", name: "مشروع الزراعة" }
  ];
  const result = projectOptions(projects, "p2");
  assert.equal(result.hasProjects, true);
  assert.deepEqual(Array.from(result.options, row => Array.from(row)), [
    ["", "عام — غير مرتبط بمشروع"],
    ["p1", "مشروع البناء"],
    ["p2", "مشروع الزراعة"]
  ]);
  assert.equal(result.selected, "p2");
  assert.equal(projectOptions(projects, "deleted-project").selected, "");
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
assert.match(activation, /عام.*غير مرتبط بمشروع/);
assert.match(activation, /saveProfilePhoto\(this\)/);
assert.match(activation, /saveProfileField\(/);
assert.match(pro, /home-profile/);
assert.ok(activation.includes('id="profile-worker"') && activation.includes("saveProfileForm()"), "workers must be able to link their own worker record and explicitly save profile data");
assert.ok(workforce.includes('["about","حول التطبيق","info"]'), "About must be reachable from the More menu");
assert.ok(workforce.includes('["about","دليل الاستخدام","book-open"]'), "Managers must also be able to open the About user guide");
assert.ok(pro.includes('id="ppname"') && pro.includes("proAddProject()"), "project creation must provide a writable project-name field");
assert.ok(pro.includes('modal.id="rimbook-project-edit-modal"') && pro.includes('aria-modal'), "project editing must use an accessible in-app modal");
assert.ok(pro.includes("const finance=rimbookFinancialSummary(work,D.invoices||[],D.purchases||[],window.rimbookInvoiceSummary,window.rimbookPurchaseAccounting)") && pro.includes("payrollBalance=finance.payrollBalance") && pro.includes("purchaseOutstanding=finance.supplierBalance"), "management dashboard must use the cent-exact shared financial summary rather than duplicate floating-point totals");
assert.ok(pro.includes("window.saveProjectEdit=function(id)") && pro.includes('field("name"') && pro.includes('field("budget"') && pro.includes('field("start"') && pro.includes('field("due"'), "project edit form must expose all key project fields");
assert.ok(pro.includes("due<startDate") && pro.includes("!validDate(startDate)||!validDate(due)") && pro.includes("RB.transact(data=>"), "project edit form must validate dates and persist all changes transactionally");
assert.ok(indexHtml.includes("overflow-x:hidden") && indexHtml.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "mobile layout must constrain horizontal overflow");
assert.ok(activation.includes("window.shareRimbook=async"), "Rimbook must expose native share action with fallback");
assert.ok(activation.includes("VIEWS.share="), "Share app must have a real screen action");
assert.ok(activation.includes("window.rimbookShareApp()") && activation.includes("https://github.com/hassan2026go/rimbook/releases/latest"), "Android app sharing must use the native chooser and share the official release page");
assert.ok(!activation.includes("navigator.clipboard?.writeText(url)"), "app sharing must never silently replace sharing with copying a link");
assert.ok(nativeSpeech.includes("Intent.ACTION_SEND") && nativeSpeech.includes("Intent.createChooser(send,\"مشاركة Rimbook\")"), "native Android sharing must target installed apps through the system chooser");
assert.ok(offlineSpeechBridge.includes("attempt < 50") && offlineSpeechBridge.includes("Plugins.RimbookOfflineSpeech"), "native speech bridge lookup must tolerate delayed Capacitor startup and use the Capacitor 7 plugin registry");
assert.ok(workforce.includes('["share","مشاركة التطبيق","share-2"]'), "Share app must be reachable from More menu");
assert.ok(indexHtml.includes("env(safe-area-inset-bottom"), "mobile screens must reserve space for Android navigation controls");
assert.ok(!indexHtml.includes("./currency.js"), "the unsupported currency module must not load");
  assert.ok(!activation.includes('"rates"') && !activation.includes("العملات وأسعار الصرف") && !activation.includes("VIEWS.rates"), "obsolete exchange-rate navigation and screen must stay removed");
assert.ok(app.includes('footer.style.setProperty("display", "none", "important")') && indexHtml.includes('footer#appFooter[hidden]{display:none!important}'), "the global footer must be forcibly hidden while the About page is open");
{
  const appFilesMatch = serviceWorker.match(/const APP_FILES = \[([\s\S]*?)\];/);
  assert.ok(appFilesMatch, "service worker must define an explicit offline app shell");
  const cachedFiles = Array.from(appFilesMatch[1].matchAll(/"([^"]+)"/g), match => match[1]);
  const scriptFiles = Array.from(indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g), match => match[1]);
  for (const script of scriptFiles) {
    assert.ok(cachedFiles.includes(script), "every local application script must be precached for offline launch: " + script);
  }
  assert.ok(serviceWorker.includes("rimbook-pwa-v39"), "offline cache must be versioned when the app shell changes");
}
{
  const routeSources = [activation, workforce, pro, invoices, receipts, purchases, contactsSource, notebook, push, backup, offlineSpeechBridge, aboutGuideSource];
  const routeNames = ["tasks","payroll","contacts","purchases","invoices","stats","profile","settings","sync","integrations","share","about"];
  const combined = routeSources.join("\\n");
  for (const route of routeNames) {
    assert.ok(combined.includes("VIEWS." + route + "=") || combined.includes("VIEWS." + route + " ="), "More-menu destination must have a real screen: " + route);
  }
}

assert.match(activation, /project:selectedProject\(\)/);
assert.ok(activation.includes('row.status="archived"') && activation.includes("archivedAt=Date.now()"), "archiving must preserve project-linked records instead of detaching them");
assert.match(pro, /const projectSelect=\$\("pproject"\)/);
assert.ok(pro.includes('aria-label="فتح الملف الشخصي"'));
assert.ok(!pro.includes('id="proSearch"'), "only one unified search box should be installed");
assert.ok(app.includes('["work", "voice_log", "ledger_note"].includes(target.type)'), "work, voice and note records must reject generic edits");
assert.ok(app.includes("removeVoiceLog(id, confirmation)"), "voice log deletion must use an explicit confirmation path");
assert.ok(voiceLedger.includes("type:\"ledger_note\"") && voiceLedger.includes("voiceLedgerAddNote"), "ledger notes must be appended as independent immutable records");
assert.ok(voiceLedger.includes("دفتر العمليات الثابت") && voiceLedger.includes("<table"), "monthly ledger must render as a structured read-only table");
assert.ok(voiceLedger.includes("voiceLedgerMonthAction") && voiceLedger.includes("ترحيل إلى الأرشيف"), "monthly ledger must support copy, share and rollover actions");
assert.ok(receipts.includes('type:"receipt_record"') && !receipts.includes("row.receiptNo=receiptNo"), "receipt metadata must be stored separately without editing an immutable financial movement");
assert.ok(voiceLedger.includes("files:[file]"), "audio sharing must include the original saved recording when supported by the device");
assert.ok(!voiceLedger.includes('onclick="voiceLedgerEditLog('), "voice records must not expose an edit action");
assert.ok(app.includes("RB.data.goals||[]"));
assert.ok(app.includes("RB.data.habits||[]"));
assert.ok(app.includes('kind==="goal"'));
assert.ok(app.includes('event:"موعد"'));
assert.match(pro, /pill\("مباشر","ok"\)/);

assert.ok(activation.includes('row.type==="work"'));
assert.ok(activation.includes("بقيد عكسي موثق"));
assert.ok(voiceLedger.includes('row.type==="work"'));
assert.ok(voiceLedger.includes("النسخة المؤرشفة ومرفقها الصوتي وملاحظاته محفوظة"));
assert.ok(invoices.includes("الحذف النهائي للفواتير متوقف"));
assert.ok(activation.includes('row.status="archived"') && activation.includes("archivedAt=Date.now()"), "archiving keeps project history intact");
assert.ok(activation.includes("reverseWorkEntry"));
assert.ok(voiceLedger.includes("voiceLedgerConfirmReversal"));
assert.ok(voiceLedger.includes("قيد عكسي"));
assert.ok(voiceLedger.includes("countedRows.filter(w=>w.k===\"work\")"));
assert.ok(receipts.includes("ملغى بقيد عكسي موثق"));
assert.ok(receipts.includes('worker_payment:"تسديد أجر عامل"') && receipts.includes('worker_advance:"سلفة عامل"'), "worker payroll movements must be eligible for linked receipts");
assert.ok(receipts.includes('Number(x.workerPaid)||0') && receipts.includes('Number(x.workerAdvance)||0'), "worker receipts must print the exact payroll payment or advance amount");
assert.ok(receipts.includes('const available=RB.all("work").filter(x=>["payment","advance","expense","worker_payment","worker_advance"]'), "worker payroll movements must appear in the receipt attachment selector");
assert.ok(receipts.includes('d.items.find(w=>w.id===existingId&&w.type==="work"&&["payment","advance","expense","worker_payment","worker_advance"].includes(w.k)&&!w.receiptNo)'), "receipt attachment must accept worker payroll payments and advances as well as ordinary ledger entries");

{
  const data = { items: [{ type: "work", id: "pay-1", k: "payment", d: "2026-11-20", rec: 100, due: 0, advance: 0, expense: 0, ds: "دفعة" }] };
  const result = applyWorkReversal(data, "pay-1", "المبلغ أُدخل خطأ", 1234, "rev-1");
  assert.equal(result.ok, true);
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].rec, 100, "original amount must remain unchanged");
  assert.equal(data.items[0].reversedBy, undefined, "reversal must not mutate the immutable original row");
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
    vm.runInNewContext(confirmSource + ";", context);
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
  const moneyStart = workforce.indexOf("function parseWorkerMoney(");
  const moneyEnd = workforce.indexOf("\n  window.rimbookParseWorkerMoney", moneyStart);
  const parseMoney = vm.runInNewContext("(" + workforce.slice(moneyStart, moneyEnd).trim() + ")", {
    digits: value => String(value || "").replace(/[٠-٩۰-۹]/g, ch => {
      const a="٠١٢٣٤٥٦٧٨٩", p="۰۱۲۳۴۵۶۷۸۹", i=a.indexOf(ch); return String(i >= 0 ? i : p.indexOf(ch));
    })
  });
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
    window: { rimbookWorkerDailyRate: () => 50, rimbookParseWorkerMoney: parseMoney }
  });
  const otherWorker = parseWorkerVoice("عمل سليم");
  assert.match(otherWorker.error, /لا يمكنك تسجيل حركة باسم عامل آخر/);
  const ownWorker = parseWorkerVoice("عمل");
  assert.equal(ownWorker.items[0].workerId, "w1", "worker voice entries without a spoken name must use the linked worker");
  assert.equal(ownWorker.items[0].person, "علي");
  const groupedAmount = parseWorkerVoice("واصل دفعة 1.500,75");
  assert.equal(groupedAmount.items[0].rec, 1500.75, "voice entries must parse grouped decimal amounts");
  const arabicAmount = parseWorkerVoice("واصل دفعة ١.٥٠٠,٧٥");
  assert.equal(arabicAmount.items[0].rec, 1500.75, "voice entries must parse Arabic grouped decimal amounts");
  const unlinkedWorkerVoice = vm.runInNewContext("(" + parseSource + ")", {
    normalize: value => String(value || "").toLowerCase(),
    today: () => "2026-11-21",
    iso: date => date.toISOString().slice(0,10),
    Date,
    D: { profile: { role: "worker", workerId: "" }, workers: [], projects: [], settings: { dailyRate: 0, holidayPayPercent: 0 } },
    window: { rimbookParseWorkerMoney: parseMoney }
  });
  const personalNote = unlinkedWorkerVoice("تذكير اتصل بالمورد غداً");
  assert.match(personalNote.error, /لم أفهم نوع الحركة/);
  assert.ok(!personalNote.error.includes("اربط ملف العامل"), "personal voice notes must not require worker linking");
  // Personal mode: a worker with no worker record keeps a personal ledger; nothing demands linking.
  const personalVoice = vm.runInNewContext("(" + parseSource + ")", {
    normalize: value => String(value || "").toLowerCase(),
    today: () => "2026-11-21",
    iso: date => date.toISOString().slice(0,10),
    Date,
    D: { profile: { role: "worker", workerId: "" }, workers: [{ id: "w9", name: "سالم", active: true }], projects: [], settings: { dailyRate: 0, holidayPayPercent: 0 } },
    window: { rimbookParseWorkerMoney: parseMoney, rimbookOwner: { kind: () => "personal" } }
  });
  const personalWork = personalVoice("اليوم عمل");
  assert.ok(!personalWork.error, "a personal worker must be able to log a work day without any link or configured rate");
  assert.equal(personalWork.items[0].scope, "personal");
  assert.equal(personalWork.items[0].workerId, null, "personal records must not be attributed to any worker record");
  const personalPay = personalVoice("واصل دفعة 25");
  assert.equal(personalPay.items[0].rec, 25);
  assert.equal(personalPay.items[0].scope, "personal");
  const namedOther = personalVoice("عمل سالم");
  assert.equal(namedOther.items[0].workerId, null, "a personal ledger must not adopt a worker record just because the name was spoken");
}

{
  const confirmStart = voiceLedger.indexOf("window.voiceLedgerConfirm=function(){");
  const confirmEnd = voiceLedger.indexOf("\n};", confirmStart);
  const confirmSource = voiceLedger.slice(confirmStart, confirmEnd + 3);
  const data = { items: [] };
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
  vm.runInNewContext(confirmSource + ";", context);
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
assert.ok(pro.includes("إجمالي المستحق") && pro.includes("إدارة العمال واليومية") && pro.includes("لا توجد حركات أجور فعلية مسجلة بعد"), "management dashboard must show payroll routes without inventing empty balances");
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
assert.ok(!integrations.includes('id:"firebase"') && !integrations.includes('id:"customDomain"') && !integrations.includes("دومينك"), "Firebase and custom-domain/APK cards must be removed from optional integrations");
assert.ok(integrations.includes('legacyKeys = ["fbApiKey","fbProjectId","myDomain"]') && integrations.includes('delete data.settings.enabled.firebase') && integrations.includes('delete data.settings.enabled.customDomain'), "legacy Firebase and domain credentials and enabled flags must be removed from saved settings");
assert.ok(app.includes('sync:["🔄","نسخ ونقل"]'), "manual backup and device transfer must not be mislabeled as automatic synchronization");
assert.ok(aboutGuideSource.includes("لا تتضمن النسخ الاحتياطية كلمات مرور أو رموز وصول"), "the user guide must explain that integration secrets are excluded from backups");
assert.ok(sync.includes("rimbook-backup-chunk") && sync.includes("restoreRimbookBackup"), "direct device transfer must carry and restore chunked full backups");
assert.ok(sync.includes("waitForIceGatheringComplete") && sync.includes("waitForDataChannelCapacity"), "device transfer must wait for complete ICE candidates and apply data-channel backpressure");
assert.ok(sync.includes("RTC_MAX_TRANSFER_CHARS = 40 * 1024 * 1024") && sync.includes("maxTotalAttachmentBytes: 25 * 1024 * 1024"), "device transfer must enforce mobile-safe size limits before allocating large buffers");
assert.ok(backup.includes("maxTotalAttachmentBytes") && backup.includes("حجم المرفقات يتجاوز الحد المسموح لهذه العملية"), "backup collection must support an attachment cap before reading blobs");
assert.ok(!sync.includes("setTimeout(r, 1500)"), "manual fixed delays must not be used instead of waiting for ICE gathering");
assert.ok(activation.includes("تنزيل نسخة كاملة JSON") && activation.includes("shareFileWhatsApp"), "backup settings must expose complete backup and sharing actions");
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
assert.ok(activation.includes("rimbookCoreSettingsView") && activation.includes("مراكز الإعدادات المتقدمة"), "the settings hub must preserve storage/payroll settings and link to advanced centers");
assert.ok(activation.includes("profile-worker") && app.includes('"workerId"'), "a worker profile must link to its worker record");
assert.ok(pro.includes("profile.workerId") && voiceLedger.includes("workerId=workerMatch?.id"), "worker personal views and voice records must be associated with the correct worker");


assert.ok(purchases.includes("VIEWS.purchases") && purchases.includes("addRimbookPurchase"), "purchases and materials must have a real management screen");

assert.ok(!purchases.slice(0,260).includes("RB.save()") && !purchases.slice(0,260).includes("RB.data.purchases ="), "purchase module startup must not mutate or rewrite user data just by opening the app");
assert.ok(!business.includes("rate:") && !business.includes("function addContact()") && !business.includes("function delContact("), "business module must not retain stale exchange rates or duplicate contact mutations");assert.ok(purchases.includes("addPurchasePayment") && purchases.includes("cancelRimbookPurchase"), "supplier payments and cancellations must be recorded rather than deleting purchases");
assert.ok(purchases.includes("window.rimbookProjectPurchasesTotal"), "purchases must roll up into project costs");
assert.ok(purchases.includes("window.rimbookPurchaseAccounting = purchaseAccounting") && pro.includes("purchaseOutstanding=finance.supplierBalance"), "dashboard purchase balances must reuse the same integer-cent accounting as the purchase ledger");
assert.ok(app.includes('["work", "voice_log", "ledger_note"].includes(target.type)') && app.includes("لا يمكن حذف حركة مالية من دفتر الحسابات"), "financial work records must be protected from hard deletion");
assert.ok(activation.includes('row.status="archived"') && activation.includes("archivedAt=Date.now()"), "project archival must preserve linked records in the active override");
assert.ok(!activation.includes("data.projects=data.projects.filter(p=>p.id!==id)"), "archiving must not hard-delete projects");
assert.ok(pro.includes('id="ptworker"') && workforce.includes("VIEWS.tasks = function"), "tasks must be assignable to workers and filtered in worker view");
assert.ok(pro.includes("purchasesCost") && pro.includes("supplierBalance"), "project and financial reports must include purchases and supplier balances");
assert.ok(pro.includes("recordedCosts=Math.round((payroll+expenses+purchasesCost)*100)/100") && pro.includes("فرق الفواتير عن التكاليف (مؤشر غير نهائي)"), "project cards must total recorded costs and clearly avoid presenting the comparison as net profit");
assert.ok(pro.includes("إجمالي الفواتير") && pro.includes("المقبوض على الفواتير") && pro.includes("مقبوضات غير مرتبطة بفواتير"), "project cards must separate invoiced revenue, invoice collections and unlinked receipts");
assert.ok(pro.includes("window.rimbookInvoiceSummary(i).remaining>0") && pro.includes("invoiceOutstanding="), "unpaid invoice balances must be reflected separately in project receivables without double-counting work-ledger dues");
assert.ok(workforce.includes('["purchases","المشتريات والمواد"') && workforce.includes('ROLES.worker.tabs=["home","projects","notebook","tasks","ledger","voice","more"]'), "main navigation must keep all notebook functions available to worker accounts");


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
const payrollCentsSummary=extractFunction(workforce,"summary",{monthEndDate:payrollMonthEnd,isValidLedgerDate:payrollValidDate,workRows:()=>[
  {id:"w3",d:"2026-11-01",k:"work",workerDue:0.1},
  {id:"w3",d:"2026-11-02",k:"work",workerDue:0.2},
  {id:"w3",d:"2026-11-03",k:"worker_payment",workerPaid:0.1},
  {id:"w3",d:"2026-11-04",k:"worker_advance",workerAdvance:0.05}
]});
assert.strictEqual(payrollCentsSummary("w3","2026-11").due,0.3,"worker due totals must accumulate integer cents without floating point drift");
assert.strictEqual(payrollCentsSummary("w3","2026-11").balance,0.15,"worker balances must remain exact to the cent after payments and advances");
const legacyPayrollSummary=extractFunction(workforce,"summary",{monthEndDate:payrollMonthEnd,isValidLedgerDate:payrollValidDate,workRows:()=>[
  {id:"w4",d:"2026-11-01",k:"work",due:25},
  {id:"w4",d:"2026-11-02",k:"payment",rec:10},
  {id:"w4",d:"2026-11-03",k:"advance",advance:5}
]});
const legacyPayroll=legacyPayrollSummary("w4","2026-11");
assert.deepStrictEqual({days:legacyPayroll.days,due:legacyPayroll.due,paid:legacyPayroll.paid,advances:legacyPayroll.advances,balance:legacyPayroll.balance},{days:1,due:25,paid:10,advances:5,balance:10},"legacy worker rows must remain included in exact payroll totals and carry-forward balances");
const ledgerRowBalance=extractFunction(voiceLedger,"ledgerRowBalance");
assert.equal(ledgerRowBalance({workerDue:100,workerPaid:20,workerAdvance:10,expense:5}),65,"monthly ledger running balance must use worker-specific fields");
assert.equal(ledgerRowBalance({due:100,rec:20,advance:10,expense:5}),65,"monthly ledger running balance must fall back to legacy fields");
assert.equal(ledgerRowBalance({workerDue:100,due:999,workerPaid:20,rec:888,workerAdvance:10,advance:777,expense:5}),65,"worker-specific fields must take precedence over legacy fallback fields");
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
  assert.deepEqual({...invalidPlan},{base:0,overtimePay:30,workerDue:30},"an invalid planned-hours setting must never be silently replaced with an assumed eight-hour day");
  const infiniteInputs = calculateWorkerPay("work",Infinity,8,0,8,Infinity,Infinity,true,50);
  assert.deepEqual({...infiniteInputs},{base:0,overtimePay:0,workerDue:0},"non-finite wage and overtime values must never enter payroll totals");
}
assert.ok(workforce.includes("normalHours > planned"), "normal hours cannot exceed configured standard hours");
assert.ok(workforce.includes("reversedIds.has(String(x.id))"), "reversed holidays and absences must be excluded without mutating their original rows");


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
  const damagedLegacy=purchaseAccounting({total:-25,payments:[{amount:-10},{amount:40}],refunds:[{amount:60},{amount:-5}],status:"cancelled"});
  assert.deepEqual({...damagedLegacy},{paid:40,refunded:40,remaining:0,netCost:0,supplierBalance:0},"legacy imports must never create negative balances or refunds greater than actual payments");
  const cancelled = purchaseAccounting({total:100,payments:[{amount:60}],refunds:[{amount:20}],status:"cancelled"});
  assert.deepEqual({...cancelled}, {paid:60, refunded:20, remaining:0, netCost:40, supplierBalance:0}, "cancelled purchase cost must equal paid minus refunded, with no open supplier liability");
  const legacy = {payments:[{amount:60}],refunds:[{amount:10}]};
  assert.equal(appendPurchaseRefund(legacy,20,"2026-11-21","ref-2"),true,"a further partial refund within the unpaid refund limit must be accepted");
  assert.deepEqual(legacy.refunds.map(x=>x.amount),[10,20],"new refunds must append without overwriting historical refunds");
  assert.equal(appendPurchaseRefund(legacy,31,"2026-11-21","ref-3"),false,"cumulative refunds must never exceed the amount actually paid");
  assert.equal(legacy.refunds.length,2,"a rejected over-refund must not alter the refund history");
  assert.equal(appendPurchaseRefund(legacy,0,"2026-11-21","ref-4"),true,"a cancellation with no additional refund must preserve history");
  assert.equal(legacy.refunds.length,2);
  const damagedRefundHistory={payments:[{amount:-100},{amount:50}],refunds:[{amount:-80},{amount:60}]};
  assert.equal(appendPurchaseRefund(damagedRefundHistory,0,"2026-11-21","ref-damaged"),true,"zero refund must remain safe when legacy history contains invalid negative entries");
  assert.equal(appendPurchaseRefund(damagedRefundHistory,1,"2026-11-21","ref-over"),false,"negative legacy entries must not inflate the refundable balance");
  assert.equal(damagedRefundHistory.refunds.length,2,"rejected refund must preserve damaged legacy history unchanged");
  const suppliers=supplierSummary("s1",[
    {contactId:"s1",total:100,payments:[{amount:25}],refunds:[],status:"active"},
    {contactId:"s1",total:50,payments:[{amount:50}],refunds:[],status:"active"},
    {contactId:"s1",total:40,payments:[{amount:30}],refunds:[{amount:10}],status:"cancelled"},
    {contactId:"s2",total:900,payments:[],refunds:[],status:"active"}
  ]);
  assert.deepEqual({...suppliers},{purchases:3,total:190,paid:105,refunded:10,netCost:170,outstanding:75,cancelled:1},"supplier account must aggregate only purchases linked to that contact and reuse cancellation/refund accounting");
  const damagedSupplier=supplierSummary("s1",[
    {contactId:"s1",total:-500,payments:[{amount:-20},{amount:25}],refunds:[{amount:100}],status:"cancelled"}
  ]);
  assert.deepEqual({...damagedSupplier},{purchases:1,total:0,paid:25,refunded:25,netCost:0,outstanding:0,cancelled:1},"supplier summaries must clamp invalid negative totals and cap refunds to valid payments");
}
assert.ok(purchases.includes("window.rimbookSupplierSummary") && contactsSource.includes("window.rimbookSupplierSummary(c.id)"), "supplier contact cards must show balances from the shared purchasing ledger");
assert.ok(contactsSource.includes("function editContact(id)") && contactsSource.includes("editContact('+JSON.stringify(c.id)+')") && contactsSource.includes("تم تعديل جهة الاتصال وحفظها"), "contact cards must support validated editing of all saved fields");

assert.ok(contactsSource.includes('id="rimbook-contact-edit-modal"') && contactsSource.includes('aria-modal'), "contact editing must use an accessible in-app modal");
assert.ok(contactsSource.includes("function saveContactEdit(id)") && contactsSource.includes('field("ct-edit-name"') && contactsSource.includes('field("ct-edit-company"') && contactsSource.includes('field("ct-edit-address"') && contactsSource.includes('id="ct-edit-notes"'), "contact modal must expose and save all editable fields");
assert.ok(contactsSource.includes("if(!RB.transact(data=>{if(!Array.isArray(data.contacts))data.contacts=[];data.contacts.push(row);}))") && contactsSource.includes("if(!RB.transact(data=>{data.contacts=(data.contacts||[]).filter"), "contact creation and deletion must use transactional persistence");
assert.ok(contactsSource.includes("contactDigits(phone).length<7") && contactsSource.includes("تحقق من البريد الإلكتروني"), "contact creation and editing must validate phone and email consistently");
assert.ok(contactsSource.includes("if(linked)return toast") && contactsSource.includes("حماية السجلات") && contactsSource.includes("x.clientContactId"), "contacts linked to financial or project records must not be deleted and orphan those records");assert.ok(contactsSource.includes("contactDigits(phone).length<7") && contactsSource.includes("replace(/[٠-٩]/g") && contactsSource.includes("replace(/[۰-۹]/g"), "contact validation and WhatsApp dialing must normalize Arabic and Persian numerals");
assert.ok(invoices.includes("function editInvoiceItem(invId,index)") && invoices.includes("function removeInvoiceItem(invId,index)") && invoices.includes("editInvoiceItem(${JSON.stringify(inv.id)},${index})"), "invoice line items must be editable and removable without deleting payment history");
assert.ok(invoices.includes("function openInvoiceItemForm(invId,index)") && invoices.includes('id="rimbook-invoice-item-modal"') && invoices.includes('aria-modal'), "invoice item add/edit must use an accessible in-app form instead of sequential prompts");
for (const field of ["desc","qty","price"]) assert.ok(invoices.includes('id="inv-item-'+field+'"'), "invoice item form must expose "+field);
assert.ok(invoices.includes("invoicePaymentSummary(inv).paid>0") && invoices.includes("لن يمسح سجل الدفعات") && invoices.includes("row.items.push(next)"), "invoice item editing must warn before changing a paid invoice and preserve its payment history");
assert.ok(invoices.includes('id="rimbook-invoice-payment-modal"') && invoices.includes('id="inv-payment-amount"') && invoices.includes("function recordInvoicePayment(invId)"), "invoice payment must use an accessible amount form");
assert.ok(!invoices.slice(invoices.indexOf("function recordInvoicePayment(invId)"),invoices.indexOf("\nfunction printInvoice")).includes("prompt("), "invoice payment must not use browser prompts");
assert.ok(invoices.includes("const remainingCents=Math.max(0,totalCents-Math.max(0,paidCents))") && invoices.includes("amountCents>remainingCents"), "invoice payment must recheck the live balance inside the save transaction");
assert.ok(purchases.includes('id="rimbook-purchase-payment-modal"') && purchases.includes('id="buy-payment-amount"'), "supplier payment must use an accessible in-app form");
assert.ok(purchases.includes("purchaseAccounting(p).remaining") && purchases.includes("amount>left+0.000001"), "supplier payment must recheck the live balance inside the save transaction");
assert.ok(purchases.includes('id="rimbook-purchase-cancel-modal"') && purchases.includes('id="buy-cancel-reason"') && purchases.includes('id="buy-cancel-refund"'), "purchase cancellation must use a complete in-app settlement form");
assert.ok(!purchases.slice(purchases.indexOf("window.cancelRimbookPurchase"),purchases.indexOf("VIEWS.purchases")).includes("prompt("), "purchase cancellation must not use browser prompts");
assert.ok(purchases.includes("const refundableNow=Math.max(0,purchaseAccounting(p).paid-purchaseAccounting(p).refunded)") && purchases.includes("refund>refundableNow"), "purchase cancellation must recheck refundable funds before committing");



assert.ok(pro.includes("purchaseAccounting?purchaseAccounting(purchase)") && pro.includes("purchaseCost=purchaseSum(\"netCost\")"), "financial reports must reuse purchase-ledger accounting");
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
  const missingCycleRate = vm.runInNewContext("(" + workforce.slice(dailyRateStart, dailyRateEnd).trim() + ")", {
    RB: { data: { settings: {} } }
  });
  assert.equal(Number.isNaN(missingCycleRate({ wageType: "weekly", wageRate: 600 })), true,
    "weekly wages must not silently assume six workdays when the manager has not configured the cycle");
  assert.equal(Number.isNaN(missingCycleRate({ wageType: "monthly", wageRate: 2600 })), true,
    "monthly wages must not silently assume twenty-six workdays when the manager has not configured the cycle");
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
assert.ok(workforce.includes("const existingRows=workRows(worker.id),reversedIds=reversedWorkIds(existingRows)") && workforce.includes("const duplicate=existingRows.some"), "a worker must not receive duplicate attendance unless the prior record has a separate reversal");
assert.ok(voiceLedger.includes("window.rimbookCalculateWorkerPay"), "voice and quick entries must calculate worker wages using the shared payroll policy");
assert.ok(voiceLedger.includes("item.workerDue=pay.workerDue"), "quick worker entries must store the same calculated due as daily attendance");
assert.ok(voiceLedger.includes("duplicateAttendance=entries.find"), "voice confirmation must reject duplicate worker attendance");
assert.ok(voiceLedger.includes('row.d===today()&&["work","holiday","absence"].includes(row.k)'), "quick worker entries must reject duplicate attendance for today");
assert.ok(pro.includes("const recent=rows.slice()"), "worker home must show the latest personal activity");
assert.ok(pro.includes("📋 مهامي") && pro.includes("بقية أقسام المفكرة متاحة لك"), "worker home must link assigned tasks and clearly expose the full notebook navigation");
assert.ok(app.includes("function workerCanOpenView(target)") && app.includes('"projects","agenda","tasks","ledger","voice","notebook"'), "worker navigation must expose notebook routes");
assert.ok(app.includes('saveProfileField(&quot;\' + key + \'&quot;,this.value)') && app.includes('if (key === "role" || key === "workerId") render()'), "profile fields must save to their own keys and allow role changes");
assert.ok(activation.includes("ربط حساب العامل بملف العامل") && activation.includes("المدير ينشئ ملف العامل أولاً") && activation.includes("لا تحتاج إلى ربط حساب المدير"), "worker linking must explain who creates and selects the worker record, while managers do not link themselves");
assert.ok(activation.includes("صفة الحساب — قابلة للتغيير") && activation.includes("clearProfileData()"), "profile role must be editable and profile data deletable");
assert.ok(workforce.includes('ROLES.worker.tabs=["home","projects","notebook","tasks","ledger","voice","more"]') && !workforce.includes('ROLES.worker.tabs=["home","voice","more"]'), "worker navigation must expose the full notebook, not a restricted mini-app");
{
  const accessMatch = app.match(/function workerCanOpenView\(target\) \{[\s\S]*?\n\}/);
  assert.ok(accessMatch, "worker route access policy must exist");
  const canOpen = vm.runInNewContext("(" + accessMatch[0] + ")", { RB: { data: { profile: { role: "worker" } } } });
  for (const route of ["home","voice","tasks","profile","settings","more","about"]) assert.equal(canOpen(route), true, "worker route should remain available: " + route);
  for (const route of ["projects","agenda","ledger","notebook","contacts","purchases","invoices","sync","integrations","stats","share"]) assert.equal(canOpen(route), true, "worker should open notebook route: " + route);
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
assert.ok(aboutGuide.includes("يحتاج تحويل الكلام العربي إلى نص اتصالاً بالإنترنت") && aboutGuide.includes("يرجى الاتصال بالإنترنت لتحويل الكلام إلى نص"), "the guide must explain online transcription and the spoken offline warning");
assert.ok(indexHtml.includes('<script src="./offline-speech.js"></script>') && indexHtml.indexOf("offline-speech.js") < indexHtml.indexOf("voice-ledger.js"), "native speech bridge must load before the voice ledger");
assert.ok(offlineSpeechBridge.includes('registerPlugin("RimbookOfflineSpeech")') && offlineSpeechBridge.includes('addListener("result"'), "the web UI must connect to the native on-device speech plugin");
assert.ok(offlineSpeechBridge.includes('addListener("error"') && offlineSpeechBridge.includes('addListener("state"') && !offlineSpeechBridge.includes('await plugin.addListener('), "all speech listeners must use the lazily resolved native plugin");
assert.ok(offlineSpeechBridge.includes("requestPermissions()") && nativeSpeech.includes("requestPermissionForAlias(\"microphone\"") && nativeSpeech.includes("savedAudioPermissionCallback"), "Android native audio recording must request microphone permission explicitly");
assert.ok(offlineSpeechBridge.includes("180 * 1000") && offlineSpeechBridge.includes("انتهت مهلة الاستماع"), "local speech UI must time out safely if the native engine does not return a result");
assert.ok(offlineSpeechBridge.includes('addListener("partial"') && offlineSpeechBridge.includes("mode") && offlineSpeechBridge.includes("canFallBack"), "native speech bridge must expose partial results, choose online/local by connectivity, and fall back to the local model");
assert.ok(nativeSpeech.includes("AudioRecord") && nativeSpeech.includes("OfflineRecognizer") && nativeSpeech.includes("setLanguage("), "Android speech must capture microphone audio and decode it with Sherpa-ONNX Whisper");
assert.ok(nativeSpeech.includes("AudioRecord") && nativeSpeech.includes("OfflineRecognizer") && nativeSpeech.includes("beginOnline(PluginCall c)"), "Android must prefer the bundled offline engine and fall back to network recognition when its model is absent");
assert.ok(nativeSpeech.includes("downloadArabicModel") && nativeSpeech.includes("SHA-256") && nativeSpeech.includes("BASE="), "Arabic model download must verify each file before installation");
assert.ok(offlineSpeechBridge.includes("capacitor.Plugins") && offlineSpeechBridge.includes("typeof legacy.start === \"function\""), "native speech must resolve the registered Capacitor 7 plugin proxy first");
  assert.ok(offlineSpeechBridge.includes("window.rimbookShareApp") && offlineSpeechBridge.includes("nativePlugin.shareApp") && offlineSpeechBridge.includes("navigator.share"), "app sharing must open a native or Web Share chooser without copying a URL");
  assert.ok(nativeSpeech.includes("private void beginOnline(PluginCall c)") && nativeSpeech.includes('RecognizerIntent.EXTRA_LANGUAGE,"ar-SA"') && nativeSpeech.includes("RecognizerIntent.EXTRA_PREFER_OFFLINE,false"), "Android must fall back to network Arabic recognition when the offline model is missing");
assert.ok(nativeSpeech.includes("SpeechRecognizer.isRecognitionAvailable") && nativeSpeech.includes("emitOnlineResult"), "online speech fallback must verify service availability and return transcripts");
assert.ok(androidWorkflow.includes("android.speech.RecognitionService"), "Android manifest must expose network speech recognition service visibility");
assert.ok(nativeSpeech.includes("private volatile Boolean modelIntegrity = null") && nativeSpeech.includes("!hash(modelFile).equals(FILES[i][1])"), "the installed offline model must be SHA-256 verified on first use, not trusted by file size alone");
assert.ok(nativeSpeech.includes("modelIntegrity=true") && nativeSpeech.includes("فشل التحقق من سلامتها"), "a completed download must mark the verified model and report integrity failures clearly");
assert.ok(androidWorkflow.includes("registerPlugin(OfflineSpeechPlugin.class)") && androidWorkflow.includes("sherpa-onnx-2.0.3.aar") && androidWorkflow.includes("sha256sum --check") && androidWorkflow.includes("implementation files('libs/sherpa-onnx-2.0.3.aar')") && androidWorkflow.includes("Keep all ABIs shipped") && !androidWorkflow.includes("abiFilters 'arm64-v8a'") && androidWorkflow.includes('applicationId "com.rimbook.preview"') && androidWorkflow.includes('data["appId"] = "com.rimbook.preview"'), "APK workflow must register Sherpa-ONNX and retain all packaged CPU architectures");
const nativeSpeechBranchStart = voiceLedger.indexOf("if(isNative&&typeof window.rimbookOfflineSpeechStart");
const browserSpeechBranchStart = voiceLedger.indexOf("const SR=window.SpeechRecognition", nativeSpeechBranchStart);
assert.ok(nativeSpeechBranchStart >= 0 && browserSpeechBranchStart > nativeSpeechBranchStart, "Android voice entry must use the independent native speech engine");
assert.ok(voiceLedger.slice(nativeSpeechBranchStart, browserSpeechBranchStart).includes('rimbookOfflineSpeechStart("ar","auto")'), "Android speech-to-text must pick online when connected, local otherwise");
const nativeVoiceFailureBranch=voiceLedger.slice(voiceLedger.indexOf("if(isNative&&typeof window.rimbookOfflineSpeechStart"),voiceLedger.indexOf("const SR=window.SpeechRecognition"));
assert.ok(voiceLedger.includes("يرجى الاتصال بالإنترنت لتحويل الكلام إلى نص") && !nativeVoiceFailureBranch.includes("speakText(prompt"), "native transcription errors must be shown clearly without overlapping spoken announcements");
assert.ok(voiceLedger.includes("new MediaRecorder(audioStream)") && voiceLedger.includes("ATT_DB.put(aid"), "original voice recording must be saved locally as an attachment");
const nativeAudioBranch=voiceLedger.slice(voiceLedger.indexOf("window.voiceAudioStart=async function"),voiceLedger.indexOf("window.voiceAudioStop=async function"));
assert.ok(nativeAudioBranch.indexOf("rimbookNativeAudioStart")>=0 && nativeAudioBranch.indexOf("rimbookNativeAudioStart")<nativeAudioBranch.indexOf("navigator.mediaDevices.getUserMedia"), "Android native audio recording must be attempted before WebView MediaRecorder capability checks");
assert.ok(offlineSpeechBridge.includes("startSavedAudio") && offlineSpeechBridge.includes("stopSavedAudio"), "native Android audio recording bridge must expose independent start and stop methods");
assert.ok(!nativeVoiceFailureBranch.includes("speakText(prompt"), "native speech recognition errors must not trigger overlapping spoken announcements");
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
  const notebookDateMatch = notebook.match(/const validDate = value => \{[\s\S]*?\n  \};/);
  assert.ok(notebookDateMatch, "notebook must use a strict calendar date validator");
  const notebookValidDate = vm.runInNewContext("(" + notebookDateMatch[0].replace("const validDate = value =>", "value =>").replace(/;$/, "") + ")");
  assert.equal(notebookValidDate("2026-02-28"), true);
  assert.equal(notebookValidDate("2026-02-31"), false, "notebook must reject impossible calendar dates");
  assert.equal(notebookValidDate("2026-13-01"), false);
  assert.ok(notebook.includes("date < today() && date !== row.d"), "notebook edits must reject moving appointments into the past");

  assert.ok(notebook.includes('modal.id = "rimbook-notebook-edit-modal"') && notebook.includes('aria-modal'), "notebook event editing must use an accessible in-app modal");
assert.ok(notebook.includes("window.editNote = function (id)") && notebook.includes("window.notebookSaveNoteEdit = function (id)"), "note edit buttons must call a real saveable note editor");
assert.ok(notebook.includes('modal.id = "rimbook-note-edit-modal"') && notebook.includes('id="nb-note-edit-body"') && notebook.includes("RB.patch(id, { title, body, project })"), "note editing must preserve the body and project while saving all edited fields");
  assert.ok(notebook.includes("window.notebookSaveEdit") && notebook.includes('field("title"') && notebook.includes('field("date"') && notebook.includes('field("time"') && notebook.includes("nb-edit-project"), "notebook edit form must save title, date, time and project");
  assert.ok(!notebook.includes("prompt("), "notebook editing must not rely on blocking sequential prompts");
  assert.ok(notebook.includes("date < today() && date !== row.d") && notebook.includes("project && !projects().some"), "notebook edits must validate dates and project references");}
assert.ok(app.includes("function toggleRimbookTheme()") && app.includes("data.settings.theme = next"), "theme switch must persist the selected theme");
assert.ok(app.includes('note:"notebook"'), "quick-search note results must open the real notebook screen");
assert.ok(!workforce.includes('"rates"') && !workforce.includes("العملات وأسعار الصرف"), "More menus must not expose the removed currency feature as a dead navigation item");
assert.ok(!app.includes('add("goal"') && !app.includes('add("habit"'), "quick search must not advertise orphan goal or habit records without a functional destination");
assert.ok(app.includes('onclick="toggleRimbookTheme()"'), "theme button must call the persistent theme switch");


assert.ok(workforce.includes('ROLES.worker.tabs=["home","projects","notebook","tasks","ledger","voice","more"]'), "worker navigation must retain the full notebook instead of a miniature isolated app");
assert.ok(workforce.includes("const managerLedgerView = VIEWS.ledger") && workforce.includes("هذه البيانات تخص ملف العامل المرتبط بك فقط"), "worker ledger must be filtered to the linked worker record");
assert.ok(workforce.includes('["notebook","الملاحظات","book-open"]') && workforce.includes('["sync","النسخ الاحتياطي","database"]'), "workers must be able to open notebook and backup tools from More");
assert.ok(activation.includes("صفة الحساب") && activation.includes("قابلة للتغيير") && activation.includes("مدير / إدارة") && activation.includes("عامل"), "both managers and workers must be able to change the account role from the profile screen");
assert.ok(app.includes('if (key === "role" && v === "employee") RB.data.profile.workerId = ""'), "switching to management must clear an obsolete worker link");
assert.ok(offlineSpeechBridge.includes("rimbookNativeSpeak") && offlineSpeechBridge.includes("rimbookNativeStopSpeaking"), "native Android read-aloud bridge must be exposed");
assert.ok(tts.includes("window.rimbookNativeSpeak") && tts.includes("speechSynthesis"), "read-aloud must prefer native Android TTS and keep a browser fallback");
assert.ok(nativeSpeech.includes("OfflineRecognizer") && nativeSpeech.includes("SpeechRecognizer") && nativeSpeech.includes("beginOnline(PluginCall c)"), "native transcription must use the bundled offline model first and a network recognizer fallback when the model is absent");
assert.ok(nativeSpeech.includes("public void speakText(PluginCall call)") && nativeSpeech.includes("public void stopSpeaking(PluginCall call)"), "Android plugin must provide actual speech playback controls");
assert.ok(!voiceLedger.includes('if(info.languageStatus==="downloadable")throw new Error'), "speech recognition must not force manual Arabic model download before first use");

assert.ok(voiceLedger.includes("function handleVoiceTranscript(transcript)") && voiceLedger.includes('title:"ملاحظة صوتية"'), "unrecognized speech must be saved as a notebook note instead of being discarded");

assert.ok(voiceLedger.includes('rimbookOfflineSpeechStart("ar","auto")'), "Android speech-to-text must use the downloaded offline Arabic model");

assert.ok(workforce.includes("حساب العامل") && workforce.includes("ملفي الشخصي وربط العامل") && workforce.includes("سجل عملي وحساباتي"), "worker profile and personal ledger must be reachable directly from settings");
assert.ok(workforce.includes('id = "rimbook-worker-edit-modal"') && workforce.includes('aria-modal'), "worker editing must use an accessible in-app modal instead of sequential prompts");
for (const field of ["name","phone","email","job","type","rate","ot","project","notes"]) {
  assert.ok(workforce.includes('id="wf-edit-'+field+'"'), "worker edit form must expose the "+field+" field");
}
assert.ok(workforce.includes("window.rimbookSaveWorkerEdit = function (id)") && workforce.includes("row.overtimeRate=overtimeRate") && workforce.includes("row.projectId=projectId||null"), "worker edit form must validate and persist all employment fields");

assert.ok(workforce.includes('modal.id = "rimbook-worker-money-modal"') && workforce.includes('aria-modal'), "worker payments and advances must use an accessible in-app modal");
assert.ok(workforce.includes("window.rimbookSaveWorkerMoney = function (id, kind)") && workforce.includes('id="wf-money-amount"') && workforce.includes('id="wf-money-note"'), "worker payment modal must capture amount and transaction note");
assert.ok(workforce.includes("parseWorkerMoney(raw)") && workforce.includes("amount <= 0") && workforce.includes("if (!RB.add(row)) return"), "worker payment saving must validate positive amounts and persist transactionally");
assert.ok(workforce.includes("if (!Number.isFinite(wageRate)||wageRate<0)") && workforce.includes("تحقق من البريد الإلكتروني"), "worker edit form must validate wage and email values");
assert.ok(workforce.includes("لن تتأثر يومياته أو دفعاته أو سجلاته السابقة") && workforce.includes("rimbook-worker-edit-modal") && workforce.includes("document.getElementById"), "worker edit form must preserve historical records and support closing");


assert.ok(app.includes("اختر ملفك من قائمة العمال النشطين") && app.includes("profile-worker-id"), "worker profile must provide an understandable active-worker linking control");
assert.ok(app.includes('saveProfileField(&quot;workerId&quot;,this.value)'), "worker profile selection must have a valid inline change handler");
assert.ok(!app.includes("dailyRate: 0, otRate: 0") && !activation.includes("dailyRate:0,otRate:0"), "new installs must not start with preset payroll amounts");
assert.ok(!app.includes("normalHoursPerDay: 8") && !workforce.includes("payrollDaysPerWeek = 6") && !workforce.includes("payrollDaysPerMonth = 26"), "new installs must not assume an eight-hour day or fixed weekly/monthly workdays");
assert.ok(activation.includes('field("gtarget","كم تريد أن تنجز؟","number","العدد المستهدف","")') && !activation.includes('مثلاً: 10'), "goal entry must not prefill an arbitrary target number");
assert.ok(activation.includes('field("wdue","المستحق","number","مبلغ المستحق","")') && activation.includes('field("wexpense","المصروف","number","مبلغ المصروف","")'), "manager ledger amount inputs must start empty and distinguish expenses");
assert.ok(voiceLedger.includes("لا توجد عمليات مسجلة لهذا الشهر بعد") && voiceLedger.includes('amountDue!==0?money(amountDue):"—"'), "empty monthly ledger must not display invented zero amounts");
assert.ok(workforce.includes("لا توجد حركات مالية مسجلة لهذا العامل بعد") && workforce.includes("حدد ساعات الدوام العادية من الإعدادات أولاً"), "new worker accounts must remain free of zero balances and require an explicit hours policy");
assert.ok(purchases.includes('placeholder="أدخل الكمية"') && purchases.includes('placeholder="أدخل سعر الوحدة"') && !purchases.includes('id="buy-qty" type="number" min="0.001" step="0.001" value="1"'), "purchase forms must not prefill quantities or unit prices");
assert.ok(invoices.includes('item?.qty==null?"":String(item.qty)') && invoices.includes('item?.price==null?"":String(item.price)'), "invoice item forms must start empty instead of assuming quantity one and price zero");
assert.ok(receipts.includes('placeholder="أدخل المبلغ"') && !receipts.includes('due:0,rec:kind==="payment"?amount:0'), "receipt forms and saved ledger rows must not create irrelevant zero amounts");
assert.ok(purchases.includes('لا توجد مشتريات أو أرصدة موردين مسجلة بعد') && purchases.includes('id="buy-total">—'), "empty purchase history must not display fabricated zero totals");
assert.ok(app.includes("window.clearProfileData = function ()") && app.includes("حذف بيانات الملف الشخصي"), "profile must support an explicit, scoped delete action");
assert.ok(!voiceLedger.slice(voiceLedger.indexOf("window.voiceLedgerStart=function"),voiceLedger.indexOf("window.voiceAudioStart=async function")).includes("اربط ملف العامل من صفحة الملف الشخصي أولاً"), "voice notes must not require a worker link before recording speech");
assert.ok(!voiceLedger.slice(voiceLedger.indexOf("window.voiceAudioStart=async function"),voiceLedger.indexOf("window.voiceAudioStop")).includes("اربط ملف العامل من صفحة الملف الشخصي أولاً"), "raw audio recording must not require a worker link");
assert.ok(voiceLedger.includes("تسجيل الصوت الأصلي وحفظه وتشغيله يعمل دون إنترنت دائماً"), "the voice screen must distinguish offline recording from online transcription");


{
  const invoiceParserStart=invoices.indexOf("function parseInvoiceAmount(value){");
  const invoiceParserEnd=invoices.indexOf("\n  function invoicePaymentSummary",invoiceParserStart);
  const purchaseParserStart=purchases.indexOf("const parseAmount = value => {");
  const purchaseParserEnd=purchases.indexOf("\n  function purchaseAccounting",purchaseParserStart);
  assert.ok(invoiceParserStart>=0&&invoiceParserEnd>invoiceParserStart,"invoice amount parser must exist");
  assert.ok(purchaseParserStart>=0&&purchaseParserEnd>purchaseParserStart,"purchase amount parser must exist");
  const invoiceParser=vm.runInNewContext("("+invoices.slice(invoiceParserStart,invoiceParserEnd).trim()+")");
  const purchaseParserSource=purchases.slice(purchaseParserStart,purchaseParserEnd).trim().replace("const parseAmount = value =>","value =>").replace(/;\s*$/,"");
  const purchaseParser=vm.runInNewContext("("+purchaseParserSource+")");
  for(const [label,parse] of [["invoice",invoiceParser],["purchase",purchaseParser]]){
    assert.equal(parse("1500"),1500,label+" parser must preserve plain thousands");
    assert.equal(parse("1,500"),1500,label+" parser must treat three trailing digits as grouping");
    assert.equal(parse("1.500"),1500,label+" parser must support dot thousands");
    assert.equal(parse("1.500,75"),1500.75,label+" parser must support European decimal notation");
    assert.equal(parse("1,500.75"),1500.75,label+" parser must support US decimal notation");
    assert.equal(parse("١.٥٠٠,٧٥"),1500.75,label+" parser must support Arabic digits");
    assert.equal(parse("1,5"),1.5,label+" parser must support decimal comma");
    assert.ok(Number.isNaN(parse("1,2,3")),label+" parser must reject malformed separators");
  }
}

{
  const start=invoices.indexOf("function createInvoice(projId)");
  const end=invoices.indexOf("function openInvoiceItemForm",start);
  assert.ok(start>=0&&end>start,"invoice creation function must exist");
  const source=invoices.slice(start,end);
  assert.ok(source.includes("RB.transact(data=>") && source.includes("تعذر حفظ الفاتورة"),"invoice creation must use transactional persistence and report save failures");
  assert.ok(!source.includes("RB.data.invoices.push")&&!source.includes("RB.save()"),"invoice creation must not mutate live data before a checked save");
}

{
  const balanceMatch=business.match(/function contactBalance\(cid\)\{[\s\S]*?\n\}/);
  assert.ok(balanceMatch,"contact balance helper must exist");
  const contactBalance=vm.runInNewContext("("+balanceMatch[0]+")",{
    RB:{all:()=>[
      {contactId:"c1",due:0.1,rec:0.05},
      {contactId:"c1",due:0.2,rec:0.05},
      {contactId:"c2",due:999,rec:0}
    ]},
    toCents:value=>{const n=Number(value);return Number.isFinite(n)?Math.round(n*100):0;}
  });
  assert.deepEqual({...contactBalance("c1")},{due:0.3,rec:0.1,rem:0.2},"contact balances must sum integer cents and isolate each contact");
  const monthlyMatch=business.match(/function monthlyComparison\(\)\{[\s\S]*?\n\}/);
  assert.ok(monthlyMatch,"monthly business comparison helper must exist");
  const now=new Date(),monthKey=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
  const monthlyComparison=vm.runInNewContext("("+monthlyMatch[0]+")",{
    RB:{all:()=>[
      {d:monthKey+"-01",due:0.1,rec:0.05,k:"work",ot:1},
      {d:monthKey+"-02",due:0.2,rec:0.05,k:"payment",ot:0},
      {due:100,rec:100}
    ]},
    toCents:value=>{const n=Number(value);return Number.isFinite(n)?Math.round(n*100):0;}
  });
  const current=monthlyComparison().find(row=>row.key===monthKey);
  assert.equal(current.due,0.3,"monthly totals must accumulate exact cents");
  assert.equal(current.rec,0.1,"monthly receipts must accumulate exact cents");
  assert.equal(current.rem,0.2,"monthly balance must remain exact to the cent");
}

{
  const walkStart=backup.indexOf("function walkAttachmentRefs(");
  const walkEnd=backup.indexOf("\n  }",walkStart);
  assert.ok(walkStart>=0&&walkEnd>walkStart,"nested attachment walker must exist");
  const walkAttachmentRefs=vm.runInNewContext("("+backup.slice(walkStart,walkEnd+4)+")");
  const validateStart=backup.indexOf("function validateFullBackupPayload(");
  const validateEnd=backup.indexOf("\n  }",validateStart);
  assert.ok(validateStart>=0&&validateEnd>validateStart,"full backup validation must exist");
  const validateBackup=vm.runInNewContext("("+backup.slice(validateStart,validateEnd+4)+")",{
    FORMAT:"rimbook-full-backup",VERSION:1,walkAttachmentRefs,
    atob:value=>Buffer.from(value,"base64").toString("binary"),
    base64ToBlob:(value,type)=>({size:Buffer.from(value,"base64").length,type:type||"application/octet-stream"})
  });
  const validPayload={
    format:"rimbook-full-backup",version:1,
    appData:{items:[{id:"i1",attachments:[{aid:"a1"}]}]},
    attachments:[{aid:"a1",name:"photo.jpg",type:"image/jpeg",size:3,base64:"YWJj"}]
  };
  assert.equal(validateBackup(validPayload).length,1,"a complete backup with all referenced attachments must validate");
  const nestedArchive={...validPayload,appData:{items:[{type:"voice_archive",record:{attachments:[{aid:"a1"}]}}]}};
  assert.equal(validateBackup(nestedArchive).length,1,"nested archived audio references must be included in full backup validation");
  assert.throws(()=>validateBackup({...nestedArchive,attachments:[]}),/لا تحتوي جميع المرفقات/,"a backup must not omit audio blobs referenced only by archived recordings");
  assert.ok(backup.includes("walkAttachmentRefs"),"full backups must traverse nested archive records when collecting audio attachments");
  assert.throws(()=>validateBackup({...validPayload,attachments:[]}),/لا تحتوي جميع المرفقات/,"restore must reject backups missing referenced attachments");
  assert.throws(()=>validateBackup({...validPayload,attachments:[{...validPayload.attachments[0],size:4}]}),/لا يطابق/,"restore must reject attachment size mismatches");
  assert.throws(()=>validateBackup({...validPayload,attachments:[...validPayload.attachments,{...validPayload.attachments[0]}]}),/غير صالحة أو مكررة/,"restore must reject duplicate attachment IDs");
  assert.throws(()=>validateBackup({...validPayload,attachments:[{...validPayload.attachments[0],base64:"%%%"}]}),/غير صالحة أو مكررة/,"restore must reject malformed base64 payloads");
  assert.ok(backup.includes("const previous = new Map()") && backup.includes("rollbackErrors") && backup.includes("await ATT_DB.del(aid)"),"failed full restore must roll back attachment writes and remove newly written blobs");
  assert.ok(backup.includes("preserveLocalIntegrationSecrets") && backup.includes("SENSITIVE_SETTINGS"),"backup restore must preserve local integration credentials instead of importing another device's secrets");
}
