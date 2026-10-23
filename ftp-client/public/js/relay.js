// Client for the FTP relay server (same origin).
export class RelayError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export class Relay {
  constructor(getToken) { this.getToken = getToken; this.sid = null; }

  headers(extra = {}) { return { authorization: `Bearer ${this.getToken()}`, ...extra }; }

  async ping() {
    const r = await fetch('api/ping', { headers: this.headers() });
    return r.ok;
  }

  async call(name, body = {}) {
    const r = await fetch(`api/${name}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ sid: this.sid, ...body }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (r.status === 440) this.sid = null;
      throw new RelayError(j.error || `HTTP ${r.status}`, r.status);
    }
    return r;
  }

  async json(name, body) { return (await this.call(name, body)).json(); }

  async connect(profile, password) {
    const r = await this.json('connect', {
      host: profile.host, port: profile.port, user: profile.user, password,
      secure: profile.secure, insecureTls: profile.insecureTls,
    });
    this.sid = r.sid;
    return r;
  }

  async disconnect() {
    if (!this.sid) return;
    await this.call('disconnect').catch(() => {});
    this.sid = null;
  }

  list(path) { return this.json('list', { path }); }
  mkdir(path) { return this.json('mkdir', { path }); }
  remove(path, dir) { return this.json('delete', { path, dir }); }
  rename(from, to) { return this.json('rename', { from, to }); }
  async download(path) { return (await this.call('download', { path })).blob(); }

  upload(path, blob, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `api/upload?sid=${encodeURIComponent(this.sid)}&path=${encodeURIComponent(path)}`);
      xhr.setRequestHeader('authorization', `Bearer ${this.getToken()}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded, e.total);
      xhr.onload = () => {
        if (xhr.status === 200) resolve();
        else {
          let msg = `HTTP ${xhr.status}`;
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* ignore */ }
          if (xhr.status === 440) this.sid = null;
          reject(new RelayError(msg, xhr.status));
        }
      };
      xhr.onerror = () => reject(new RelayError('通信エラー', 0));
      xhr.send(blob);
    });
  }
}
