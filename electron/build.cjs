const packager = require("electron-packager");
const path = require("path");

async function bundle() {
  console.log("Starting programmatic packaging...");
  const appPaths = await packager({
    dir: ".",
    name: "ibramusic",
    platform: "win32",
    arch: "x64",
    icon: path.join(__dirname, "icon.ico"),
    out: "release",
    overwrite: true,
    prune: true,
    ignore: (file) => {
      // Exclude leading slash/backslash for consistency
      const normalized = file.replace(/\\/g, "/").replace(/^\//, "");
      
      // Keep essential files
      if (!normalized) return false;
      
      // Ignore list
      const ignores = [
        "android",
        "ios",
        "jdk-21",
        ".git",
        ".github",
        "out",
        "release"
      ];
      
      if (ignores.some(dir => normalized === dir || normalized.startsWith(dir + "/"))) {
        return true;
      }
      
      // Also ignore large video files
      if (normalized.endsWith(".webm") && normalized.startsWith("web-build/")) {
        return true;
      }
      
      return false;
    }
  });
  console.log("Programmatic packaging complete. Outputs written to:", appPaths);
}

bundle().catch(err => {
  console.error("Packaging failed:", err);
  process.exit(1);
});
