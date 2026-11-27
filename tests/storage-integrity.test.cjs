const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync("app.js", "utf8");
const backupSource = fs.readFileSync("backup.js", "utf8");
const start = source.indexOf("const RB = (() => {");
assert.notEqual(start, -1, "RB core must exist in app.js");
const endMarker = "\n})();";
const end = source.indexOf(endMarker, start);
assert.notEqual(end, -1, "RB core must close correctly");
const core = source.slice(start, end + endMarker.length) + "\nthis.RB = RB;";

function createHarness(initial = "{}") {
  let stored = initial;
  let failWrites = false;
  const messages = [];
  const localStorage = {
    getItem(key) { return key === "rimbook.v6" ? stored : null; },
    setItem(key, value) {
      if (failWrites) {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      }
      if (key === "rimbook.v6") stored = String(value);
    }
  };
  const sandbox = {
    localStorage,
    toast(message) { messages.push(String(message)); },
    window: {},
    Date,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String
  };
  vm.runInNewContext(core, sandbox, { filename: "app.js#RB" });
  return {
    RB: sandbox.RB,
    messages,
    get stored() { return stored; },
    failWrites(value) { failWrites = value; }
  };
}

{
  const h = createHarness();
  const row = h.RB.add({ type: "work", k: "payment", rec: 12.5 });
  assert.ok(row && row.id, "successful add returns the saved row");
  assert.equal(h.RB.data.items.length, 1);
  assert.equal(JSON.parse(h.stored).items.length, 1);
}

{
  const h = createHarness();
  h.RB.add({ type: "work", k: "payment", rec: 10 });
  const before = h.stored;
  h.failWrites(true);
  const result = h.RB.add({ type: "work", k: "advance", advance: 5 });
  assert.equal(result, null, "failed add must not report success");
  assert.equal(h.RB.data.items.length, 1, "failed add must roll back in memory");
  assert.equal(h.stored, before, "failed add must not replace the last saved data");
  assert.ok(h.messages.some(m => m.includes("لم تُحفظ العملية")), "user must receive a clear failure warning");
}

{
  const h = createHarness();
  h.RB.add({ type: "work", k: "work", due: 50 });
  const before = h.stored;
  h.failWrites(true);
  const ok = h.RB.transact(data => {
    data.items.push({ type: "work", k: "payment", rec: 20 });
    data.items.push({ type: "work", k: "advance", advance: 10 });
  });
  assert.equal(ok, false);
  assert.equal(h.RB.data.items.length, 1, "failed multi-record transaction must roll back every row");
  assert.equal(h.stored, before);
}

{
  const h = createHarness();
  h.RB.add({ id: 42, type: "note", title: "معرّف رقمي" });
  assert.equal(h.RB.patch("42", { title: "تعديل بمعرّف نصي" }), true,
    "patch must match legacy numeric IDs when callers pass their string form");
  assert.equal(h.RB.data.items[0].title, "تعديل بمعرّف نصي");
  assert.equal(h.RB.remove("42"), true,
    "remove must match legacy numeric IDs when callers pass their string form");
  assert.equal(h.RB.data.items.length, 0);

  h.RB.add({ id: 43, type: "work", k: "payment", rec: 12 });
  assert.equal(h.RB.remove("43"), false,
    "string-form IDs must not bypass the financial-record deletion guard");
  assert.equal(h.RB.data.items.length, 1);
}

{
  const h = createHarness();
  const row = h.RB.add({ type: "work", k: "payment", rec: 25 });
  h.failWrites(true);
  assert.equal(h.RB.patch(row.id, { rec: 250 }), false);
  assert.equal(h.RB.data.items[0].rec, 25, "failed edit must restore the old amount");
  assert.equal(h.RB.remove(row.id), false);
  assert.equal(h.RB.data.items.length, 1, "failed delete must retain the financial record");
}

