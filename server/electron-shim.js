// Stands in for Electron so the desktop app's main process (app-main.js) runs unchanged on a
// server. Window messages, notifications and "open this link" go to a bus the web server
// forwards to the browser; IPC handlers are collected so the browser can call them over HTTP.
const crypto = require('crypto');
const fs = require('fs');
const { EventEmitter } = require('events');
const Module = require('module');

const bus = new EventEmitter();
bus.setMaxListeners(100);
const handlers = new Map();

function install({ dataDir, secret }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const key = crypto.createHash('sha256').update(`market-radar:${secret}`).digest();

  const webContents = {
    send: (ch, d) => bus.emit('send', ch, d),
    once: (ev, fn) => ev === 'did-finish-load' && setImmediate(fn),
    setWindowOpenHandler: () => {},
  };
  class BrowserWindow {
    constructor() {
      this.webContents = webContents;
      BrowserWindow.all = [this];
    }
    removeMenu() {}
    loadFile() {}
    isDestroyed() {
      return false;
    }
    static getAllWindows() {
      return BrowserWindow.all || [];
    }
  }
  class Notification {
    constructor(opts) {
      this.opts = opts;
    }
    show() {
      bus.emit('notify', { title: this.opts.title, body: this.opts.body });
    }
    static isSupported() {
      return true;
    }
  }
  // Same idea as the OS keychain: secrets are encrypted at rest with the server's secret.
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), enc]);
    },
    decryptString(buf) {
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    },
  };
  const electron = {
    app: { getPath: () => dataDir, on() {}, getVersion: () => require('../package.json').version },
    BrowserWindow,
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
    // The browser opens links itself; the handler's return value tells it which one.
    shell: { openExternal: async (url) => ({ open: url }) },
    Notification,
    safeStorage,
  };

  const load = Module._load;
  Module._load = function (request, ...rest) {
    return request === 'electron' ? electron : load.call(this, request, ...rest);
  };
}

module.exports = { install, bus, handlers };
