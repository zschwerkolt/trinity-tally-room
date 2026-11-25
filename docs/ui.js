const paths = {
  settings:
    '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  scan: '<path d="M3 8V4h5m8 0h5v4M3 16v4h5m8 0h5v-4M7 12h10"/>',
  edit: '<path d="m4 16 11-11 4 4L8 20l-5 1zM13 7l4 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  book: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
  paper: '<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h6"/>',
  box: '<path d="M3 13h18v8H3zM3 13l3-4h4m6 0h2l3 4M9 12h6m-6-9 5-2 3 6-5 2z"/>',
  cam: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  chart: '<path d="M4 3v17h17M8 16v-5m5 5V7m5 9v-7"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M7 9H4v12h16V9h-3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
};
export function ic(n) {
  return (
    '<svg aria-hidden="true" class="icon" viewBox="0 0 24 24">' +
    (paths[n] || "") +
    "</svg>"
  );
}
export function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function btn(action, title, kind = "", icon = "", disabled = false) {
  return (
    '<button type="button" class="btn ' +
    kind +
    '" data-act="' +
    action +
    '" ' +
    (disabled ? "disabled" : "") +
    ">" +
    (icon ? ic(icon) : "") +
    esc(title) +
    "</button>"
  );
}
export const app = document.querySelector("#app"),
  modal = document.querySelector("#modal");
let timer;
export function toast(s) {
  const el = document.querySelector("#toast");
  el.textContent = s;
  clearTimeout(timer);
  timer = setTimeout(() => (el.textContent = ""), 3800);
}
export function dialog(title, body) {
  if (modal.open) modal.close();
  modal.innerHTML =
    '<div class="dialogbody"><div class="cardhead"><h2>' +
    esc(title) +
    '</h2><button type="button" class="iconbutton" aria-label="Close" data-close>' +
    ic("close") +
    "</button></div>" +
    body +
    "</div>";
  modal.showModal();
  modal.querySelector("[data-close]").onclick = () => modal.close();
}
export function confirmAction(title, message, label, action) {
  dialog(
    title,
    '<div class="stack"><p class="bodycopy">' +
      esc(message) +
      '</p><div class="actions">' +
      btn("confirm", label, "dark") +
      btn("cancel", "Cancel") +
      "</div></div>",
  );
  modal.querySelector('[data-act="cancel"]').onclick = () => modal.close();
  modal.querySelector('[data-act="confirm"]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    modal.close();
    try {
      await action();
    } catch (err) {
      toast(err.message);
    }
  };
}
export function heading(label, title, desc = "") {
  return (
    '<div class="subhead"><div class="kicker">' +
    esc(label) +
    "</div><h1>" +
    esc(title) +
    "</h1>" +
    (desc ? '<p class="bodycopy">' + esc(desc) + "</p>" : "") +
    "</div>"
  );
}
export function bind(root, actions) {
  root.querySelectorAll("[data-act]").forEach((b) => {
    const fn = actions[b.dataset.act];
    if (fn)
      b.onclick = async (e) => {
        try {
          await fn(e, b);
        } catch (err) {
          toast(err.message || String(err));
        }
      };
  });
}
