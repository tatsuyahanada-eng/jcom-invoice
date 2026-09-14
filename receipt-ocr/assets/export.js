/* 出力（CSV / Excel / JSONバックアップ）と集計 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};
  const U = () => App.util;
  const TYPES = ['駐車場', '高速', 'ガソリン', 'タクシー', '電車・バス', 'その他'];

  /* ---------- 絞り込み ---------- */

  /**
   * @param {Array} records
   * @param {{mode:'day'|'month'|'range'|'all', date?:string, month?:string, from?:string, to?:string, types?:string[]}} f
   */
  function filterRecords(records, f) {
    const filt = f || { mode: 'all' };
    return records.filter(r => {
      const d = r.date || '';
      if (filt.types && filt.types.length && !filt.types.includes(r.type)) return false;
      switch (filt.mode) {
        case 'day': return d === filt.date;
        case 'month': return d.slice(0, 7) === filt.month;
        case 'range': return (!filt.from || d >= filt.from) && (!filt.to || d <= filt.to);
        default: return true;
      }
    }).sort(App.db ? App.db.sortByDateTime : undefined);
  }

  function labelFor(f) {
    switch (f.mode) {
      case 'day': return f.date || '日付未指定';
      case 'month': return f.month || '月未指定';
      case 'range': return `${f.from || '開始未指定'}_${f.to || '終了未指定'}`;
      default: return '全件';
    }
  }

  /* ---------- 集計 ---------- */

  function emptyTotals() {
    const o = { count: 0, total: 0 };
    for (const t of TYPES) o[t] = 0;
    return o;
  }

  function addTo(bucket, rec) {
    const amt = Number(rec.amount) || 0;
    bucket.count++;
    bucket.total += amt;
    const key = TYPES.includes(rec.type) ? rec.type : 'その他';
    bucket[key] += amt;
    return bucket;
  }

  /** 日別集計（日付昇順） */
  function dailySummary(records) {
    const map = new Map();
    for (const r of records) {
      const d = r.date || '(日付なし)';
      if (!map.has(d)) map.set(d, Object.assign({ date: d }, emptyTotals()));
      addTo(map.get(d), r);
    }
    return [...map.values()].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }

  /** 月別集計（月昇順） */
  function monthlySummary(records) {
    const map = new Map();
    for (const r of records) {
      const m = (r.date || '').slice(0, 7) || '(日付なし)';
      if (!map.has(m)) map.set(m, Object.assign({ month: m }, emptyTotals()));
      addTo(map.get(m), r);
    }
    return [...map.values()].sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : 0);
  }

  /** 全体の合計 */
  function grandTotal(records) {
    return records.reduce((acc, r) => addTo(acc, r), emptyTotals());
  }

  /* ---------- 行データ ---------- */

  function detailRows(records) {
    return records.map(r => ({
      '日付': r.date || '',
      '曜日': U().weekday(r.date),
      '時刻': r.time || '',
      '種別': r.type || '',
      '名称・経路': r.name || '',
      '金額(円)': Number(r.amount) || 0,
      'メモ': r.note || '',
      '読取方法': r.source || '',
      '要確認': needsCheck(r) ? '要確認' : '',
    }));
  }

  /** 信頼度の低い項目がある、または必須項目が空 */
  function needsCheck(r) {
    if (!r.date || !(Number(r.amount) > 0)) return true;
    const c = r.confidence || {};
    return ['date', 'amount'].some(k => typeof c[k] === 'number' && c[k] < 0.6);
  }

  function summaryRows(list, keyName) {
    return list.map(s => {
      const row = {};
      row[keyName] = s[keyName === '日付' ? 'date' : 'month'];
      if (keyName === '日付') row['曜日'] = U().weekday(s.date);
      for (const t of TYPES) row[t] = s[t];
      row['合計'] = s.total;
      row['件数'] = s.count;
      return row;
    });
  }

  /* ---------- CSV ---------- */

  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function rowsToCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.map(csvEscape).join(',')];
    for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
    return lines.join('\r\n');
  }

  /** Excelで文字化けしないよう BOM 付き UTF-8 で出力 */
  function downloadCsv(records, filter) {
    const rows = detailRows(records);
    const daily = summaryRows(dailySummary(records), '日付');
    let csv = rowsToCsv(rows);
    csv += '\r\n\r\n【日別集計】\r\n' + rowsToCsv(daily);
    const total = grandTotal(records);
    csv += `\r\n\r\n合計,${total.total},件数,${total.count}`;
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    U().download(blob, `交通費_${labelFor(filter)}.csv`);
  }

  /* ---------- Excel ---------- */

  function downloadXlsx(records, filter) {
    if (!global.XLSX) throw new Error('Excelライブラリを読み込めませんでした。CSV出力をご利用ください。');
    const X = global.XLSX;
    const wb = X.utils.book_new();

    // 明細
    const rows = detailRows(records);
    const total = grandTotal(records);
    rows.push({
      '日付': '', '曜日': '', '時刻': '', '種別': '', '名称・経路': '合計',
      '金額(円)': total.total, 'メモ': `${total.count}件`, '読取方法': '', '要確認': '',
    });
    const wsDetail = X.utils.json_to_sheet(rows);
    wsDetail['!cols'] = [{ wch: 12 }, { wch: 5 }, { wch: 7 }, { wch: 11 }, { wch: 32 }, { wch: 11 }, { wch: 24 }, { wch: 10 }, { wch: 9 }];
    X.utils.book_append_sheet(wb, wsDetail, '明細');

    // 日別集計
    const daily = summaryRows(dailySummary(records), '日付');
    if (daily.length) {
      const wsDay = X.utils.json_to_sheet(daily);
      wsDay['!cols'] = [{ wch: 12 }, { wch: 5 }].concat(TYPES.map(() => ({ wch: 11 })), [{ wch: 11 }, { wch: 7 }]);
      X.utils.book_append_sheet(wb, wsDay, '日別集計');
    }

    // 月別集計（複数月にまたがるときのみ）
    const monthly = monthlySummary(records);
    if (monthly.length > 1) {
      const wsMonth = X.utils.json_to_sheet(summaryRows(monthly, '月'));
      wsMonth['!cols'] = [{ wch: 10 }].concat(TYPES.map(() => ({ wch: 11 })), [{ wch: 11 }, { wch: 7 }]);
      X.utils.book_append_sheet(wb, wsMonth, '月別集計');
    }

    const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
    U().download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `交通費_${labelFor(filter)}.xlsx`);
  }

  /* ---------- JSON バックアップ ---------- */

  function downloadJson(records) {
    const payload = { app: 'transport-expense', version: 1, exportedAt: new Date().toISOString(), records };
    U().download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `交通費バックアップ_${U().today()}.json`);
  }

  App.exporter = {
    filterRecords, labelFor, dailySummary, monthlySummary, grandTotal,
    detailRows, summaryRows, needsCheck, rowsToCsv, downloadCsv, downloadXlsx, downloadJson, TYPES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = App.exporter;
})(typeof window !== 'undefined' ? window : globalThis);
