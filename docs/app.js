import { names, defaults, read, update } from "./state.js";
import { Entry } from "./entry.js";
import { Reveal } from "./results.js";
import {
  app,
  modal,
  ic,
  esc,
  btn,
  heading,
  bind,
  dialog,
  toast,
  confirmAction,
} from "./ui.js";

let election,
  entry,
  reveal,
  current = "",
  filter = "all";
const tabKey = "trinity:changed";
const offline = document.querySelector("#offline");
offline.textContent = "Checking offline";
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then(
      (reg) =>
        new Promise((resolve, reject) => {
          const installing = reg.installing;
          if (installing)
            installing.addEventListener("statechange", () => {
              if (installing.state === "redundant")
                reject(Error("Offline installation failed"));
            });
          navigator.serviceWorker.ready.then(resolve, reject);
        }),
    )
    .then(async (reg) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => {
        const ok = e.data === "cached";
        offline.textContent = ok ? "Ready offline" : "Online only";
        offline.classList.toggle("ready", ok);
        channel.port1.close();
      };
      reg.active.postMessage("cache-status", [channel.port2]);
    })
    .catch(() => (offline.textContent = "Online only"));
} else offline.textContent = "Online only";
const settingsButton = document.querySelector("#settings");
settingsButton.innerHTML = ic("settings");

