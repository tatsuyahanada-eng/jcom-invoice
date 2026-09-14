/* サーバー同期（PC・スマホでデータを共有する）
 *
 * 端末側の IndexedDB は「オフラインでも撮影・入力できるようにするための控え」で、
 * 正となるデータは MySQL 側にあります。
 *
 *   送信: dirty=1 の明細（削除はdeleted=1のtombstoneとして送る）
 *   受信: 前回の同期カーソル(server_seq)より新しい行だけ
 *   競合: 同じ明細を両方で直した場合は updatedAt が新しい方を採用
 *
 * 端末の時計がずれていると競合時に意図しない側が残るため、
 * 端末の日時は「自動設定」にしておいてください。
 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};

  const SINCE_KEY = 'syncSince';
  const listeners = [];
  let state = { phase: 'off', message: '', pending: 0, lastSyncAt: 0, error: '' };
  let running = null;

  function onChange(fn) { listeners.push(fn); }
  function emit(patch) {
    state = Object.assign({}, state, patch);
    for (const fn of listeners) {
      try { fn(state); } catch (e) { console.error(e); }
    }
  }
  function status() { return Object.assign({}, state); }

  /** サーバーへ送るフィールドだけを取り出す（画像とローカル管理用の項目は除く） */
  function toWire(rec) {
    return {
      id: rec.id,
      staff: rec.staff || '',
      date: rec.date || '',
      time: rec.time || '',
      type: rec.type || '',
      name: rec.name || '',
      amount: Number(rec.amount) || 0,
      note: rec.note || '',
      source: rec.source || '',
      confidence: rec.confidence || null,
      rawText: (rec.rawText || '').slice(0, 3000),
      // hasImage は送らない。サーバー側は image.php で実際に画像を受け取ったときだけ
      // 立てる。端末が先に true を送ると、他の端末が「まだ無い画像」を読みに行って
      // サムネイルが出なくなるため。
      deleted: rec.deleted ? 1 : 0,
      updatedAt: Number(rec.updatedAt) || Date.now(),
    };
  }

  /**
   * サーバーから来た1件を、手元の1件と突き合わせる。
   * @returns {object|null} 保存すべきレコード。手元のほうが新しければ null
   */
  function mergeOne(local, incoming) {
    const localUpdated = local ? Number(local.updatedAt) || 0 : -1;
    const incomingUpdated = Number(incoming.updatedAt) || 0;

    // 手元の未送信の編集のほうが新しければ、サーバーの内容では上書きしない
    if (local && local.dirty && localUpdated > incomingUpdated) return null;
    if (local && localUpdated > incomingUpdated) return null;

    const merged = Object.assign({}, local || {}, incoming);
    merged.month = (merged.date || '').slice(0, 7);
    merged.dirty = 0;
    // OCR全文は端末にしか無いこともあるので、空で上書きしない
    if (!merged.rawText && local && local.rawText) merged.rawText = local.rawText;
    // hasImage    = サーバーに画像がある（サーバーが正）
    // localImage  = この端末に画像の実体がある
    // imageSynced = この端末の画像を送信済み
    merged.hasImage = !!incoming.hasImage;
    merged.localImage = local && local.localImage ? 1 : 0;
    merged.imageSynced = (incoming.hasImage || (local && local.imageSynced)) ? 1 : 0;
    return merged;
  }

  /** 送信待ちの件数 */
  async function pendingCount() {
    const all = await App.db.allRecordsRaw();
    return all.filter(r => r.dirty).length;
  }

  /**
   * 1回の同期サイクル。多重実行はしない。
   * @param {{silent?:boolean}} opts
   */
  function run(opts) {
    if (running) return running;
    running = doRun(opts || {}).finally(() => { running = null; });
    return running;
  }

  async function doRun(opts) {
    const cfg = App.api.current();
    if (!cfg.enabled) {
      emit({ phase: 'off', message: 'サーバー同期はオフです', error: '' });
      return { pushed: 0, pulled: 0, pending: 0 };
    }

    emit({ phase: 'syncing', message: '同期しています…', error: '' });
    try {
      const all = await App.db.allRecordsRaw();
      const dirty = all.filter(r => r.dirty);
      let since = Number(await App.db.getSetting(SINCE_KEY, 0)) || 0;

      // 送信は一度に500件まで。残りは次のサイクルで送る
      const batch = dirty.slice(0, 500).map(toWire);
      const sentAt = new Map(batch.map(r => [r.id, r.updatedAt]));

      let pulled = 0;
      let res = await App.api.syncRecords(since, batch, 500);

      // 受信は hasMore が無くなるまで繰り返す
      for (;;) {
        const byId = new Map((await App.db.allRecordsRaw()).map(r => [r.id, r]));
        const toSave = [];
        for (const incoming of res.records) {
          const merged = mergeOne(byId.get(incoming.id), incoming);
          if (merged) toSave.push(merged);
        }
        if (toSave.length) await App.db.putRecordsRaw(toSave);
        pulled += res.records.length;
        since = Number(res.since) || since;
        await App.db.setSetting(SINCE_KEY, since);
        if (!res.hasMore) break;
        res = await App.api.syncRecords(since, [], 500);
      }

      // 送信できた明細の dirty を下ろす（送信後にさらに編集された分は残す）
      if (batch.length) {
        const now = await App.db.allRecordsRaw();
        const clear = [];
        for (const rec of now) {
          if (!rec.dirty) continue;
          const sent = sentAt.get(rec.id);
          if (sent !== undefined && Number(rec.updatedAt) <= sent) {
            clear.push(Object.assign({}, rec, { dirty: 0 }));
          }
        }
        if (clear.length) await App.db.putRecordsRaw(clear);
      }

      const uploaded = cfg.shareImages ? await uploadPendingImages() : 0;
      const pending = await pendingCount();

      emit({
        phase: pending ? 'pending' : 'ok',
        message: pending ? `未送信 ${pending}件` : '同期済み',
        pending, lastSyncAt: Date.now(), error: '',
      });
      return { pushed: batch.length, pulled, uploaded, pending };
    } catch (err) {
      const offline = !navigator.onLine || /接続できません|応答がありません/.test(err.message);
      const pending = await pendingCount().catch(() => 0);
      emit({
        phase: offline ? 'offline' : 'error',
        message: offline ? `オフライン（未送信 ${pending}件）` : err.message,
        pending, error: err.message,
      });
      if (!opts.silent) throw err;
      return { pushed: 0, pulled: 0, pending, error: err.message };
    }
  }

  /** まだサーバーに送っていないレシート画像をアップロードする */
  async function uploadPendingImages() {
    const all = await App.db.allRecordsRaw();
    const targets = all.filter(r => !r.deleted && r.localImage && !r.imageSynced).slice(0, 20);
    let done = 0;
    for (const rec of targets) {
      const image = await App.db.getImage(rec.id);
      if (!image || (!image.thumb && !image.full)) {
        // 画像の実体が無いなら、これ以上試さない
        await App.db.putRecordsRaw([Object.assign({}, rec, { imageSynced: 1 })]);
        continue;
      }
      try {
        emit({ phase: 'syncing', message: `レシート画像を送信中… (${done + 1}/${targets.length})` });
        await App.api.uploadImage(rec.id, image.thumb || null, image.full || null);
        await App.db.putRecordsRaw([Object.assign({}, rec, { imageSynced: 1, hasImage: true })]);
        done++;
      } catch (err) {
        console.warn('[sync] 画像の送信に失敗:', err.message);
        break;   // 次のサイクルで再試行する
      }
    }
    return done;
  }

  /** 手元の全明細を「未送信」に戻す（同期先を切り替えたときなどに使う） */
  async function markAllDirty() {
    const all = await App.db.allRecordsRaw();
    await App.db.putRecordsRaw(all.map(r => Object.assign({}, r, { dirty: 1, imageSynced: 0 })));
    await App.db.setSetting(SINCE_KEY, 0);
  }

  App.sync = { run, status, onChange, pendingCount, markAllDirty, mergeOne, toWire, SINCE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = App.sync;
})(typeof window !== 'undefined' ? window : globalThis);
