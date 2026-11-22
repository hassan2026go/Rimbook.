/* Typed project field: the user writes the real project name (with suggestions
   from existing projects). There is no built-in "general" project. A name that
   does not exist yet is created when the record is saved. */
(function () {
  "use strict";
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const projects = () => ((window.RB && RB.data && RB.data.projects) || []).filter(p => p && String(p.name || "").trim());

  window.rimbookProjectInput = function (id, selectedId, label) {
    const list = projects();
    const current = list.find(p => String(p.id) === String(selectedId || ""));
    return '<label class="muted" for="' + id + '">' + esc(label || "اسم المشروع (اختياري)") + '</label>' +
      '<input id="' + id + '" list="' + id + '-list" autocomplete="off" maxlength="120" placeholder="اكتب اسم المشروع كما تريده، أو اتركه فارغاً" value="' + esc(current ? current.name : "") + '" style="width:100%;margin:4px 0 10px">' +
      '<datalist id="' + id + '-list">' + list.map(p => '<option value="' + esc(p.name) + '"></option>').join("") + '</datalist>';
  };

  /* Returns the project id for the typed name, creating the project if needed. null = no project. */
  window.rimbookProjectFromInput = function (id) {
    const el = document.getElementById(id);
    const name = el ? String(el.value || "").trim().replace(/\s+/g, " ") : "";
    if (!name) return null;
    const found = projects().find(p => String(p.name).trim().toLowerCase() === name.toLowerCase());
    if (found) return String(found.id);
    const project = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, color: "#22d3ee", budget: 0, status: "active", createdAt: Date.now() };
    return RB.transact(d => { d.projects.push(project); }) ? project.id : null;
  };
})();