{
  const h = createHarness();
  const work = h.RB.add({ id: "immutable-work", type: "work", k: "payment", rec: 25 });
  const voice = h.RB.add({ id: "immutable-voice", type: "voice_log", body: "النص الأصلي" });
  const note = h.RB.add({ id: "immutable-note", type: "ledger_note", body: "ملاحظة أصلية" });
  assert.ok(work && voice && note);
  assert.equal(h.RB.transact(data => { data.items.find(x => x.id === work.id).rec = 250; }), false,
    "direct transactions must not mutate an original financial movement");
  assert.equal(h.RB.data.items.find(x => x.id === work.id).rec, 25);
  assert.equal(h.RB.transact(data => { data.items.find(x => x.id === voice.id).body = "نص معدل"; }), false,
    "direct transactions must not edit original voice logs");
  assert.equal(h.RB.data.items.find(x => x.id === voice.id).body, "النص الأصلي");
  assert.equal(h.RB.remove(note.id), false, "append-only explanatory notes cannot be deleted");
  assert.equal(h.RB.removeVoiceLog(voice.id, true), false, "voice logs cannot be deleted before rollover");
  h.RB.add({ type: "voice_archive", sourceId: voice.id, record: { ...voice } });
  assert.equal(h.RB.removeVoiceLog(voice.id, true), true, "voice log deletion is allowed only after an archive copy exists");
  assert.equal(h.RB.data.items.some(x => x.id === note.id), true, "notes remain preserved after voice log deletion");
}

{
  const first = createHarness();
  first.RB.add({ type: "work", k: "payment", rec: 7.25 });
  const reopened = createHarness(first.stored);
  assert.equal(reopened.RB.data.items.length, 1, "saved records must load after app restart");
  assert.equal(reopened.RB.data.items[0].rec, 7.25);
}


{
  const legacy = JSON.stringify({
    profile: { name: "عامل قديم" },
    settings: { currency: "USD" },
    items: [{ type: "work", k: "payment", rec: 15 }]
  });
  const h = createHarness(legacy);
  assert.equal(h.RB.data.profile.name, "عامل قديم");
  assert.equal(h.RB.data.profile.role, "employee", "legacy profile must receive missing default fields");
  assert.equal(h.RB.data.settings.currency, "USD");
  assert.equal(h.RB.data.settings.theme, "dark", "legacy settings must receive missing defaults");
  for (const key of ["workers", "projects", "contacts", "invoices", "purchases", "goals", "habits"]) {
    assert.ok(Array.isArray(h.RB.data[key]), key + " must be normalized to an array");
  }
}

{
  const h = createHarness();
  const ok = h.RB.replace({
    profile: { name: "نسخة مستعادة" },
    settings: { currency: "EUR" },
    items: [{ type: "work", k: "payment", rec: 25 }]
  });
  assert.equal(ok, true, "legacy backup restore should succeed with safe defaults");
  assert.equal(h.RB.data.profile.name, "نسخة مستعادة");
  assert.equal(h.RB.data.profile.role, "employee");
  assert.equal(h.RB.data.settings.currency, "EUR");
  assert.equal(h.RB.data.settings.theme, "dark");
  assert.equal(h.RB.data.items[0].rec, 25);
}

{
  const h = createHarness();
  h.RB.add({ type: "work", k: "payment", rec: 80 });
  const before = h.stored;
  const ok = h.RB.replace({
    profile: { name: "بيانات تالفة" },
    settings: { currency: "USD" },
    items: "not-an-array"
  });
  assert.equal(ok, false, "malformed backup arrays must be rejected");
  assert.equal(h.RB.data.items.length, 1, "rejected restore must preserve existing records");
  assert.equal(h.RB.data.items[0].rec, 80);
  assert.equal(h.stored, before, "rejected restore must not alter persisted data");
}


