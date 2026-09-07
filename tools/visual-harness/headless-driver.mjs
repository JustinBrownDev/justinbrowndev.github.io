// Minimal Chrome DevTools Protocol driver for the visual harness. No new
// repo dependency (no puppeteer/playwright) - talks raw CDP over the
// WebSocket global Node already ships, driving the already-installed
// chromium-browser/google-chrome binary. Read-only dev tooling, same as
// the rest of tools/visual-harness.
//
// Responsibility split:
//   - launches one headless Chrome with its own remote-debugging port
//   - navigates to a URL served by tools/visual-harness/serve.mjs
//   - evaluates a caller-supplied async expression in the page and returns
//     its JSON-serializable result
//   - always kills Chrome on the way out, success or failure

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME_CANDIDATES = ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable'];

async function findChrome() {
    for (const bin of CHROME_CANDIDATES) {
        try {
            const proc = spawn(bin, ['--version']);
            const ok = await new Promise(resolve => {
                proc.on('error', () => resolve(false));
                proc.on('exit', code => resolve(code === 0));
            });
            if (ok) return bin;
        } catch { /* try next */ }
    }
    throw new Error(`no Chrome/Chromium binary found (tried: ${CHROME_CANDIDATES.join(', ')})`);
}

async function waitForPort(port, { timeoutMs = 10000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) return res.json();
        } catch { /* not up yet */ }
        await delay(100);
    }
    throw new Error(`Chrome devtools port ${port} did not come up within ${timeoutMs}ms`);
}

class CdpClient {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.eventHandlers = new Map(); // method -> Set<fn>
        ws.addEventListener('message', ev => {
            const msg = JSON.parse(ev.data);
            if (msg.id != null && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(`CDP error (${msg.error.code}): ${msg.error.message}`));
                else resolve(msg.result);
            } else if (msg.method) {
                for (const fn of this.eventHandlers.get(msg.method) ?? []) fn(msg.params);
            }
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    on(method, fn) {
        if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, new Set());
        this.eventHandlers.get(method).add(fn);
        return () => this.eventHandlers.get(method)?.delete(fn);
    }

    once(method) {
        return new Promise(resolve => {
            const off = this.on(method, params => { off(); resolve(params); });
        });
    }
}

/**
 * Launch headless Chrome, navigate to `url`, evaluate `expression` (an async
 * IIFE string that must return a JSON-serializable value), and return it.
 *
 * @param {object} opts
 * @param {string} opts.url - page to load (must be reachable, e.g. served by serve.mjs)
 * @param {string} opts.expression - JS source; wrapped in `(async () => { ... })()`
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.evalTimeoutMs] - Node-side wall clock budget for the evaluate call
 * @param {(text:string)=>void} [opts.onConsole] - page console.log/warn/error passthrough
 * @returns {Promise<any>} parsed `Runtime.evaluate` return value
 */
export async function runHeadlessCapture({
    url,
    expression,
    width = 1280,
    height = 800,
    evalTimeoutMs = 120000,
    onConsole = null,
}) {
    const bin = await findChrome();
    const port = 9000 + Math.floor(Math.random() * 3000);
    const userDataDir = `/tmp/jweb-headless-capture-${port}`;
    const chrome = spawn(bin, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--enable-unsafe-swiftshader', // software WebGL fallback in headless
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        `--window-size=${width},${height}`,
        'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let chromeErrLog = '';
    chrome.stderr?.on('data', chunk => { chromeErrLog += chunk.toString(); });

    const chromeExited = new Promise(resolve => chrome.on('exit', code => resolve(code)));

    try {
        await waitForPort(port);
        const targetInfo = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then(r => r.json());
        const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', reject, { once: true });
        });
        const cdp = new CdpClient(ws);
        await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
        if (onConsole) {
            cdp.on('Runtime.consoleAPICalled', params => {
                const text = (params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ');
                onConsole(`[page:${params.type}] ${text}`);
            });
        }
        cdp.on('Runtime.exceptionThrown', params => {
            if (onConsole) onConsole(`[page:exception] ${params.exceptionDetails?.text ?? ''} ${params.exceptionDetails?.exception?.description ?? ''}`);
        });

        const navigated = cdp.send('Page.navigate', { url });
        const loaded = cdp.once('Page.loadEventFired');
        await Promise.all([navigated, loaded]);

        const evalPromise = cdp.send('Runtime.evaluate', {
            expression: `(async () => { ${expression} })()`,
            awaitPromise: true,
            returnByValue: true,
        });
        const timeout = delay(evalTimeoutMs).then(() => { throw new Error(`page evaluate exceeded ${evalTimeoutMs}ms`); });
        const evalResult = await Promise.race([evalPromise, timeout]);

        if (evalResult.exceptionDetails) {
            const desc = evalResult.exceptionDetails.exception?.description ?? evalResult.exceptionDetails.text;
            throw new Error(`page threw during capture: ${desc}`);
        }
        return evalResult.result?.value;
    } finally {
        chrome.kill('SIGKILL');
        await Promise.race([chromeExited, delay(3000)]);
        if (chromeErrLog && onConsole) onConsole(`[chrome:stderr]\n${chromeErrLog.trim()}`);
    }
}
