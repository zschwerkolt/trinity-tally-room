import { count } from "./count.js";
import { names, colours } from "./state.js";
import {
  app,
  ic,
  btn,
  esc,
  bind,
  heading,
  toast,
  confirmAction,
  dialog,
} from "./ui.js";

function chooseByLot(candidates) {
  const n = candidates.length,
    limit = 2 ** 32 - (2 ** 32 % n),
    random = new Uint32Array(1);
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return candidates[random[0] % n];
}
function imageReport(election, report) {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1000;
  const g = c.getContext("2d"),
    last = report.rounds.at(-1),
    won = report.winner !== null;
  g.fillStyle = "#f8f7f1";
  g.fillRect(0, 0, 1200, 1000);
  g.fillStyle = "#102f42";
  g.fillRect(0, 0, 1200, 300);
  g.fillStyle = "#ffb894";
  g.font = "600 23px DM, sans-serif";
  g.fillText("VICTORIAN STATE ELECTION 2026   /   PARTY COUNT", 58, 61);
  g.fillStyle = "#fffaf2";
  g.font = "600 64px SourceSerif, Georgia";
  g.fillText(election.title, 54, 150, 1090);
  g.font = "500 38px SourceSerif, Georgia";
  g.fillText(
    won ? names[report.winner] + " elected" : "Final count tied",
    58,
    226,
  );
  g.fillStyle = "#153243";
  g.font = "600 34px SourceSerif, Georgia";
  g.fillText("Distribution of preferences", 58, 375);
  const dx = 173,
    left = 420;
  g.font = "600 20px DM, sans-serif";
  g.fillText("CANDIDATE", 60, 442);
  report.rounds.forEach((_, j) =>
    g.fillText("ROUND " + (j + 1), left + dx * j, 442),
  );
  names.forEach((name, i) => {
    const y = 500 + i * 64;
    g.strokeStyle = "#d7dacd";
    g.beginPath();
    g.moveTo(55, y + 19);
    g.lineTo(1140, y + 19);
    g.stroke();
    g.fillStyle = colours[i];
    g.fillRect(60, y - 21, 7, 25);
    g.fillStyle = "#183341";
    g.font = "500 28px DM, sans-serif";
    g.fillText(name, 83, y);
    report.rounds.forEach((r, j) =>
      g.fillText(
        r.active.includes(i) ? String(r.totals[i]) : "–",
        left + dx * j + 29,
        y,
      ),
    );
  });
  const formal = last.totals.reduce((a, b) => a + b, 0);
  g.font = "500 25px DM, sans-serif";
  g.fillText(
    formal +
      " formal ballots  ·  " +
      election.ballots.filter((b) => b.status === "informal").length +
      " informal  ·  " +
      Math.floor(formal / 2 + 1) +
      " to win",
    58,
    869,
  );
  g.font = "400 20px DM, sans-serif";
  g.fillStyle = "#566764";
  g.fillText(
    "Trinity Tally Room   /   Independent election party result",
    58,
    949,
  );
  return c;
}
async function share(election, report) {
  const blob = await new Promise((r) =>
    imageReport(election, report).toBlob(r, "image/png"),
  );
  if (!blob) throw Error("Could not create the result image.");
  const file = new File([blob], "trinity-election-result.png", {
    type: "image/png",
  });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: election.title, files: [file] });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  dialog(
    "Result image",
    '<div class="stack"><img class="photozoom" alt="Election result with round totals" src="' +
      url +
      '"><a class="btn dark" download="trinity-election-result.png" href="' +
      url +
      '">Download result</a></div>',
  );
  document
    .querySelector("#modal")
    .addEventListener("close", () => URL.revokeObjectURL(url), { once: true });
}
export class Reveal {
  constructor({ election, save, go }) {
    Object.assign(this, { election, save, go });
    this.index = -1;
    this.render();
  }
  dispose() {
    clearTimeout(this.timer);
    this.playing = false;
    this.disposed = true;
  }
  render() {
    if (this.disposed) return;
    const e = this.election(),
      formal = e.ballots.filter((b) => b.status === "formal"),
      review = e.ballots.filter((b) => b.status === "review").length,
      informal = e.ballots.length - formal.length - review;
    const head = heading(
      "Election night",
      "Results",
      e.title + " · Single-seat preferential count",
    );
    if (this.index < 0 || !formal.length || review) {
      app.innerHTML =
        head +
        '<section class="card empty panel"><span class="tileicon">' +
        ic("chart") +
        "</span><h2>" +
        (review
          ? "Review outstanding ballots"
          : formal.length
            ? "Ready for the reveal"
            : "Awaiting the first ballot") +
        '</h2><p class="bodycopy">' +
        (review
          ? review +
            " set aside. Resolve each paper before starting the reveal."
          : formal.length
            ? formal.length +
              " formal · " +
              informal +
              " informal · " +
              e.ballots.length +
              " of " +
              e.expected +
              " expected ballots recorded."
            : "Once formal ballots are recorded, play the count round by round.") +
        '</p><div class="actions">' +
        (review
          ? btn("review", "Open ballot register", "dark")
          : formal.length
            ? btn("begin", "Reveal first preferences", "dark", "play")
            : btn("scan", "Scan ballots", "dark", "scan")) +
        "</div></section>";
      bind(app, {
        review: () => this.go("register"),
        scan: () => this.go("scan"),
        begin: () => {
          this.index = 0;
          this.render();
        },
      });
      return;
    }
    const report = count(
        formal.map((b) => b.ranks),
        e.draws,
      ),
      round = report.rounds[this.index],
      prev = report.rounds[this.index - 1],
      last = this.index === report.rounds.length - 1;
    const draw = last && report.tie,
      finished = last && !draw,
      won = finished && report.winner !== null;
    const name = won
      ? names[report.winner] + " elected"
      : finished
        ? "Final count tied"
        : this.index === 0
          ? "First preferences"
          : "Preferences redistributed";
    const moved =
      prev && prev.excluded !== null
        ? names[prev.excluded] +
          " excluded. " +
          (prev.totals[prev.excluded]
            ? prev.transfers
                .map((n, i) => (n ? n + " to " + names[i] : ""))
                .filter(Boolean)
                .join(", ") + "."
            : "No votes to transfer.")
        : "";
    const margin = won
      ? Math.abs(round.totals[round.active[0]] - round.totals[round.active[1]])
      : 0;
    const previousWidths = names.map(
      (_, i) => ((prev?.totals[i] ?? 0) * 100) / formal.length,
    );
    app.innerHTML =
      head +
      '<div class="panel stack"><div class="resulthead"><div class="eyebrow">Round ' +
      (this.index + 1) +
      " · " +
      (finished ? "Final count" : "Distribution of preferences") +
      "</div><h2>" +
      esc(name) +
      "</h2><p>" +
      (won
        ? round.totals[report.winner] +
          " of " +
          formal.length +
          " formal votes · Margin of " +
          margin +
          " " +
          (margin === 1 ? "vote" : "votes")
        : finished
          ? "Recheck the paper ballots. If the tie stands, the election remains undecided."
          : moved || "Every formal ballot starts with its first preference.") +
      '</p></div><section class="card"><div class="between"><h2>Vote tally</h2><span class="meta">' +
      (Math.floor(formal.length / 2) + 1) +
      ' to win</span></div><div class="bars">' +
      names
        .map(
          (n, i) =>
            '<div class="' +
            (round.active.includes(i) ? "" : "out") +
            '"><div class="barline"><b>' +
            n +
            "</b><span>" +
            (prev?.transfers[i]
              ? '<span class="transfer">+' + prev.transfers[i] + " </span>"
              : "") +
            (round.active.includes(i) ? round.totals[i] : "Excluded") +
            '</span></div><div class="bartrack"><i style="width:' +
            previousWidths[i] +
            "%;background:" +
            colours[i] +
            '" data-width="' +
            (round.totals[i] * 100) / formal.length +
            '"></i></div></div>',
        )
        .join("") +
      "</div>" +
      (moved && finished ? '<p class="hint">' + esc(moved) + "</p>" : "") +
      (draw
        ? '<div class="soft notice"><b>Draw by lot required</b><p>' +
          draw.candidates.map((i) => names[i]).join(", ") +
          " are tied for exclusion and the earlier rounds cannot separate them. Draw once to select the candidate to exclude.</p></div>"
        : "") +
      '<div class="actions roundcontrols">' +
      (draw
        ? btn("draw", "Draw by lot", "dark")
        : finished
          ? btn("share", "Share result", "dark", "share")
          : btn("next", "Next round", "dark", "arrow")) +
      (!finished && !draw
        ? btn("auto", this.playing ? "Pause" : "Play all", "", "play")
        : "") +
      (this.index > 0 ? btn("back", "Previous", "ghost", "back") : "") +
      (finished ? btn("replay", "Replay", "ghost", "play") : "") +
      '</div></section><p class="hint">' +
      formal.length +
      " formal · " +
      informal +
      " informal · Federal House-style preference distribution</p></div>";
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        app
          .querySelectorAll("[data-width]")
          .forEach((b) => (b.style.width = b.dataset.width + "%")),
      ),
    );
    clearTimeout(this.timer);
    if (draw || finished) this.playing = false;
    bind(app, {
      next: () => {
        this.index++;
        this.render();
      },
      back: () => {
        this.playing = false;
        this.index--;
        this.render();
      },
      auto: () => {
        this.playing = !this.playing;
        this.render();
      },
      replay: () => {
        this.index = 0;
        this.render();
      },
      share: () => share(e, report),
      draw: () =>
        confirmAction(
          "Draw for exclusion?",
          draw.candidates.map((i) => names[i]).join(", ") +
            ". The selection will be random and saved for replay.",
          "Draw now",
          async () => {
            const id = chooseByLot(draw.candidates);
            await this.save((store) => {
              store.draws[draw.key] = id;
            });
            toast(names[id] + " drawn for exclusion.");
            this.render();
          },
        ),
    });
    if (this.playing)
      this.timer = setTimeout(() => {
        this.index++;
        this.render();
      }, 3000);
  }
}
