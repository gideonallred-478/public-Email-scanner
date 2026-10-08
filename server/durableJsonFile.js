import { open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

const DIRECTORY_SYNC_UNSUPPORTED = new Set([
  "EACCES",
  "EISDIR",
  "EINVAL",
  "ENOTSUP",
  "EPERM",
]);

function defaultTempPath(targetPath) {
  return join(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`
  );
}

async function syncParentDirectory(path, openDirectory) {
  let handle;
  try {
    handle = await openDirectory(dirname(path), "r");
    await handle.sync();
  } catch (error) {
    if (!DIRECTORY_SYNC_UNSUPPORTED.has(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

export async function writeJsonAtomically(targetPath, value, dependencies = {}) {
  const makeTempPath = dependencies.makeTempPath ?? defaultTempPath;
  const openFile = dependencies.openFile ?? open;
  const renameFile = dependencies.renameFile ?? rename;
  const openDirectory = dependencies.openDirectory ?? open;
  const removeFile = dependencies.removeFile ?? ((path) => rm(path, { force: true }));
  const tempPath = makeTempPath(targetPath);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  let fileHandle;
  let fileClosed = false;
  let renamed = false;

  try {
    fileHandle = await openFile(tempPath, "wx", 0o600);
    await fileHandle.writeFile(serialized, "utf8");
    await fileHandle.sync();
    await fileHandle.close();
    fileClosed = true;
    await renameFile(tempPath, targetPath);
    renamed = true;
    await syncParentDirectory(targetPath, openDirectory);
  } finally {
    if (fileHandle && !fileClosed) {
      try {
        await fileHandle.close();
      } catch {
        // Preserve the original write/sync error.
      }
    }
    if (!renamed) {
      try {
        await removeFile(tempPath);
      } catch {
        // Preserve the original write/sync/rename error.
      }
    }
  }
}
