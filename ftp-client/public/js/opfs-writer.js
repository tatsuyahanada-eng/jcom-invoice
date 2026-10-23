// Worker: write a Blob into OPFS with a sync access handle (Safari fallback).
self.onmessage = async (e) => {
  const { id, segs, blob } = e.data;
  let handle;
  try {
    let d = await navigator.storage.getDirectory();
    for (const s of segs.slice(0, -1)) d = await d.getDirectoryHandle(s, { create: true });
    const fh = await d.getFileHandle(segs[segs.length - 1], { create: true });
    handle = await fh.createSyncAccessHandle();
    handle.truncate(0);
    handle.write(new Uint8Array(await blob.arrayBuffer()), { at: 0 });
    handle.flush();
    self.postMessage({ id });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  } finally {
    handle?.close();
  }
};
