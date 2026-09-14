/* 画面制御 */
(function (global) {
  'use strict';
  const App = global.App;
  const U = App.util;
  const $ = U.$, $$ = U.$$;
  const TYPES = App.parse.TYPES;

  const DEFAULTS = {
    engine: 'local',
    aiMode: 'proxy',
    aiKey: '',
    aiModel: 'claude-sonnet-5',
    optSplit: true,
    optDeskew: true,
    optDigit: true,
    optRotate: true,
    // サーバー共有
    syncEnabled: false,
    apiBase: 'api/',
    accessToken: '',
    staff: '',
    shareImages: true,
  };

  const state = {
    settings: Object.assign({}, DEFAULTS),
    records: [],          // 削除済みを除く全明細
    lastBatchIds: [],     // 直近の読み取りで追加したid
    thumbs: new Map(),    // id -> dataURL
    busy: false,
  };

  /* ================= 初期化 ================= */

  async function init() {
    if (global.pdfjsLib) {
      // これを設定しないと pdf.js が擬似ワーカーで動作し、PDFの処理が極端に遅くなる／失敗する
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = (global.APP_CDN && global.APP_CDN.pdfWorker) ||
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const saved = await App.db.getSetting('app', null);
    state.settings = Object.assign({}, DEFAULTS, saved || {});

    // 種別セレクトの選択肢
    const fType = $('#fType');
    for (const t of TYPES) {
      const o = document.createElement('option');
      o.value = o.textContent = t;
      fType.appendChild(o);
    }

    $('#scanDate').value = U.today();
    $('#fMonth').value = U.thisMonth();
    $('#fDate').value = U.today();
    $('#repMonth').value = U.thisMonth();

    applyApiConfig();
    applySettingsToUi();
    bindTabs();
    bindScan();
    bindTable($('#scanRows'));
    bindTable($('#listRows'));
    bindList();
    bindReport();
    bindSettings();
    bindModal();

    App.sync.onChange(renderSyncBadge);
    renderSyncBadge(App.sync.status());

    await reload();
    showStorage();
    registerServiceWorker();
    startAutoSync();
  }

  function applyApiConfig() {
    const s = state.settings;
    App.api.configure({
      enabled: !!s.syncEnabled,
      baseUrl: s.apiBase || 'api/',
      token: s.accessToken || '',
      shareImages: !!s.shareImages,
    });
  }

  async function reload() {
    state.records = await App.db.allRecords();
    refreshStaffOptions();
    renderAll();
  }

  /** 登録済みの担当者名を各セレクトへ反映する */
  function refreshStaffOptions() {
    const names = [...new Set(state.records.map(r => r.staff).filter(Boolean))].sort();
    if (state.settings.staff && !names.includes(state.settings.staff)) names.unshift(state.settings.staff);
    $('#staffList').innerHTML = names.map(n => `<option value="${U.esc(n)}">`).join('');
    for (const sel of ['#fStaff', '#repStaff']) {
      const el = $(sel);
      const keep = el.value;
      el.innerHTML = '<option value="">すべて</option>' +
        names.map(n => `<option value="${U.esc(n)}">${U.esc(n)}</option>`).join('');
      el.value = names.includes(keep) ? keep : '';
    }
  }

  function renderAll() {
    renderScan();
    renderList();
    renderReport();
  }

  /* ================= タブ ================= */

  function bindTabs() {
    $$('nav.tabs button').forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
  }

  function showTab(name) {
    $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.tabpanel').forEach(p => { p.hidden = (p.id !== 'tab-' + name); });
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ================= 設定 ================= */

  function applySettingsToUi() {
    const s = state.settings;
    $('#engineQuick').value = s.engine;
    $('#setEngine').value = s.engine;
    $('#setAiMode').value = s.aiMode;
    $('#setAiKey').value = s.aiKey;
    $('#setAiModel').value = s.aiModel;
    $('#setSyncEnabled').checked = !!s.syncEnabled;
    $('#setApiBase').value = s.apiBase;
    $('#setAccessToken').value = s.accessToken;
    $('#setStaff').value = s.staff;
    $('#scanStaff').value = s.staff;
    $('#setShareImages').checked = !!s.shareImages;
    $('#serverSettings').hidden = !s.syncEnabled;
    $('#syncBadge').hidden = !s.syncEnabled;
    $('#optSplit').checked = !!s.optSplit;
    $('#optDeskew').checked = !!s.optDeskew;
    $('#optDigit').checked = !!s.optDigit;
    $('#optRotate').checked = !!s.optRotate;
    $('#aiSettings').hidden = s.engine !== 'ai';
    const direct = s.aiMode === 'direct';
    $('#wrapAiKey').hidden = !direct;
    $('#aiKeyWarn').hidden = !direct;
  }

  async function saveSettings(patch) {
    Object.assign(state.settings, patch || {});
    await App.db.setSetting('app', state.settings);
    applySettingsToUi();
  }

  function bindSettings() {
    $('#engineQuick').addEventListener('change', e => saveSettings({ engine: e.target.value }));
    $('#setEngine').addEventListener('change', e => saveSettings({ engine: e.target.value }));
    $('#setAiMode').addEventListener('change', e => saveSettings({ aiMode: e.target.value }));
    $('#setAiKey').addEventListener('change', e => saveSettings({ aiKey: e.target.value.trim() }));
    $('#setAiModel').addEventListener('change', e => saveSettings({ aiModel: e.target.value.trim() || DEFAULTS.aiModel }));
    ['optSplit', 'optDeskew', 'optDigit', 'optRotate'].forEach(k => {
      $('#' + k).addEventListener('change', e => saveSettings({ [k]: e.target.checked }));
    });

    // --- サーバー共有 ---
    $('#setSyncEnabled').addEventListener('change', async (e) => {
      await saveSettings({ syncEnabled: e.target.checked });
      applyApiConfig();
      if (e.target.checked) doSync();
      else renderSyncBadge({ phase: 'off', message: 'サーバー同期はオフです', pending: 0 });
    });
    $('#setApiBase').addEventListener('change', async (e) => {
      await saveSettings({ apiBase: e.target.value.trim() || 'api/' });
      applyApiConfig();
    });
    $('#setAccessToken').addEventListener('change', async (e) => {
      await saveSettings({ accessToken: e.target.value.trim() });
      applyApiConfig();
    });
    $('#setShareImages').addEventListener('change', async (e) => {
      await saveSettings({ shareImages: e.target.checked });
      applyApiConfig();
    });
    const onStaffChange = async (e) => {
      await saveSettings({ staff: e.target.value.trim() });
      refreshStaffOptions();
    };
    $('#setStaff').addEventListener('change', onStaffChange);
    $('#scanStaff').addEventListener('change', onStaffChange);

    $('#setAiTest').addEventListener('click', testAi);
    $('#btnSync').addEventListener('click', () => doSync(false));
    $('#btnPing').addEventListener('click', pingServer);
    $('#btnResync').addEventListener('click', resyncAll);
    $('#syncBadge').addEventListener('click', () => doSync(false));
    $('#btnBackup').addEventListener('click', () => App.exporter.downloadJson(state.records));
    $('#restoreFile').addEventListener('change', restoreBackup);
    $('#btnClear').addEventListener('click', clearAll);
    $('#clearAll').addEventListener('click', clearAll);
    $('#btnUpdate').addEventListener('click', forceUpdate);

    $('#appInfo').textContent =
      `保存先: ブラウザ内データベース（IndexedDB）／読み取り: ${App.ocr.tesseractAvailable() ? 'Tesseract.js 利用可' : 'Tesseract.js 未読み込み'}`;
  }

  async function testAi() {
    const el = $('#aiTestStatus');
    el.textContent = '接続を確認しています…';
    try {
      // 1x1 の白画像で疎通だけ確認する
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 8, 8);
      await App.ocr.recognizeAi(c.toDataURL('image/jpeg', 0.8), aiConfig());
      el.textContent = '✓ 接続できました';
    } catch (err) {
      el.textContent = '✗ ' + err.message;
    }
  }

  function aiConfig() {
    const s = state.settings;
    return { mode: s.aiMode, apiKey: s.aiKey, model: s.aiModel, proxyUrl: 'api/ai-proxy.php' };
  }

  /* ================= 読み取り ================= */

  function bindScan() {
    const drop = $('#drop');
    const input = $('#files');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', e => {
      handleFiles(e.target.files);
      e.target.value = '';   // 同じファイルを続けて選べるようにする
    });

    $('#scanDate').addEventListener('change', renderScan);
    $('#scanXlsx').addEventListener('click', () => exportWith('xlsx', { mode: 'day', date: $('#scanDate').value }));
    $('#scanCsv').addEventListener('click', () => exportWith('csv', { mode: 'day', date: $('#scanDate').value }));
  }

  function setProgress(ratio, message) {
    $('#progress').classList.add('on');
    $('#bar').style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';
    if (message != null) $('#status').textContent = message;
  }

  function setNotice(message, isError, action) {
    const el = $('#notice');
    el.textContent = message;
    if (action) {
      const btn = document.createElement('button');
      btn.className = 'btn secondary small';
      btn.style.marginLeft = '10px';
      btn.textContent = action.label;
      btn.addEventListener('click', action.onClick);
      el.appendChild(btn);
    }
    el.classList.toggle('err', !!isError);
    el.classList.toggle('on', !!message);
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f && f.size > 0);
    if (!files.length) return;
    if (state.busy) { alert('前の読み取りが終わるまでお待ちください。'); return; }

    state.busy = true;
    state.lastBatchIds = [];
    setNotice('');
    setProgress(0, '準備しています…');

    const added = [];
    const failures = [];
    const useAi = state.settings.engine === 'ai';

    try {
      await scanAll(files, added, failures, useAi);
    } finally {
      // 途中で何が起きても操作不能にならないようにする
      state.busy = false;
    }

    state.lastBatchIds = added.map(r => r.id);
    setProgress(1, '完了しました');
    await reload();

    // 追加された明細のうち最も多い日付を、対象日として選ぶ
    const day = mostCommonDate(added);
    if (day) $('#scanDate').value = day;
    renderScan();
    showStorage();

    const byDate = new Map();
    for (const r of added) {
      const key = r.date || '(日付なし)';
      byDate.set(key, (byDate.get(key) || 0) + 1);
    }
    const breakdown = [...byDate.entries()].map(([d, c]) => `${d} ${c}件`).join(' / ');
    const needs = added.filter(App.exporter.needsCheck).length;

    let message = `✓ ${files.length}件のファイルから ${added.length}件の明細を追加しました（${breakdown}）。`;
    if (byDate.size > 1) {
      message += '日付が複数に分かれています。読み取れなかった分は写真の撮影日を仮に入れているので、必ずご確認ください。';
    }
    if (needs) message += ` ${needs}件が要確認です（黄色の項目）。`;
    if (failures.length) message += ` 読み取れなかったファイル: ${failures.length}件。`;

    setNotice(message, failures.length > 0 && added.length === failures.length,
      needs ? {
        label: '要確認の明細だけ表示',
        onClick: () => {
          $('#fMode').value = 'all';
          $('#fCheck').checked = true;
          $('#fMode').dispatchEvent(new Event('change'));
          showTab('list');
        },
      } : null);
    setTimeout(() => $('#progress').classList.remove('on'), 1500);
    scheduleSync();
  }

  /** ファイルを1件ずつ読み取って added / failures に積む */
  async function scanAll(files, added, failures, useAi) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base = i / files.length;
      const stepShare = 1 / files.length;
      const fallbackDate = U.toDateStr(new Date(file.lastModified || Date.now()));

      try {
        setProgress(base, `${i + 1}/${files.length} ${file.name} を読み込み中…`);
        const pages = await App.image.pagesFromFile(file);

        for (let p = 0; p < pages.length; p++) {
          const page = pages[p];
          const allowSplit = state.settings.optSplit && !page.isPdf;
          const crops = App.image.cropReceipts(page.image, allowSplit);

          for (let c = 0; c < crops.length; c++) {
            const share = stepShare / (pages.length * crops.length);
            const done = base + share * (p * crops.length + c);
            setProgress(done, `${i + 1}/${files.length} ${file.name}` +
              (crops.length > 1 ? `（${c + 1}/${crops.length}枚目）` : '') + ' を画像補正中…');
            await U.nextFrame();

            const pre = await App.image.preprocess(crops[c], { deskew: state.settings.optDeskew });
            setProgress(done + share * 0.4, `${i + 1}/${files.length} ${file.name}` +
              (crops.length > 1 ? `（${c + 1}/${crops.length}枚目）` : '') + ' を文字認識中…');

            const recs = useAi
              ? await scanWithAi(pre, file, fallbackDate)
              : [await scanWithLocal(pre, file, fallbackDate, msg => setProgress(done + share * 0.5, msg))];

            for (const rec of recs) {
              rec.localImage = 1;
              rec.imageSynced = 0;
              await App.db.putRecord(rec);
              await App.db.putImage(rec.id, pre.thumb, pre.full);
              state.thumbs.set(rec.id, pre.thumb);
              added.push(rec);
            }
          }
        }
      } catch (err) {
        console.error(err);
        failures.push(`${file.name}: ${err.message}`);
        // 読めなくても行だけ作り、手入力できるようにする
        const rec = blankRecord({
          date: fallbackDate,
          note: `${file.name}（自動読み取り失敗・手入力してください）`,
          source: '失敗',
        });
        await App.db.putRecord(rec);
        added.push(rec);
      }
    }

  }

  /** 端末内OCRで1枚を読み取る */
  async function scanWithLocal(pre, file, fallbackDate, onStatus) {
    const res = await App.ocr.recognizeLocal(pre.ocr, {
      retryRotate: state.settings.optRotate,
      digitPass: state.settings.optDigit,
      onStatus,
    });
    const parsed = App.parse.receipt(res.text, { fallbackDate, fileName: file.name });

    // 金額用パス（丸囲み数字を禁止）の結果と突き合わせる
    const numericParsed = res.numericText
      ? App.parse.receipt(res.numericText, { fallbackDate, fileName: file.name })
      : null;
    const reconciled = App.parse.reconcileAmount(parsed, numericParsed);
    const amount = reconciled.amount;
    const amountConf = reconciled.confidence;
    // OCR全体の信頼度が低ければ、各項目の信頼度も引き下げる
    const scale = res.confidence >= 70 ? 1 : res.confidence >= 50 ? 0.85 : 0.65;
    const confidence = {};
    for (const k of Object.keys(parsed.confidence)) confidence[k] = round2(parsed.confidence[k] * scale);
    confidence.amount = round2(amountConf * scale);

    return blankRecord({
      date: parsed.date || fallbackDate,
      time: parsed.time,
      type: parsed.type,
      name: parsed.name,
      amount: amount === '' ? '' : Number(amount),
      note: file.name,
      source: `OCR(${Math.round(res.confidence)}%)`,
      confidence,
      rawText: res.numericText
        ? `${parsed.text}\n\n──── 金額確認パス（丸囲み数字を禁止して再読み取り） ────\n${App.parse.normalize(res.numericText)}`
        : parsed.text,
    });
  }

  /** AI解析で1枚を読み取る（1枚から複数明細が返ることもある） */
  async function scanWithAi(pre, file, fallbackDate) {
    const { items, raw } = await App.ocr.recognizeAi(pre.ai, aiConfig());
    if (!items.length) throw new Error('AIが明細を返しませんでした');
    return items.map(it => {
      const conf = it.confidence;
      return blankRecord({
        date: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : fallbackDate,
        time: /^\d{2}:\d{2}$/.test(it.time) ? it.time : '',
        type: it.type,
        name: it.name,
        amount: it.amount === '' ? '' : Number(it.amount),
        note: [file.name, it.note].filter(Boolean).join(' / '),
        source: 'AI',
        confidence: { date: conf, time: conf, type: conf, name: conf, amount: conf },
        rawText: raw,
      });
    });
  }

  function blankRecord(fields) {
    return Object.assign({
      id: U.uid(),
      staff: state.settings.staff || '',
      date: '',
      time: '',
      type: 'その他',
      name: '',
      amount: '',
      note: '',
      source: '手入力',
      confidence: {},
      rawText: '',
      hasImage: false,     // サーバーに画像があるか
      localImage: 0,       // この端末に画像の実体があるか
      imageSynced: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deleted: 0,
      dirty: 1,
    }, fields || {});
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function mostCommonDate(records) {
    const counts = new Map();
    for (const r of records) {
      if (!r.date) continue;
      counts.set(r.date, (counts.get(r.date) || 0) + 1);
    }
    let best = '', n = 0;
    for (const [d, c] of counts) if (c > n) { best = d; n = c; }
    return best;
  }

  /* ================= テーブル ================= */

  function rowHtml(r) {
    const c = r.confidence || {};
    const low = k => (typeof c[k] === 'number' && c[k] > 0 && c[k] < 0.6) ? ' lowconf' : '';
    const options = TYPES.map(t => `<option${t === r.type ? ' selected' : ''}>${t}</option>`).join('');
    return `<tr data-id="${U.esc(r.id)}"${App.exporter.needsCheck(r) ? ' class="needs-check"' : ''}>
<td class="col-thumb"><img class="thumb" data-thumb="${U.esc(r.id)}" alt="" loading="lazy"></td>
<td class="col-date"><input type="date" data-k="date" class="${low('date')}" value="${U.esc(r.date)}"></td>
<td class="col-time"><input type="time" data-k="time" class="${low('time')}" value="${U.esc(r.time)}"></td>
<td class="col-type"><select data-k="type" class="${low('type')}">${options}</select></td>
<td><input data-k="name" class="${low('name')}" value="${U.esc(r.name)}" placeholder="駐車場名・経路"></td>
<td class="num col-amount"><input type="number" min="0" step="1" inputmode="numeric" data-k="amount" class="${low('amount')}" value="${r.amount === '' || r.amount == null ? '' : Number(r.amount)}" placeholder="0"></td>
<td class="col-staff"><input data-k="staff" list="staffList" value="${U.esc(r.staff)}" placeholder="担当者"></td>
<td><input data-k="note" value="${U.esc(r.note)}" placeholder="メモ"></td>
<td class="col-act">
<button class="iconbtn" data-act="text" title="読み取り結果の全文">📄</button>
<button class="iconbtn del" data-act="del" title="この明細を削除">×</button>
</td></tr>`;
  }

  // 入力中に自動同期の再描画が走るとフォーカスが飛ぶため、
  // その表に入力中のセルがある間は描画を保留し、離れた時点で反映する。
  const deferredRenders = new Map();

  function renderRows(tbody, records, emptyMessage) {
    if (tbody.contains(document.activeElement)) {
      deferredRenders.set(tbody, [records, emptyMessage]);
      return;
    }
    deferredRenders.delete(tbody);
    const table = tbody.closest('table');
    if (!records.length) {
      if (table) table.classList.add('is-empty');
      tbody.innerHTML = `<tr><td colspan="9" class="empty">${U.esc(emptyMessage)}</td></tr>`;
      return;
    }
    if (table) table.classList.remove('is-empty');
    tbody.innerHTML = records.map(rowHtml).join('');
    loadThumbs(tbody);
  }

  async function loadThumbs(tbody) {
    for (const img of $$('img[data-thumb]', tbody)) {
      const id = img.dataset.thumb;
      if (state.thumbs.has(id)) { img.src = state.thumbs.get(id); continue; }
      try {
        const stored = await App.db.getImage(id);
        if (stored && stored.thumb) {
          state.thumbs.set(id, stored.thumb);
          img.src = stored.thumb;
          continue;
        }
        // 別の端末で撮影した明細は、サーバー上の画像を参照する
        const rec = state.records.find(r => r.id === id);
        if (state.settings.syncEnabled && rec && rec.hasImage) {
          img.src = App.api.imageUrl(id, 'thumb');
          img.onerror = () => img.remove();
        } else {
          img.remove();
        }
      } catch (e) { /* noop */ }
    }
  }

  function bindTable(tbody) {
    // 入力のたびに再描画するとフォーカスが飛ぶため、値の保存とサマリー更新だけ行う
    tbody.addEventListener('input', onCellChange);
    tbody.addEventListener('change', onCellChange);
    tbody.addEventListener('click', onRowClick);
    tbody.addEventListener('focusout', () => {
      // 表から離れたタイミングで、保留していた描画を反映する
      setTimeout(() => {
        if (tbody.contains(document.activeElement)) return;
        const pending = deferredRenders.get(tbody);
        if (pending) renderRows(tbody, pending[0], pending[1]);
      }, 0);
    });
  }

  // 編集内容は「変更した項目だけ」をためて、少し間を置いてからまとめて保存する。
  // 行ごとに保持しないと、続けて別の行を触ったときに先の編集が保存されない。
  const pendingEdits = new Map();   // id -> { 項目名: 値 }
  let saveTimer = null;

  async function onCellChange(e) {
    const key = e.target.dataset && e.target.dataset.k;
    if (!key) return;
    const tr = e.target.closest('tr');
    const rec = state.records.find(r => r.id === tr.dataset.id);
    if (!rec) return;

    const value = key === 'amount'
      ? (e.target.value === '' ? '' : Number(e.target.value))
      : e.target.value;

    // 値が変わっていないなら何もしない。
    // input と change の両方を拾っているため、フォーカスが外れたときに change が続けて発火する。
    // ここで弾かないと、中身が同じまま updatedAt だけが新しくなり、
    // 「あとで編集したほうを採用する」競合解決で、古い内容が勝ってしまう。
    const before = rec[key] == null ? '' : String(rec[key]);
    if (before === (value == null ? '' : String(value))) return;

    rec[key] = value;                       // 画面表示用にその場で反映
    if (rec.confidence) rec.confidence[key] = 1;   // 手で直した項目は確定扱い
    e.target.classList.remove('lowconf');
    tr.classList.toggle('needs-check', App.exporter.needsCheck(rec));

    const patch = pendingEdits.get(rec.id) || {};
    patch[key] = value;
    pendingEdits.set(rec.id, patch);

    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushEdits, 350);
    renderSummaries();
  }

  /** ためた編集を、保存直前の最新レコードに当ててから書き込む */
  async function flushEdits() {
    if (!pendingEdits.size) return;
    const edits = [...pendingEdits.entries()];
    pendingEdits.clear();

    for (const [id, patch] of edits) {
      const latest = await App.db.getRecord(id);
      if (!latest || latest.deleted) continue;
      Object.assign(latest, patch);
      latest.confidence = Object.assign({}, latest.confidence || {});
      for (const key of Object.keys(patch)) latest.confidence[key] = 1;
      await App.db.putRecord(latest);
    }
    await reload();
    scheduleSync();
  }

  async function onRowClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) {
      const img = e.target.closest('img[data-thumb]');
      if (img) return showImage(img.dataset.thumb);
      return;
    }
    const id = btn.closest('tr').dataset.id;
    if (btn.dataset.act === 'del') {
      if (!confirm('この明細を削除しますか？')) return;
      await App.db.deleteRecord(id);
      state.thumbs.delete(id);
      await reload();
      scheduleSync();
    } else if (btn.dataset.act === 'text') {
      const rec = await App.db.getRecord(id);
      showText(rec && rec.rawText ? rec.rawText : '（読み取り結果の全文は保存されていません）');
    }
  }

  /* ================= 各タブの描画 ================= */

  function summaryHtml(totals, extra) {
    const cells = [
      ['件数', String(totals.count) + ' 件'],
      ['合計', U.yen(totals.total), 'total'],
      ['駐車場', U.yen(totals['駐車場'])],
      ['高速', U.yen(totals['高速'])],
      ['ガソリン', U.yen(totals['ガソリン'])],
      ['その他', U.yen(totals['タクシー'] + totals['電車・バス'] + totals['その他'])],
    ].concat(extra || []);
    return cells.map(([k, v, cls]) =>
      `<div${cls ? ` class="${cls}"` : ''}><small>${U.esc(k)}</small><b>${U.esc(v)}</b></div>`).join('');
  }

  function renderSummaries() {
    const scan = currentScanRecords();
    $('#scanSummary').innerHTML = summaryHtml(App.exporter.grandTotal(scan));
    const list = currentListRecords();
    $('#listSummary').innerHTML = summaryHtml(App.exporter.grandTotal(list));
  }

  function currentScanRecords() {
    const date = $('#scanDate').value;
    if (!date) return state.records.filter(r => state.lastBatchIds.includes(r.id));
    return state.records.filter(r => r.date === date);
  }

  function renderScan() {
    const date = $('#scanDate').value;
    $('#scanWeekday').textContent = date ? `（${date} ${U.weekday(date)}曜日）` : '';
    const recs = currentScanRecords();
    renderRows($('#scanRows'), recs,
      date ? 'この日の明細はまだありません。上から領収書をアップロードしてください。' : '明細がありません');
    renderSummaries();
  }

  function currentFilter() {
    const mode = $('#fMode').value;
    return {
      mode,
      date: $('#fDate').value,
      month: $('#fMonth').value,
      from: $('#fFrom').value,
      to: $('#fTo').value,
      types: $('#fType').value ? [$('#fType').value] : null,
      staff: $('#fStaff').value || '',
    };
  }

  function currentListRecords() {
    let recs = App.exporter.filterRecords(state.records, currentFilter());
    if ($('#fCheck').checked) recs = recs.filter(App.exporter.needsCheck);
    return recs;
  }

  function bindList() {
    const update = () => {
      const mode = $('#fMode').value;
      $('#wrapMonth').hidden = mode !== 'month';
      $('#wrapDate').hidden = mode !== 'day';
      $('#wrapFrom').hidden = mode !== 'range';
      $('#wrapTo').hidden = mode !== 'range';
      renderList();
    };
    ['#fMode', '#fMonth', '#fDate', '#fFrom', '#fTo', '#fType', '#fStaff', '#fCheck']
      .forEach(sel => $(sel).addEventListener('change', update));
    $('#listXlsx').addEventListener('click', () => exportWith('xlsx', currentFilter()));
    $('#listCsv').addEventListener('click', () => exportWith('csv', currentFilter()));
  }

  function renderList() {
    renderRows($('#listRows'), currentListRecords(), '条件に合う明細がありません');
    renderSummaries();
  }

  function reportFilter(mode) {
    return { mode, month: $('#repMonth').value, staff: $('#repStaff').value || '' };
  }

  function bindReport() {
    $('#repMonth').addEventListener('change', renderReport);
    $('#repStaff').addEventListener('change', renderReport);
    $('#repXlsx').addEventListener('click', () => exportWith('xlsx', reportFilter('month')));
    $('#repCsv').addEventListener('click', () => exportWith('csv', reportFilter('month')));
    $('#repAllXlsx').addEventListener('click', () => exportWith('xlsx', reportFilter('all')));

    $('#repDaily').addEventListener('click', e => {
      const btn = e.target.closest('button[data-day]');
      if (!btn) return;
      $('#fMode').value = 'day';
      $('#fDate').value = btn.dataset.day;
      $('#fMode').dispatchEvent(new Event('change'));
      showTab('list');
    });
    $('#repMonthly').addEventListener('click', e => {
      const btn = e.target.closest('button[data-month]');
      if (!btn) return;
      $('#repMonth').value = btn.dataset.month;
      renderReport();
    });
  }

  function numTd(v) { return `<td class="num">${v ? U.num(v) : '-'}</td>`; }

  function renderReport() {
    const monthRecords = App.exporter.filterRecords(state.records, reportFilter('month'));
    const totals = App.exporter.grandTotal(monthRecords);
    const days = new Set(monthRecords.map(r => r.date).filter(Boolean)).size;
    $('#repSummary').innerHTML = summaryHtml(totals, [['稼働日数', days + ' 日']]);

    const daily = App.exporter.dailySummary(monthRecords);
    $('#repDaily').innerHTML = daily.length
      ? daily.map(d => `<tr>
<td>${U.esc(d.date)}</td><td>${U.esc(U.weekday(d.date))}</td>
${TYPES.map(t => numTd(d[t])).join('')}
<td class="num"><b>${U.num(d.total)}</b></td><td class="num">${d.count}</td>
<td><button class="daylink" data-day="${U.esc(d.date)}">明細</button></td></tr>`).join('')
      : '<tr><td colspan="11" class="empty">この月の明細はありません</td></tr>';

    $('#repDailyFoot').innerHTML = daily.length
      ? `<tr><td colspan="2">合計</td>${TYPES.map(t => numTd(totals[t])).join('')}
<td class="num">${U.num(totals.total)}</td><td class="num">${totals.count}</td><td></td></tr>`
      : '';

    const staff = $('#repStaff').value || '';
    const monthly = App.exporter.monthlySummary(
      staff ? state.records.filter(r => r.staff === staff) : state.records);
    $('#repMonthly').innerHTML = monthly.length
      ? monthly.map(m => `<tr>
<td>${U.esc(m.month)}</td>
${TYPES.map(t => numTd(m[t])).join('')}
<td class="num"><b>${U.num(m.total)}</b></td><td class="num">${m.count}</td>
<td><button class="daylink" data-month="${U.esc(m.month)}">表示</button></td></tr>`).join('')
      : '<tr><td colspan="10" class="empty">明細がありません</td></tr>';
  }

  /* ================= 出力 ================= */

  function exportWith(format, filter) {
    const recs = App.exporter.filterRecords(state.records, filter);
    if (!recs.length) {
      alert('対象の明細がありません。日付や月の指定をご確認ください。');
      return;
    }
    try {
      if (format === 'csv') App.exporter.downloadCsv(recs, filter);
      else App.exporter.downloadXlsx(recs, filter);
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  /* ================= 同期・バックアップ ================= */

  /* ================= サーバー同期 ================= */

  const SYNC_LABEL = {
    off:     { text: 'ローカル保存のみ', cls: 'off' },
    syncing: { text: '同期中…', cls: 'syncing' },
    ok:      { text: '同期済み', cls: 'ok' },
    pending: { text: '未送信あり', cls: 'pending' },
    offline: { text: 'オフライン', cls: 'offline' },
    error:   { text: '同期エラー', cls: 'error' },
  };

  function renderSyncBadge(st) {
    const badge = $('#syncBadge');
    const label = SYNC_LABEL[st.phase] || SYNC_LABEL.off;
    badge.className = 'syncbadge ' + label.cls;
    badge.hidden = !state.settings.syncEnabled;
    $('#syncText').textContent = st.message || label.text;
    badge.title = st.error
      ? st.error
      : (st.lastSyncAt ? `最終同期: ${U.toTimeStr(new Date(st.lastSyncAt))}／クリックで今すぐ同期`
                       : 'クリックすると今すぐ同期します');
    const el = $('#syncStatus');
    if (el) el.textContent = st.error ? '✗ ' + st.error : (st.message || '');
  }

  /** @param {boolean} silent 自動同期（失敗してもダイアログを出さない） */
  async function doSync(silent) {
    if (!state.settings.syncEnabled) return;
    try {
      const res = await App.sync.run({ silent: true });
      await reload();
      if (!silent && !res.error) {
        $('#syncStatus').textContent =
          `✓ 送信 ${res.pushed}件 / 受信 ${res.pulled}件` +
          (res.uploaded ? ` / 画像 ${res.uploaded}件` : '') +
          (res.pending ? ` / 未送信 ${res.pending}件` : '');
      }
      if (!silent && res.error) alert('同期できませんでした:\n' + res.error);
    } catch (err) {
      if (!silent) alert('同期できませんでした:\n' + err.message);
    }
  }

  async function pingServer() {
    const el = $('#syncStatus');
    el.textContent = 'サーバーに接続しています…';
    try {
      const info = await App.api.ping();
      el.textContent = `✓ 接続できました（サーバー上の明細 ${info.total}件）`;
    } catch (err) {
      el.textContent = '✗ ' + err.message;
    }
  }

  async function resyncAll() {
    if (!confirm('この端末の明細をすべてサーバーへ送り直します。\n' +
                 '（サーバー側に新しい内容がある明細は上書きされません）\nよろしいですか？')) return;
    await App.sync.markAllDirty();
    await doSync(false);
  }

  /** 自動同期: 起動時・一定間隔・オンライン復帰時・画面に戻ったとき */
  function startAutoSync() {
    if (state.settings.syncEnabled) doSync(true);
    setInterval(() => {
      if (state.settings.syncEnabled && !state.busy && document.visibilityState === 'visible') doSync(true);
    }, 60000);
    global.addEventListener('online', () => doSync(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') doSync(true);
    });
  }

  let syncTimer = null;
  /** 編集直後にまとめて送る（打鍵のたびに通信しない） */
  function scheduleSync() {
    if (!state.settings.syncEnabled) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => doSync(true), 3000);
  }

  async function restoreBackup(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const incoming = Array.isArray(json.records) ? json.records : Array.isArray(json) ? json : null;
      if (!incoming) throw new Error('バックアップの形式が違います');
      if (!confirm(`${incoming.length}件を取り込みます。同じ明細は新しい方が残ります。よろしいですか？`)) return;
      const localRaw = await App.db.allRecordsRaw();
      const byId = new Map(localRaw.map(r => [r.id, r]));
      const merged = incoming
        .filter(r => r && r.id)
        .map(r => {
          const local = byId.get(r.id);
          if (local && Number(local.updatedAt || 0) >= Number(r.updatedAt || 0)) return null;
          return Object.assign({}, local || {}, r, { dirty: 1 });
        })
        .filter(Boolean);
      if (merged.length) await App.db.putRecordsRaw(merged);
      await reload();
      scheduleSync();
      alert(`${merged.length}件を復元しました`);
    } catch (err) {
      alert('復元できませんでした: ' + err.message);
    }
  }

  async function clearAll() {
    if (!confirm('保存されている明細と画像をすべて削除します。元に戻せません。よろしいですか？')) return;
    if (!confirm('本当に削除しますか？先にバックアップの保存をおすすめします。')) return;
    await App.db.clearAll();
    await App.db.setSetting(App.sync.SINCE_KEY, 0);
    state.thumbs.clear();
    state.lastBatchIds = [];
    await reload();
    showStorage();
  }

  async function showStorage() {
    const est = await App.db.usage();
    const count = state.records.length;
    $('#storageInfo').textContent = est && est.usage
      ? `保存中の明細: ${count}件／使用容量: 約${(est.usage / 1048576).toFixed(1)}MB（上限の目安 ${(est.quota / 1048576).toFixed(0)}MB）`
      : `保存中の明細: ${count}件`;
  }

  /* ================= モーダル ================= */

  function bindModal() {
    $('#modalClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }
  function closeModal() { $('#modal').classList.remove('on'); $('#modalBody').innerHTML = ''; }

  async function showImage(id) {
    const stored = await App.db.getImage(id);
    let src = stored && (stored.full || stored.thumb);
    if (!src && state.settings.syncEnabled) src = App.api.imageUrl(id, 'full');
    if (!src) return;
    $('#modalBody').innerHTML = `<img src="${U.esc(src)}" alt="レシート画像">`;
    $('#modal').classList.add('on');
  }
  function showText(text) {
    $('#modalBody').innerHTML = `<pre>${U.esc(text)}</pre>`;
    $('#modal').classList.add('on');
  }

  /* ================= Service Worker ================= */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW登録に失敗:', err));
  }

  async function forceUpdate() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (global.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) { /* noop */ }
    location.reload();
  }

  /* ================= 起動 ================= */

  window.addEventListener('beforeunload', () => { App.ocr.terminate(); });

  init().catch(err => {
    console.error(err);
    alert('アプリを起動できませんでした: ' + err.message);
  });
})(window);
