/* Rimbook projects hub core — pure logic. A project is a private workspace: its own notes file, its own account (a dedicated
   side-ledger book, linked by id) and its own calendar items (tagged by project id). Independent of the main app's data. */
(function (root) {
  "use strict";
  const Ledger = (typeof module !== "undefined" && module.exports && typeof require === "function") ? require("./ledger-core.js") : root.RimbookLedgerCore;
  const VERSION = 1, STATUS = { active: "جارٍ", done: "مكتمل", archived: "مؤرشف" };
  const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
  const clone = v => JSON.parse(JSON.stringify(v));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const lc = v => text(v, 80).toLowerCase().replace(/\s+/g, " ");
  const emptyStore = () => ({ version: VERSION, projects: [], audit: [] });
  const audit = (s, ctx, action, projectId, detail) => s.audit.push({ id: ctx.id ? ctx.id + "-a" + s.audit.length : newId(), t: ctx.now || Date.now(), action, projectId: projectId || null, detail: detail || {} });

  function validateStore(store) {
    const errors = [], bad = m => { errors.push(m); return false; };
    if (!store || typeof store !== "object" || store.version !== VERSION || !Array.isArray(store.projects) || !Array.isArray(store.audit)) return { ok: false, errors: ["بنية غير صالحة"] };
    const ids = new Set();
    store.projects.forEach(p => {
      if (!p || typeof p.id !== "string" || !SAFE_ID.test(p.id) || ids.has(p.id)) return bad("معرّف مشروع غير صالح أو مكرر");
      ids.add(p.id);
      if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 60) bad("اسم مشروع غير صالح");
      if (!STATUS[p.status]) bad("حالة غير معروفة");
      if (p.bookId != null && !SAFE_ID.test(String(p.bookId))) bad("رابط حساب غير صالح");
      if (p.mainProjectId != null && p.mainProjectId !== "" && !SAFE_ID.test(String(p.mainProjectId))) bad("رابط مشروع غير صالح");
      if (!Array.isArray(p.files)) return bad("ملف المشروع تالف");
      const fids = new Set();
      p.files.forEach(f => { if (!f || typeof f.id !== "string" || !SAFE_ID.test(f.id) || fids.has(f.id) || typeof f.body !== "string" || typeof f.title !== "string") bad("ملاحظة مشروع تالفة"); else fids.add(f.id); });
    });
    const books = store.projects.filter(p => p.bookId).map(p => p.bookId);
    if (new Set(books).size !== books.length) bad("حساب واحد مربوط بأكثر من مشروع");
    const a = new Set(); store.audit.forEach(x => { if (!x || typeof x.id !== "string" || !SAFE_ID.test(x.id) || a.has(x.id)) bad("سجل تعديلات تالف"); else a.add(x.id); });
    return { ok: errors.length === 0, errors };
  }
  const finish = (s, extra) => { const v = validateStore(s); return v.ok ? Object.assign({ ok: true, store: s }, extra || {}) : { ok: false, error: v.errors[0] }; };

  function createProject(store, raw, ctx) {
    ctx = ctx || {};
    const name = text(raw && raw.name, 60);
    if (!name) return { ok: false, error: "اكتب اسم المشروع" };
    const s = clone(store);
    if (s.projects.some(p => p.status !== "archived" && lc(p.name) === lc(name))) return { ok: false, error: "يوجد مشروع بهذا الاسم" };
    const project = { id: ctx.id || newId(), name, client: text(raw.client, 60), description: text(raw.description, 500), status: "active",
      mainProjectId: raw.mainProjectId ? text(raw.mainProjectId, 80) : "", bookId: raw.bookId || null, startDate: Ledger.isDate(raw.startDate) ? raw.startDate : "", created: ctx.now || Date.now(), files: [] };
    s.projects.push(project); audit(s, ctx, "project_create", project.id, { name });
    return finish(s, { project });
  }
  function updateProject(store, id, fields, ctx) {
    const s = clone(store), p = s.projects.find(x => x.id === id);
    if (!p) return { ok: false, error: "المشروع غير موجود" };
    if (fields.name !== undefined) {
      const name = text(fields.name, 60); if (!name) return { ok: false, error: "اكتب اسم المشروع" };
      if (s.projects.some(o => o.id !== id && o.status !== "archived" && lc(o.name) === lc(name))) return { ok: false, error: "يوجد مشروع بهذا الاسم" };
      p.name = name;
    }
    ["client", "description"].forEach(k => { if (fields[k] !== undefined) p[k] = text(fields[k], k === "description" ? 500 : 60); });
    if (fields.mainProjectId !== undefined) p.mainProjectId = text(fields.mainProjectId, 80);
    if (fields.bookId !== undefined) p.bookId = fields.bookId || null;
    audit(s, ctx || {}, "project_update", id, {});
    return finish(s, { project: p });
  }
  function setStatus(store, id, status, ctx) {
    if (!STATUS[status]) return { ok: false, error: "حالة غير معروفة" };
    const s = clone(store), p = s.projects.find(x => x.id === id);
    if (!p) return { ok: false, error: "المشروع غير موجود" };
    p.status = status; audit(s, ctx || {}, "project_status", id, { status });
    return finish(s);
  }
  function addFile(store, id, raw, ctx) {
    ctx = ctx || {};
    const s = clone(store), p = s.projects.find(x => x.id === id);
    if (!p) return { ok: false, error: "المشروع غير موجود" };
    const title = text(raw.title, 80), body = text(raw.body, 4000);
    if (!title && !body) return { ok: false, error: "اكتب عنواناً أو نصاً" };
    const f = { id: ctx.id || newId(), title: title || body.slice(0, 40), body, at: ctx.now || Date.now() };
    p.files.push(f); return finish(s, { file: f });
  }
  function editFile(store, id, fileId, raw) {
    const s = clone(store), p = s.projects.find(x => x.id === id), f = p && p.files.find(x => x.id === fileId);
    if (!f) return { ok: false, error: "الملاحظة غير موجودة" };
    const title = text(raw.title, 80), body = text(raw.body, 4000);
    if (!title && !body) return { ok: false, error: "اكتب عنواناً أو نصاً" };
    f.title = title || body.slice(0, 40); f.body = body; f.edited = Date.now();
    return finish(s);
  }
  function deleteFile(store, id, fileId) {
    const s = clone(store), p = s.projects.find(x => x.id === id);
    if (!p || !p.files.some(x => x.id === fileId)) return { ok: false, error: "الملاحظة غير موجودة" };
    p.files = p.files.filter(x => x.id !== fileId);
    return finish(s);
  }
  const makeEnvelope = (store, now) => { const data = { projects: clone(store.projects), audit: clone(store.audit) }; return { format: "rimbook-projects", version: VERSION, exportedAt: now || Date.now(), data, checksum: Ledger.checksum(data) }; };
  function verifyEnvelope(env) {
    if (!env || env.format !== "rimbook-projects") return { ok: false, error: "هذا ليس ملف مشاريع ريمبوك" };
    if (env.version !== VERSION) return { ok: false, error: "إصدار الملف غير مدعوم" };
    if (!env.data || Ledger.checksum(env.data) !== env.checksum) return { ok: false, error: "الملف تالف أو عُدّل يدوياً (فشل فحص السلامة)" };
    const v = validateStore({ version: VERSION, projects: env.data.projects, audit: env.data.audit });
    return v.ok ? { ok: true, data: env.data } : { ok: false, error: "محتوى الملف غير صالح: " + v.errors[0] };
  }
  function importEnvelope(store, env, mode, ctx) {
    ctx = ctx || {};
    const ver = verifyEnvelope(env); if (!ver.ok) return ver;
    const data = clone(ver.data); let s;
    if (mode === "replace") s = { version: VERSION, projects: data.projects, audit: data.audit };
    else {                                                          // append: copies get fresh ids and NO account link (the ledger ids may not exist here)
      s = clone(store); const used = new Set(s.projects.map(p => p.id));
      data.projects.forEach(p => { if (used.has(p.id)) p.id = newId(); used.add(p.id); p.bookId = null; p.name = s.projects.some(o => lc(o.name) === lc(p.name)) ? (p.name + " (مستورد)").slice(0, 60) : p.name; s.projects.push(p); });
    }
    audit(s, ctx, mode === "replace" ? "restore" : "import", null, { projects: data.projects.length });
    return finish(s);
  }
  const api = { STATUS, emptyStore, validateStore, createProject, updateProject, setStatus, addFile, editFile, deleteFile, makeEnvelope, verifyEnvelope, importEnvelope };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RimbookProjectsCore = api;
})(typeof window !== "undefined" ? window : globalThis);
