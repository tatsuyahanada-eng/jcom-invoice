/* J:COMチェッカーとの照合ロジック（ブラウザ／Node共通）。
   JCOMLIB.compare(DEVICES, UNLOCK, J) → { rows, ref, unreg, cnt, notInJ }
   JCOMLIB.refJs(res, date, chg)       → jcom_ref.js の中身（文字列）
   JCOMLIB.diff(oldJ, newJ)            → { added, removed, changed } */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.JCOMLIB = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const CAT = { au: "au", docomo: "docomo", SoftBank: "sb", UQ: "uq", "Y!mobile": "ymobile", "楽天モバイル": "rakuten", "SIMフリー": "free" };
  const CODE = /(?<![A-Za-z0-9-])([A-Z]{1,3}-\d{2}[A-Z]|[A-Z]{3}\d{2}|[A-Z]{2}[VGFTX]\d{2}|A\d{3}[A-Z]{2}|\d{3}[A-Z]{2,3}|LP-\d{2}|SH-R?M\d{2}s?|XQ-[A-Z]{2}\d{2}|SM-[A-Z]\d{3}[A-Z]|XT\d{4}-\d|J\d{4}|AT-M\d{3}J|[A-Z]{3}-L[A-Z0-9]{2,3}J?)(?![A-Za-z0-9])/g;
  const N = x => (x || "").normalize("NFKC").toLowerCase().replace(/samsung|google|motorola|xiaomi|sony|sharp|kyocera|fcnt|®|™|（.*?）|\(.*?\)|\s|-|・/g, "");
  const NG = x => (x || "").normalize("NFKC").toLowerCase().replace(/samsung|google|®|™|\s|-|・/g, "").replace(/[（）()]/g, "");
  const rk = r => { const m = /(\d{4})年(?:(\d{1,2})月)?/.exec(r || ""); return m ? +m[1] * 100 + (m[2] ? +m[2] : 6) : 0; };

  function compare(DEVICES, UNLOCK, J) {
    const sold = v => { const b = (UNLOCK[v.c] || {}).buy; return !!(b && v.ship === "locked" && /\d{4}年\d{1,2}月/.test(v.rel || "") && rk(v.rel) > rk(b.since)); };
    const verdict = v => { const u = UNLOCK[v.c] || {};
      if (v.c === "rakuten" || v.c === "free" || v.ship === "free" || sold(v)) return ["不要", "解除不要"];
      if (v.ship === "locked") return ["要", u.buy ? "購入日で判定" : u.remote ? "要確認（au側で順次解除中）" : "要解除"];
      return ["?", v.ship]; };
    const idx = [];
    for (const d of DEVICES) { if (d.generic) continue; for (const v of d.variants) idx.push({ d, v, codes: ((v.code || "") + " " + (v.n || "")).match(CODE) || [], n: N(d.name), ng: NG(d.name), nn: N(v.n || "") }); }
    const rows = [], used = new Set();
    for (const j of J) {
      const c = CAT[j.cat], cand = idx.filter(x => x.v.c === c), jc = j.name.match(CODE) || [];
      let hit = cand.filter(x => jc.some(k => x.codes.includes(k)));
      if (!hit.length) hit = cand.filter(x => x.ng === NG(j.name));
      if (!hit.length) hit = cand.filter(x => x.n === N(j.name) || (x.nn && x.nn === N(j.name)));
      if (!hit.length) { const bare = j.name.replace(/\s+(?=\S*\d)[A-Z0-9][A-Za-z0-9\-]{2,}$/, ""); if (bare !== j.name) hit = cand.filter(x => x.ng === NG(bare) || x.n === N(bare)); }
      if (!hit.length) { rows.push({ j, c, status: "アプリ未登録" }); continue; }
      hit.forEach(h => used.add(h.v));
      const x = hit[0], [a, lab] = verdict(x.v);
      let status = a === j.unlock ? "一致" : "相違", why = "";
      if (status === "相違" && c === "au" && x.v.ship === "locked" && j.unlock === "不要")
        { status = "基準の違い"; why = "J:COM MOBILEはau回線のため、au端末は2017年夏より前の機種を除きロック解除なしで使える（J:COMの判定）。本ツールは他社回線（ドコモ・ソフトバンク系など）で使う場合の判定"; }
      else if (status === "相違" && j.unlock === "要") why = "本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」";
      else if (status === "相違") why = "本ツールは購入日で判定（公式のロックあり機種一覧に掲載）。J:COMは「不要」";
      rows.push({ j, c, x, a, lab, status, why });
    }
    const ref = {};
    for (const r of rows) if (r.x) ref[r.x.d.id + "|" + r.c] = [r.j.unlock, r.j.name, r.status, r.why];
    const unreg = rows.filter(r => r.status === "アプリ未登録").map(r => ({ cat: r.j.cat, name: r.j.name, unlock: r.j.unlock }));
    const cnt = {}; for (const r of rows) { const k = r.j.cat; cnt[k] = cnt[k] || { 一致: 0, 基準の違い: 0, 相違: 0, アプリ未登録: 0 }; cnt[k][r.status]++; }
    const notInJ = idx.filter(x => !used.has(x.v) && x.v.c !== "free" && x.v.c !== "rakuten");
    return { rows, ref, unreg, cnt, notInJ, idx };
  }

  function diff(oldJ, newJ) {
    const k = o => o.cat + "\u0001" + o.name;
    const O = new Map(oldJ.map(o => [k(o), o])), Nn = new Map(newJ.map(o => [k(o), o]));
    return {
      added: newJ.filter(o => !O.has(k(o))).map(o => ({ cat: o.cat, name: o.name, unlock: o.unlock })),
      removed: oldJ.filter(o => !Nn.has(k(o))).map(o => ({ cat: o.cat, name: o.name, unlock: o.unlock })),
      changed: newJ.filter(o => O.has(k(o)) && O.get(k(o)).unlock !== o.unlock).map(o => ({ cat: o.cat, name: o.name, from: O.get(k(o)).unlock, to: o.unlock }))
    };
  }

  function refJs(res, total, date, chg) {
    return '/* J:COM「モバイル動作確認端末チェッカー」の判定（参考表示用・自動生成：jcom_lib.js） */\nconst JCOM_REF_DATE = "' + date + '";\nconst JCOM_REF = ' + JSON.stringify(res.ref) +
      ';\n/* 前回確認からの差分（追加・削除・要否変更）と、アプリ未登録の機種 */\nconst JCOM_CHANGES = ' + JSON.stringify({ date, total, added: chg.added, removed: chg.removed, changed: chg.changed, unregistered: res.unreg }) + ';\n';
  }
  return { compare, diff, refJs, CAT };
});
