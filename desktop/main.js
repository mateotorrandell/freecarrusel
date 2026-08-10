// The desktop shell.
//
// freecarrusel is a Next.js app with a real server behind it: file storage,
// image processing, PNG export, and a subprocess for the AI agent. So this is
// not a wrapper around a website — it starts that server locally, waits for it,
// and points a window at it.
//
// Three jobs, in order of how much they matter:
//   1. Run the app server as a child process and keep it alive.
//   2. Offer a render service backed by the Chromium Electron already ships,
//      so the installer doesn't have to carry a second copy of it.
//   3. Check for the Claude Code CLI on first run and explain how to get it.

const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const { createServer } = require("http");
const path = require("path");
const fs = require("fs");
const net = require("net");

// Where the built app lives. Packaged it sits in resources/; from source it is
// Next's standalone output, which is what `npm run desktop:prepare` produces.
// Both packaged and from source the runtime sits next to this file, so the
// path is the same either way — inside the asar when installed.
const ROOT = path.join(__dirname, "runtime");

// Everything the user creates lives here, never inside the installed app: an
// update replaces the app folder wholesale.
const DATA_DIR = path.join(app.getPath("userData"), "data");
const UPLOAD_DIR = path.join(app.getPath("userData"), "uploads");

let serverProcess = null;
let renderService = null;
let mainWindow = null;
let appUrl = null;
let starting = true;

// ---------------------------------------------------------------- utilities

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ------------------------------------------------------------ render service
//
// The app server posts { html, width, height } and gets PNG bytes back. It
// listens on localhost only and demands a token generated at startup, so
// nothing else on the machine can drive it.

const RENDER_TOKEN = require("crypto").randomBytes(24).toString("hex");

async function paint({ html, width, height }) {
  const offscreen = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    // A 4:5 slide is 1350px tall — taller than a 1080p screen. Without this the
    // window is clamped to the display and the export comes out square.
    enableLargerThanScreen: true,
    frame: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      javascript: false, // slides are markup; nothing here should execute
      images: true,
      backgroundThrottling: false,
    },
  });

  try {
    await offscreen.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );
    // Belt and braces: ask for the exact content box again once the page is in.
    offscreen.setContentSize(width, height);
    // Give webfonts a moment to paint; capturing too early yields the fallback.
    await new Promise((r) => setTimeout(r, 350));
    const image = await offscreen.webContents.capturePage({
      x: 0,
      y: 0,
      width,
      height,
    });
    return image.toPNG();
  } finally {
    offscreen.destroy();
  }
}

function startRenderService(port) {
  return new Promise((resolve) => {
    renderService = createServer((req, res) => {
      if (req.method !== "POST" || req.headers["x-render-token"] !== RENDER_TOKEN) {
        res.writeHead(403).end("forbidden");
        return;
      }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const png = await paint(JSON.parse(body));
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": png.length,
          });
          res.end(png);
        } catch (error) {
          res.writeHead(500).end(String(error?.message ?? error));
        }
      });
    });
    renderService.listen(port, "127.0.0.1", resolve);
  });
}

// -------------------------------------------------------------- app server

async function startAppServer() {
  const port = await freePort();
  const renderPort = await freePort();
  await startRenderService(renderPort);

  const serverEntry = path.join(ROOT, "server.js"); // Next standalone output

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      FREECARRUSEL_DATA_DIR: DATA_DIR,
      FREECARRUSEL_UPLOAD_DIR: UPLOAD_DIR,
      FREECARRUSEL_RENDER_URL: `http://127.0.0.1:${renderPort}/render`,
      FREECARRUSEL_RENDER_TOKEN: RENDER_TOKEN,
      // Electron sets this and it confuses Node's module resolution in the child.
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const log = fs.createWriteStream(path.join(app.getPath("userData"), "server.log"), {
    flags: "a",
  });
  serverProcess.stdout.pipe(log);
  serverProcess.stderr.pipe(log);

  serverProcess.on("exit", (code) => {
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        "freecarrusel stopped",
        `The app server exited unexpectedly (code ${code}).\n\n` +
          `Details: ${path.join(app.getPath("userData"), "server.log")}`
      );
      app.quit();
    }
  });

  appUrl = `http://127.0.0.1:${port}`;
  const ready = await waitForServer(appUrl);
  if (!ready) throw new Error("The app server did not start in time.");
  return appUrl;
}

// ------------------------------------------------------------------- window

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0c0c0d",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(url);

  // Anything that isn't the app itself opens in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showSplash(message) {
  const splash = new BrowserWindow({
    width: 420,
    height: 220,
    frame: false,
    resizable: false,
    backgroundColor: "#0c0c0d",
    webPreferences: { sandbox: true },
  });
  splash.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`
        <body style="margin:0;height:100vh;display:flex;flex-direction:column;
                     align-items:center;justify-content:center;gap:14px;
                     background:#0c0c0d;color:#f5f3f0;
                     font:14px ui-sans-serif,system-ui,sans-serif">
          <div style="font-size:44px;font-weight:800;color:#f97316;line-height:1">f</div>
          <div style="opacity:.7">${message}</div>
        </body>`)
  );
  return splash;
}

// -------------------------------------------------------------- first run

function findClaudeCli() {
  const home = app.getPath("home");
  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env.APPDATA || "", "npm", "claude.cmd"),
          path.join(process.env.LOCALAPPDATA || "", "Programs", "claude", "claude.exe"),
        ]
      : [
          path.join(home, ".local", "bin", "claude"),
          "/opt/homebrew/bin/claude",
          "/usr/local/bin/claude",
          path.join(home, ".npm-global", "bin", "claude"),
        ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

async function checkAssistant() {
  if (findClaudeCli()) return;

  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "One more step",
    message: "The AI assistant needs the Claude Code CLI",
    detail:
      "freecarrusel drives Claude Code on your machine, so the assistant uses " +
      "your own Claude account and nothing is billed through this app.\n\n" +
      "The editor works without it — you just won't see the chat.\n\n" +
      "Install it with:\n    npm install -g @anthropic-ai/claude-code\n" +
      "then run `claude` once to sign in, and reopen freecarrusel.",
    buttons: ["Continue without it", "Open the instructions"],
    defaultId: 1,
    cancelId: 0,
  });

  if (response === 1) {
    await shell.openExternal("https://docs.anthropic.com/en/docs/claude-code");
  }
}

// --------------------------------------------------------------- lifecycle

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const splash = showSplash("Starting…");
  try {
    const url = await startAppServer();
    // The main window is created BEFORE the splash goes away. Destroying the
    // only open window makes Electron fire window-all-closed, and on Windows
    // and Linux that quits the app — which it did, silently, with exit code 0.
    createWindow(url);
    splash.destroy();
    starting = false;
    await checkAssistant();
  } catch (error) {
    splash.destroy();
    starting = false;
    dialog.showErrorBox("freecarrusel could not start", String(error?.message ?? error));
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && appUrl) createWindow(appUrl);
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  serverProcess?.kill();
  renderService?.close();
});

app.on("window-all-closed", () => {
  if (starting) return; // the splash closing during startup is not a quit
  if (process.platform !== "darwin") app.quit();
});

function menuTemplate() {
  const mac = process.platform === "darwin";
  return [
    ...(mac ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Your files",
          click: () => shell.openPath(app.getPath("userData")),
        },
        {
          label: "Project page",
          click: () =>
            shell.openExternal("https://github.com/mateotorrandell/freecarrusel"),
        },
      ],
    },
  ];
}