{
  const voiceLedger = fs.readFileSync("voice-ledger.js", "utf8");
  const helperStart = voiceLedger.indexOf("function applyWorkReversal(");
  const helperEnd = voiceLedger.indexOf("\n}", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "financial reversal helper must exist for transaction integration");
  const helperSource = voiceLedger.slice(helperStart, helperEnd + 2);
  const applyWorkReversal = vm.runInNewContext("(" + helperSource + ")");
  const reverseStart = voiceLedger.indexOf("window.voiceLedgerConfirmReversal=function(id){");
  const reverseEnd = voiceLedger.indexOf("\n};", reverseStart);
  assert.ok(reverseStart >= 0 && reverseEnd > reverseStart, "reverse confirmation handler must exist");
  const reverseSource = voiceLedger.slice(reverseStart, reverseEnd + 3);
  const h = createHarness();
  const original = h.RB.add({ type: "work", id: "work-to-reverse", k: "payment", rec: 40, d: "2026-11-21" });
  assert.ok(original);
  let rendered = 0;
  const context = {
    RB: h.RB,
    window: {},
    document: { getElementById(id) { return id === "voice-reversal-reason" ? { value: "تصحيح مبلغ الدفعة" } : { remove() {} }; } },
    applyWorkReversal,
    JSON,
    Date,
    Math,
    render() { rendered++; },
    toast(message) { h.messages.push(String(message)); }
  };
  vm.runInNewContext(reverseSource + ";", context);
  const savedSnapshot = h.stored;
  h.failWrites(true);
  context.window.voiceLedgerConfirmReversal("work-to-reverse");
  assert.equal(h.RB.data.items.length, 1, "failed reversal save must remove the staged reversal row");
  assert.equal(h.RB.data.items[0].reversedBy, undefined, "failed reversal save must restore original metadata");
  assert.equal(h.stored, savedSnapshot, "failed reversal save must preserve persisted financial data");
  assert.equal(rendered, 0, "failed reversal must not refresh as if it succeeded");
  h.failWrites(false);
  context.window.voiceLedgerConfirmReversal("work-to-reverse");
  assert.equal(h.RB.data.items.length, 2, "successful retry must save the reversal exactly once");
  assert.equal(h.RB.data.items[0].reversedBy, undefined, "successful reversal must not write back to the original movement");
  assert.equal(h.RB.data.items[1].reversalOf, h.RB.data.items[0].id);
  assert.equal(h.RB.data.items[1].rec, -40);
  assert.equal(rendered, 1);
}


{
  assert.ok(backupSource.includes("for (const key of SENSITIVE_SETTINGS) delete appData.settings[key]"),
    "sensitive integration credentials must be omitted from exported backups");
  const helperStart = backupSource.indexOf("function preserveLocalIntegrationSecrets(appData) {");
  const helperEnd = backupSource.indexOf("\n  }", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "restore must preserve only credentials already configured on this device");
  const preserve = vm.runInNewContext("(" + backupSource.slice(helperStart, helperEnd + 4) + ")", {
    SENSITIVE_SETTINGS: ["tgToken", "notionToken", "dropboxToken", "openaiKey", "fbApiKey"],
    RB: { data: { settings: { tgToken: "local-token", openaiKey: "local-openai-key" } } }
  });
  const restored = preserve({
    settings: {
      currency: "EUR",
      tgToken: "exported-token",
      notionToken: "exported-notion",
      dropboxToken: "exported-dropbox"
    }
  });
  assert.equal(restored.settings.currency, "EUR");
  assert.equal(restored.settings.tgToken, "local-token", "restore must retain this device's local Telegram token");
  assert.equal(restored.settings.openaiKey, "local-openai-key", "restore must retain this device's local OpenAI key");
  assert.equal(restored.settings.notionToken, undefined, "secrets from an imported file must not be imported");
  assert.equal(restored.settings.dropboxToken, undefined, "secrets from an imported file must not be imported");
}

console.log("Storage integrity tests passed.");
