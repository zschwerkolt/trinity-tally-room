const DB_NAME = "trinity-tally-room-v1";
export const names = ["Coke", "Beer", "Red Wine", "Sprite", "White Wine"];
export const colours = ["#a84331", "#bb801d", "#82425f", "#36735d", "#6b6a99"];
export const defaults = {
  id: "election",
  title: "Seat of Trinity",
  expected: 15,
  ballots: [],
  draws: {},
  revision: 0,
  nextId: 1,
};
const ready = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () =>
    req.result.createObjectStore("elections", { keyPath: "id" });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
export async function read() {
  const db = await ready;
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("elections")
      .objectStore("elections")
      .get("election");
    req.onsuccess = () => resolve(req.result || structuredClone(defaults));
    req.onerror = () => reject(req.error);
  });
}
export async function update(revision, mutate) {
  const db = await ready;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("elections", "readwrite");
    const store = tx.objectStore("elections");
    const req = store.get("election");
    let next, error;
    req.onsuccess = () => {
      next = req.result || structuredClone(defaults);
      try {
        if (next.revision !== revision)
          throw Error(
            "Another tab changed the count. Reopen this screen and check your entry.",
          );
        mutate(next);
        next.revision++;
        store.put(next);
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () =>
      reject(
        error ||
          tx.error ||
          Error("Could not save this change on your device."),
      );
    tx.onerror = () => reject(tx.error);
  });
}
