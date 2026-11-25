import { names } from "./state.js";
import { classify } from "./count.js";
import { readBallot } from "./scanner.js";
import {
  app,
  modal,
  esc,
  ic,
  btn,
  heading,
  bind,
  toast,
  dialog,
  confirmAction,
} from "./ui.js";

function imageCanvas(source, w, h) {
  const scale = Math.min(1, 1600 / Math.max(w, h)),
    c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  return c;
}
function thumbnail(canvas, { x, y, w, h }) {
  const c = document.createElement("canvas");
  c.width = 76;
  c.height = 76;
  c.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, 76, 76);
  return c.toDataURL("image/jpeg", 0.85);
}
export class Entry {
  constructor({ election, save, leave, mode, record }) {
    Object.assign(this, { election, save, leave, mode, record });
    this.practice = mode === "practice";
    this.manual = mode === "manual";
    this.active = true;
    this.clearDraft();
    if (record) {
      this.ranks = [...record.ranks];
      this.checked = [...(record.checked || Array(5).fill(true))];
      this.photo = record.photo;
      this.crops = record.crops || [];
      this.selected = Math.max(0, this.checked.indexOf(false));
    }
    if (this.manual || record) this.editor();
    else this.capture();
  }
  clearDraft() {
    this.ranks = Array(5).fill(null);
    this.checked = Array(5).fill(false);
    this.selected = 0;
    this.photo = "";
    this.crops = [];
    this.message = "";
    this.dirty = false;
  }
  dispose() {
    this.active = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    clearTimeout(this.frameTimer);
  }
  title(name) {
    const id = this.record?.id || this.election().nextId;
    return heading(
      this.practice
        ? "Practice session"
        : this.record
          ? "Ballot register"
          : "Ballot desk",
      name,
      this.practice
        ? "Practice entries stay outside the election count."
        : "Ballot " +
            String(id).padStart(2, "0") +
            " · " +
            this.election().title +
            " · " +
            this.election().ballots.length +
            " recorded",
    );
  }
  async capture() {
    if (!this.active) return;
    app.innerHTML =
      this.title(this.practice ? "Practice scan" : "Scan ballots") +
      '<div class="panel card stack"><div class="camera"><video playsinline muted autoplay></video><span id="cammsg" role="status">Opening the rear camera…</span></div><p class="hint">Place one cut ballot upright in good light. Keep all five boxes visible and fill the frame.</p><div class="actions">' +
      btn("snap", "Capture ballot", "dark", "cam", true) +
      btn("photo", "Choose photo", "", "upload") +
      btn("manual", "Key in ranks", "ghost", "edit") +
      '</div><input type="file" class="off" id="photo" accept="image/*"></div>';
    this.video = app.querySelector("video");
    const msg = app.querySelector("#cammsg"),
      snap = app.querySelector('[data-act="snap"]'),
      file = app.querySelector("#photo");
    bind(app, {
      snap: () => {
        if (this.video.videoWidth)
          this.process(
            imageCanvas(
              this.video,
              this.video.videoWidth,
              this.video.videoHeight,
            ),
          );
      },
      photo: () => file.click(),
      manual: () => {
        this.manual = true;
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.editor();
      },
    });
    file.onchange = async () => {
      if (!file.files[0]) return;
      const url = URL.createObjectURL(file.files[0]);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        if (this.active)
          await this.process(
            imageCanvas(img, img.naturalWidth, img.naturalHeight),
          );
      } catch {
        toast("This photo could not be opened. Try a JPEG or enter the ranks.");
      } finally {
        URL.revokeObjectURL(url);
        file.value = "";
      }
    };
    try {
      if (!this.stream) {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });
        if (!this.active || !app.contains(msg)) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        this.stream = media;
      }
      this.video.srcObject = this.stream;
      await this.video.play();
      if (this.active && app.contains(msg)) {
        msg.hidden = true;
        snap.disabled = false;
      }
    } catch {
      if (app.contains(msg))
        msg.textContent =
          "Camera unavailable. Allow camera access, choose a photo, or key in the ranks.";
    }
  }
  async process(canvas) {
    if (this.busy || !this.active) return;
    this.busy = true;
    this.photo = canvas.toDataURL("image/jpeg", 0.8);
    this.dirty = true;
    app.innerHTML =
      this.title("Reading the ballot") +
      '<div class="card panel stack"><img class="sourcephoto" alt="Captured ballot" src="' +
      this.photo +
      '"><p role="status">Locating the five preference boxes…</p></div>';
    try {
      await new Promise((r) => setTimeout(r, 45));
      if (!this.active) return;
      const result = await readBallot(canvas);
      this.ranks = result.ranks;
      this.checked = result.states.map(
        (s, i) => s === "digit" && result.confidence[i] >= 0.8,
      );
      this.crops = result.boxes.map((b) => thumbnail(canvas, b));
      this.message = result.boxes.length
        ? "Compare each suggested rank with its handwritten box."
        : "Five boxes could not be located. Read the photo and enter the ranks, or retake it.";
      this.selected = Math.max(0, this.checked.indexOf(false));
    } catch {
      this.message =
        "The handwriting reader could not complete this scan. Enter the ranks from the photo.";
    } finally {
      this.busy = false;
      if (this.active) this.editor();
    }
  }
  editor() {
    if (!this.active) return;
    const title = this.record
      ? "Review ballot"
      : this.photo
        ? "Check the scan"
        : "Enter preferences";
    const guidance =
      this.message ||
      (this.record
        ? "Check the saved entry against the paper."
        : "Read the printed boxes from top to bottom. Tap the number beside each name.");
    app.innerHTML =
      this.title(title) +
      '<div class="entry ' +
      (this.crops.length === 5 ? "has-crops" : "") +
      '"><section class="card stack sourcecard"><h2>' +
      (this.photo ? "Original ballot" : "Printed ballot") +
      "</h2>" +
      (this.photo
        ? '<button class="imagebutton" data-act="zoom" aria-label="Enlarge original ballot"><img class="sourcephoto" alt="Original ballot, tap to enlarge" src="' +
          this.photo +
          '"><span class="zoomlabel">View full photo</span></button>'
        : '<p class="bodycopy">Seat of Trinity<br>Vote for your Preferred Candidates</p>') +
      '<p class="hint">' +
      esc(guidance) +
      "</p>" +
      (!this.record
        ? btn(
            "retake",
            this.photo ? "Retake or choose photo" : "Use camera",
            "",
            "cam",
          )
        : "") +
      '</section><section class="card"><div class="cardhead"><h2>Preferences</h2><span class="meta">Printed order</span></div><div id="rankrows"></div><div class="keypad" id="keys">' +
      [1, 2, 3, 4, 5, null]
        .map(
          (n) =>
            '<button type="button" class="btn" data-n="' +
            (n || 0) +
            '">' +
            (n || "Blank") +
            "</button>",
        )
        .join("") +
      '</div><p class="hint" id="feedback" role="status"></p><div class="actions captureactions">' +
      btn(
        "formal",
        this.practice
          ? "Finish practice"
          : this.record
            ? "Save ballot"
            : "Save & next",
        "dark",
        "check",
      ) +
      (!this.practice
        ? btn("defer", "Set aside") + btn("informal", "Mark informal", "ghost")
        : "") +
      "</div></section></div>";
    this.renderRows();
    app
      .querySelectorAll("[data-n]")
      .forEach(
        (b) => (b.onclick = () => this.setRank(Number(b.dataset.n) || null)),
      );
    bind(app, {
      zoom: () =>
        dialog(
          "Original ballot",
          '<img class="photozoom" alt="Captured ballot" src="' +
            this.photo +
            '">',
        ),
      retake: () => {
        const f = () => {
          this.clearDraft();
          this.manual = false;
          this.capture();
        };
        if (this.dirty)
          confirmAction(
            "Retake this ballot?",
            "The current unsaved entry will be cleared.",
            "Retake",
            f,
          );
        else f();
      },
      formal: () => this.submit("formal"),
      defer: () => this.commit("review"),
      informal: () =>
        confirmAction(
          "Record an informal ballot?",
          "Check the paper. This ballot will remain in the register and be excluded from the preference count.",
          "Record informal",
          () => this.commit("informal"),
        ),
    });
  }
  setRank(n) {
    const i = this.selected;
    this.ranks[i] = n;
    this.checked[i] = true;
    this.dirty = true;
    const next = this.checked.findIndex((v, j) => !v && j > i);
    this.selected =
      next >= 0
        ? next
        : this.checked.includes(false)
          ? this.checked.indexOf(false)
          : Math.min(4, i + 1);
    this.renderRows();
  }
  renderRows() {
    app.querySelector("#rankrows").innerHTML = names
      .map(
        (n, i) =>
          '<button type="button" class="entryrow ' +
          (this.selected === i ? "chosen" : "") +
          '" data-i="' +
          i +
          '" aria-pressed="' +
          (this.selected === i) +
          '"><span class="rankbox">' +
          (this.ranks[i] ?? (this.checked[i] ? "–" : "?")) +
          "</span><b>" +
          n +
          "</b>" +
          (!this.checked[i] ? '<span class="rowtag">Check</span>' : "") +
          (this.crops[i]
            ? '<img class="crop" alt="Handwritten box for ' +
              n +
              '" src="' +
              this.crops[i] +
              '">'
            : "") +
          "</button>",
      )
      .join("");
    app.querySelectorAll("[data-i]").forEach(
      (b) =>
        (b.onclick = () => {
          this.selected = Number(b.dataset.i);
          this.renderRows();
        }),
    );
    const all = this.checked.every(Boolean),
      validation = classify(this.ranks);
    app.querySelector("#feedback").textContent = all
      ? validation.reason || "All five preferences are present."
      : "Select a row, then tap its number or Blank.";
    app.querySelector('[data-act="formal"]').disabled = !(
      all && validation.formal
    );
  }
  async submit() {
    const valid = classify(this.ranks);
    if (!this.checked.every(Boolean) || !valid.formal) {
      toast("Check all five boxes first.");
      return;
    }
    if (valid.reason) {
      confirmAction(
        "Confirm the blank box",
        valid.reason + " Confirm that the square on the paper is empty.",
        "Confirm & save",
        () => this.commit("formal"),
      );
      return;
    }
    await this.commit("formal");
  }
  async commit(status) {
    if (this.busy || !this.active) return;
    if (this.practice) {
      this.dirty = false;
      toast("Practice complete. Your election count is unchanged.");
      this.leave("desk");
      return;
    }
    this.busy = true;
    const data = {
      ranks: [...this.ranks],
      checked: [...this.checked],
      photo: this.photo,
      crops: this.crops,
      status,
    };
    try {
      await this.save((store) => {
        if (this.record) {
          const i = store.ballots.findIndex((b) => b.id === this.record.id);
          if (i < 0) throw Error("This ballot was removed.");
          store.ballots[i] = { ...store.ballots[i], ...data };
        } else
          store.ballots.push({
            ...data,
            id: store.nextId++,
            created: Date.now(),
          });
        store.draws = {};
      });
      this.dirty = false;
      toast(
        status === "review" ? "Ballot set aside for review." : "Ballot saved.",
      );
      if (!this.active) return;
      if (this.record) {
        this.leave("register");
        return;
      }
      this.clearDraft();
      if (this.manual) this.editor();
      else this.capture();
    } finally {
      this.busy = false;
    }
  }
}
