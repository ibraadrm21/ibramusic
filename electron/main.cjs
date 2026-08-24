const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const DiscordRPC = require("discord-rpc");
const https = require("https");
const http = require("http");

// Hardware acceleration enabled for GPU rendering & smooth animations

let mainWindow;
let tray;
let rpc;
const clientId = "1258079549886369903"; // ibramusic Discord Application Client ID

let downloadsDir;
let logPath;

function initPaths() {
  if (downloadsDir) return;
  downloadsDir = path.join(app.getPath("userData"), "downloads");
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  logPath = path.join(app.getPath("userData"), "app.log");
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, `--- App Started at ${new Date().toISOString()} ---\n`);
  }
}

function logToFile(level, msg) {
  initPaths();
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [Main] [${level}] ${msg}\n`);
  } catch (err) {}
}

// Pipe all console.log / console.error of Main process to log file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  originalConsoleLog(...args);
  logToFile("INFO", args.join(" "));
};
console.error = (...args) => {
  originalConsoleError(...args);
  logToFile("ERROR", args.join(" "));
};
console.warn = (...args) => {
  originalConsoleWarn(...args);
  logToFile("WARN", args.join(" "));
};

ipcMain.on("log:write", (event, { level, msg }) => {
  initPaths();
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [Renderer] [${level}] ${msg}\n`);
  } catch (err) {}
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "ibraadrm - ibramusic",
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Necessary for playing local file:// streams
    }
  });

  // Modify response headers to bypass CORS restriction in Electron renderer
  const { session } = require("electron");
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["*://*/*"] },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      const url = details.url;

      // Ensure Frame-Options don't block embedded player
      delete responseHeaders["x-frame-options"];
      delete responseHeaders["X-Frame-Options"];
      delete responseHeaders["content-security-policy"];
      delete responseHeaders["Content-Security-Policy"];

      // Do NOT modify CORS headers on googlevideo/youtube domains to prevent "multiple values 'https://www.youtube.com, *'" browser errors
      if (!url.includes("googlevideo.com") && !url.includes("youtube.com") && !url.includes("gstatic.com") && !url.includes("googleapis.com")) {
        responseHeaders["Access-Control-Allow-Origin"] = ["*"];
        responseHeaders["Access-Control-Allow-Headers"] = ["*"];
        responseHeaders["Access-Control-Allow-Methods"] = ["*"];
      }

      if (responseHeaders["www-authenticate"]) {
        delete responseHeaders["www-authenticate"];
      }
      if (responseHeaders["Www-Authenticate"]) {
        delete responseHeaders["Www-Authenticate"];
      }

      callback({ cancel: false, responseHeaders });
    }
  );

  // Load URL
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    const devUrl = process.env.ELECTRON_START_URL || "http://localhost:5174";
    mainWindow.loadURL(devUrl);
  } else {
    const MIME_TYPES = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg"
    };

    const serverPath = path.join(__dirname, "../web-build");
    global.localServer = http.createServer((req, res) => {
      let safeUrl = decodeURIComponent(req.url.split("?")[0]);
      if (safeUrl === "/") {
        safeUrl = "/index.html";
      }

      const filePath = path.join(serverPath, safeUrl);

      fs.readFile(filePath, (err, content) => {
        if (err) {
          const indexPath = path.join(serverPath, "index.html");
          fs.readFile(indexPath, (errIndex, indexContent) => {
            if (errIndex) {
              res.writeHead(404);
              res.end("Not Found");
            } else {
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(indexContent, "utf-8");
            }
          });
        } else {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": contentType });
          res.end(content, "utf-8");
        }
      });
    });

    global.localServer.listen(0, "127.0.0.1", () => {
      const port = global.localServer.address().port;
      console.log(`Local production server listening on http://127.0.0.1:${port}`);
      mainWindow.loadURL(`http://127.0.0.1:${port}`);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

let rpcConnected = false;

// Discord Rich Presence Setup
function initDiscordRPC() {
  rpcConnected = false;
  if (rpc) {
    try { rpc.destroy(); } catch (e) {}
    rpc = null;
  }
  rpc = new DiscordRPC.Client({ transport: "ipc" });

  rpc.on("ready", () => {
    rpcConnected = true;
    console.log("Discord Rich Presence connected & ready!");
  });

  rpc.on("disconnected", () => {
    rpcConnected = false;
  });

  rpc.login({ clientId }).catch(() => {
    rpcConnected = false;
    setTimeout(initDiscordRPC, 10000);
  });
}

function updateDiscordPresence(details) {
  if (!rpc || !rpcConnected) return;

  if (!details || !details.title) {
    rpc.clearActivity().catch(() => {});
    return;
  }

  const isPlaying = !!details.isPlaying;
  const now = Date.now();
  const startTimestamp = isPlaying && typeof details.currentTime === "number" ? Math.floor(now - (details.currentTime * 1000)) : undefined;
  const endTimestamp = isPlaying && details.duration && startTimestamp ? Math.floor(startTimestamp + (details.duration * 1000)) : undefined;

  const activity = {
    details: details.title ? details.title.slice(0, 128) : "Listening to Music",
    state: details.artist ? `by ${details.artist.slice(0, 128)}` : "ibramusic",
    instance: false,
  };

  if (isPlaying) {
    if (startTimestamp) activity.startTimestamp = startTimestamp;
    if (endTimestamp && endTimestamp > now) activity.endTimestamp = endTimestamp;
  }

  rpc.setActivity(activity).catch((err) => {
    console.warn("Failed to set Discord activity:", err.message);
  });
}

// System Tray Setup
function initTray() {
  try {
    const iconPath = path.join(__dirname, "tray_icon.png");
    let trayImage;
    if (fs.existsSync(iconPath)) {
      trayImage = nativeImage.createFromPath(iconPath);
    } else {
      // Create a 16x16 transparent image fallback
      trayImage = nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4), { width: 16, height: 16 });
    }

    tray = new Tray(trayImage);
    const contextMenu = Menu.buildFromTemplate([
      { label: "Restore App", click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { type: "separator" },
      { label: "Play / Pause", click: () => mainWindow?.webContents.send("tray:play-pause") },
      { label: "Next Track", click: () => mainWindow?.webContents.send("tray:next") },
      { label: "Previous Track", click: () => mainWindow?.webContents.send("tray:prev") },
      { type: "separator" },
      { label: "Quit", click: () => {
          app.isQuitting = true;
          app.quit();
        } 
      }
    ]);

    tray.setToolTip("ibramusic");
    tray.setContextMenu(contextMenu);

    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn("Could not create system tray icon:", err.message);
  }
}

// App Lifecycle
app.on("ready", () => {
  initPaths();
  console.log("=== Electron App Ready ===");
  createWindow();
  initTray();
  initDiscordRPC();
});

app.on("window-all-closed", () => {
  if (global.localServer) {
    global.localServer.close();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Communication
ipcMain.on("discord-rpc:update", (event, details) => {
  updateDiscordPresence(details);
});

ipcMain.on("discord-rpc:clear", () => {
  if (rpc) rpc.clearActivity().catch(() => {});
});

// File Downloader implementation
ipcMain.on("download-track", async (event, { track, url }) => {
  initPaths();
  const trackId = track.id;
  const filePath = path.join(downloadsDir, `${trackId}.mp3`);
  const metaPath = path.join(downloadsDir, "downloads.json");

  console.log(`[Electron Downloader] Starting download for: ${track.title} from ${url}`);

  const file = fs.createWriteStream(filePath);
  https.get(url, (response) => {
    if (response.statusCode !== 200) {
      event.sender.send("download-failed", { trackId, error: `HTTP Status ${response.statusCode}` });
      return;
    }

    const totalLength = parseInt(response.headers["content-length"], 10) || 0;
    let downloadedLength = 0;

    response.on("data", (chunk) => {
      downloadedLength += chunk.length;
      const progress = totalLength ? Math.round((downloadedLength / totalLength) * 100) : 0;
      event.sender.send("download-progress", { trackId, progress });
    });

    response.pipe(file);

    file.on("finish", () => {
      file.close();
      
      // Save metadata
      let downloadsMeta = {};
      if (fs.existsSync(metaPath)) {
        try {
          downloadsMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        } catch {}
      }
      
      downloadsMeta[trackId] = {
        ...track,
        localPath: filePath,
        downloadedAt: Date.now()
      };
      fs.writeFileSync(metaPath, JSON.stringify(downloadsMeta, null, 2));

      event.sender.send("download-completed", { trackId, filePath });
      console.log(`[Electron Downloader] Download completed: ${track.title}`);
    });
  }).on("error", (err) => {
    fs.unlink(filePath, () => {});
    event.sender.send("download-failed", { trackId, error: err.message });
  });
});

ipcMain.handle("get-offline-track-path", (event, trackId) => {
  initPaths();
  const filePath = path.join(downloadsDir, `${trackId}.mp3`);
  return fs.existsSync(filePath) ? `file://${filePath}` : null;
});

ipcMain.handle("delete-offline-track", (event, trackId) => {
  initPaths();
  const filePath = path.join(downloadsDir, `${trackId}.mp3`);
  const metaPath = path.join(downloadsDir, "downloads.json");

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  if (fs.existsSync(metaPath)) {
    try {
      const downloadsMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      delete downloadsMeta[trackId];
      fs.writeFileSync(metaPath, JSON.stringify(downloadsMeta, null, 2));
    } catch {}
  }
  return true;
});

ipcMain.handle("get-downloaded-tracks", () => {
  initPaths();
  const metaPath = path.join(downloadsDir, "downloads.json");
  if (!fs.existsSync(metaPath)) return [];
  try {
    const downloadsMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    return Object.keys(downloadsMeta);
  } catch {
    return [];
  }
});