function settings() {
  if (!election) return;
  dialog(
    "Election settings",
    '<form id="settingsform" class="stack"><label class="field">Election title<input name="title" required maxlength="50" value="' +
      esc(election.title) +
      '"></label><label class="field">Expected paper ballots<input type="number" name="expected" min="1" max="999" inputmode="numeric" value="' +
      election.expected +
      '" required></label><p class="hint">The expected total is a guide. The five candidates follow the order on the printed Seat of Trinity ballot.</p><div class="actions"><button class="btn dark" type="submit">Save settings</button>' +
      btn(
        "reset",
        "Clear election",
        "ghost danger",
        "",
        !election.ballots.length,
      ) +
      "</div></form>",
  );
  const form = modal.querySelector("form");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const data = new FormData(form),
      title = String(data.get("title")).trim(),
      expected = Number(data.get("expected"));
    if (
      !title ||
      !Number.isInteger(expected) ||
      expected < 1 ||
      expected > 999
    ) {
      toast("Enter a title and an expected count from 1 to 999.");
      return;
    }
    try {
      await save((s) => {
        s.title = title;
        s.expected = expected;
      });
      modal.close();
      if (!entry) render();
      toast("Election settings saved.");
    } catch (e) {
      toast(e.message);
    }
  };
  bind(form, {
    reset: () =>
      confirmAction(
        "Clear this election?",
        "This removes every recorded ballot, photograph and tie draw from this device.",
        "Clear election",
        async () => {
          await save((s) => {
            s.ballots = [];
            s.draws = {};
            s.nextId = 1;
          });
          if (entry) entry.dirty = false;
          go("desk");
          toast("Election cleared.");
        },
      ),
  });
}
settingsButton.onclick = settings;
async function save(mutate) {
  try {
    election = await update(election.revision, mutate);
  } catch (error) {
    election = await read();
    throw error;
  }
  try {
    localStorage.setItem(tabKey, String(election.revision));
  } catch {}
}
const go = (dest) => {
  if (location.hash === "#" + dest) {
    render();
    return;
  }
  location.hash = dest;
};
function numStatus(status) {
  return election.ballots.filter((b) => b.status === status).length;
}
function desk() {
  const total = election.ballots.length,
    progress = Math.min(100, (100 * total) / election.expected);
  app.innerHTML =
    '<section class="hero"><div class="heroart" aria-hidden="true"></div><div class="herocopy"><div class="eyebrow">Victorian State Election 2026</div><h1>' +
    esc(election.title) +
    '</h1><p>A single-seat preferential count.<br>Five candidates on the party ballot.</p><div class="actions">' +
    btn("scan", "Scan ballots", "primary", "scan") +
    btn("manual", "Enter manually", "glass", "edit") +
    '</div></div></section><div class="sectionline"><h2>Count overview</h2><span>Saturday 28 November 2026</span></div><div class="grid"><section class="card"><div class="cardhead"><span class="tileicon">' +
    ic("box") +
    '</span><h3>Ballot intake</h3><span class="status push"><i class="dot"></i>' +
    (total === 0
      ? "Awaiting ballots"
      : numStatus("review")
        ? "Review pending"
        : total >= election.expected
          ? "Stack recorded"
          : "In progress") +
    '</span></div><div class="bigcount"><strong>' +
    total +
    "</strong><span>of " +
    election.expected +
    ' expected ballots</span></div><div class="progress" aria-label="' +
    Math.round(progress) +
    ' percent recorded"><i style="width:' +
    progress +
    '%"></i></div><div class="metrics">' +
    [
      ["formal", "Formal"],
      ["review", "To review"],
      ["informal", "Informal"],
    ]
      .map(
        ([s, label]) =>
          '<div class="metric"><b>' +
          numStatus(s) +
          "</b><span>" +
          label +
          "</span></div>",
      )
      .join("") +
    '</div><div class="cardfoot"><button class="textbtn" data-act="register">Open ballot register ' +
    ic("arrow") +
    "</button>" +
    (total
      ? '<button class="textbtn" data-act="results">View results ' +
        ic("chart") +
        "</button>"
      : "") +
    '</div></section><section class="card ballotcard"><div class="cardhead"><span class="tileicon rust">' +
    ic("paper") +
    '</span><h3>Ballot paper</h3><span class="meta">Printed order</span></div><ol class="paperlist">' +
    names
      .map(
        (name, i) =>
          '<li><span class="rankbox">' +
          String(i + 1).padStart(2, "0") +
          "</span>" +
          name +
          "</li>",
      )
      .join("") +
    '</ol></section></div><section class="practice"><span class="tileicon">' +
    ic("cam") +
    '</span><div><h3>Practice scan</h3><p>Try a paper ballot before opening the count.</p></div><button class="textbtn" data-act="practice">Try scanner ' +
    ic("arrow") +
    "</button></section>";
  bind(app, {
    scan: () => go("scan"),
    manual: () => go("manual"),
    register: () => go("register"),
    practice: () => go("practice"),
    results: () => go("results"),
  });
}
function register() {
  const ballots = [...election.ballots]
    .reverse()
    .filter((b) => filter === "all" || b.status === filter);
  app.innerHTML =
    heading(
      "Count workspace",
      "Ballot register",
      "Inspect saved papers, correct an entry or resolve a ballot set aside for review.",
    ) +
    '<section class="card panel"><div class="between sectop"><label class="field"><span class="sr">Filter ballots</span><select id="filter">' +
    [
      ["all", "All ballots"],
      ["review", "To review"],
      ["formal", "Formal"],
      ["informal", "Informal"],
    ]
      .map(
        ([v, l]) =>
          '<option value="' +
          v +
          '" ' +
          (v === filter ? "selected" : "") +
          ">" +
          l +
          "</option>",
      )
      .join("") +
    "</select></label>" +
    btn("scan", "Scan ballots", "dark", "scan") +
    "</div>" +
    (ballots.length
      ? ballots
          .map(
            (b) =>
              '<div class="registeritem"><span class="regno">Ballot ' +
              String(b.id).padStart(2, "0") +
              '</span><span class="pill ' +
              b.status +
              '">' +
              { formal: "Formal", informal: "Informal", review: "To review" }[
                b.status
              ] +
              '</span><button class="textbtn push" data-edit="' +
              b.id +
              '">Review ' +
              ic("arrow") +
              "</button></div>",
          )
          .join("")
      : '<div class="empty"><span class="tileicon">' +
        ic("book") +
        "</span><h2>" +
        (election.ballots.length
          ? "No matching ballots"
          : "Register is empty") +
        '</h2><p class="bodycopy">Saved ballots appear here in the order received, newest first.</p></div>') +
    (election.ballots.length
      ? '<div class="cardfoot">' +
        btn("undo", "Undo last ballot", "ghost danger") +
        '<span class="meta">' +
        election.ballots.length +
        " recorded</span></div>"
      : "") +
    "</section>";
  app.querySelector("#filter").onchange = (e) => {
    filter = e.target.value;
    register();
  };
  app
    .querySelectorAll("[data-edit]")
    .forEach((b) => (b.onclick = () => go("edit/" + b.dataset.edit)));
  bind(app, {
    scan: () => go("scan"),
    undo: () => {
      const last = election.ballots.at(-1);
      confirmAction(
        "Undo ballot " + last.id + "?",
        "This removes the most recently recorded paper. You can scan or enter it again.",
        "Undo ballot",
        async () => {
          await save((s) => {
            s.ballots = s.ballots.filter((b) => b.id !== last.id);
            s.draws = {};
          });
          register();
          toast("Last ballot removed.");
        },
      );
    },
  });
}
function render() {
  if (!election) return;
  entry?.dispose();
  entry = null;
  reveal?.dispose();
  reveal = null;
  if (modal.open) modal.close();
  let dest = location.hash.slice(1) || "desk",
    kind = dest.split("/")[0];
  if (
    ![
      "desk",
      "scan",
      "practice",
      "manual",
      "register",
      "edit",
      "results",
    ].includes(kind)
  ) {
    dest = "desk";
    kind = "desk";
  }
  const record =
    kind === "edit"
      ? election.ballots.find((b) => b.id === Number(dest.split("/")[1]))
      : null;
  if (kind === "edit" && !record) {
    go("register");
    return;
  }
  current = dest;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active =
      a.dataset.nav ===
      (kind === "edit"
        ? "register"
        : kind === "results"
          ? "results"
          : kind === "register"
            ? "register"
            : "desk");
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (kind === "desk") desk();
  else if (kind === "register") register();
  else if (kind === "results")
    reveal = new Reveal({ election: () => election, save, go });
  else
    entry = new Entry({
      election: () => election,
      save,
      leave: go,
      mode: kind,
      record,
    });
  window.scrollTo({ top: 0, behavior: "instant" });
}
window.addEventListener("hashchange", () => {
  if (entry?.dirty && current !== location.hash.slice(1)) {
    const target = location.hash.slice(1) || "desk";
    history.replaceState(null, "", "#" + current);
    confirmAction(
      "Leave this entry?",
      "Your current ballot has unsaved marks. Saved ballots stay in the register.",
      "Leave entry",
      () => {
        entry.dirty = false;
        go(target);
      },
    );
    return;
  }
  render();
});
window.addEventListener("beforeunload", (ev) => {
  if (entry?.dirty) {
    ev.preventDefault();
    ev.returnValue = "";
  }
});
window.addEventListener("storage", async (ev) => {
  if (ev.key !== tabKey) return;
  if (entry) {
    toast("Another tab changed the count. Finish ballot entry in one tab.");
    return;
  }
  election = await read();
  render();
});
try {
  election = await read();
  render();
} catch {
  app.innerHTML =
    '<section class="card"><h2>Local storage unavailable</h2><p class="bodycopy">Open this link directly in Safari or Chrome and allow site storage to start the count.</p></section>';
}
