import assert from "node:assert/strict";
import test from "node:test";
import { writeJsonAtomically } from "../../server/durableJsonFile.js";

test("durable JSON writes fsync file before rename and directory after rename", async () => {
  const events = [];
  const fileHandle = {
    async writeFile(value) {
      events.push(["write", value]);
    },
    async sync() {
      events.push(["file-sync"]);
    },
    async close() {
      events.push(["file-close"]);
    },
  };
  const directoryHandle = {
    async sync() {
      events.push(["directory-sync"]);
    },
    async close() {
      events.push(["directory-close"]);
    },
  };

  await writeJsonAtomically("C:/data/alerts.json", { ok: true }, {
    makeTempPath: () => "C:/data/.alerts.test.tmp",
    openFile: async (path, flags) => {
      events.push(["open-file", path, flags]);
      return fileHandle;
    },
    renameFile: async (from, to) => events.push(["rename", from, to]),
    openDirectory: async (path) => {
      events.push(["open-directory", path]);
      return directoryHandle;
    },
    removeFile: async () => events.push(["remove"]),
  });

  assert.deepEqual(events.map((entry) => entry[0]), [
    "open-file",
    "write",
    "file-sync",
    "file-close",
    "rename",
    "open-directory",
    "directory-sync",
    "directory-close",
  ]);
});

test("durable JSON writes close and remove a temp file after failure", async () => {
  const events = [];
  await assert.rejects(
    () => writeJsonAtomically("C:/data/alerts.json", { ok: true }, {
      makeTempPath: () => "C:/data/.alerts.test.tmp",
      openFile: async () => ({
        async writeFile() { events.push("write"); },
        async sync() { throw new Error("disk failure"); },
        async close() { events.push("close"); },
      }),
      renameFile: async () => events.push("rename"),
      openDirectory: async () => { throw new Error("not reached"); },
      removeFile: async () => events.push("remove"),
    }),
    /disk failure/
  );
  assert.deepEqual(events, ["write", "close", "remove"]);
});
