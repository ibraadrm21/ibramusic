const hosts = [
  "https://tidal.kinoplus.online",
  "https://monochrome-api.samidy.com",
  "https://us-west.monochrome.tf",
  "https://wolf.qqdl.site",
  "https://maus.qqdl.site",
  "https://hund.qqdl.site",
  "https://katze.qqdl.site",
  "https://vogel.qqdl.site",
  "https://tidal.squid.wtf",
  "https://eu-central.monochrome.tf",
  "https://api.monochrome.tf",
  "https://hifi.geeked.wtf"
];

async function testAllMonochrome() {
  const trackId = "439865782"; // Real track ID
  console.log(`Testing track resolution across ${hosts.length} Monochrome hosts...`);
  
  for (const host of hosts) {
    try {
      const url = `${host}/track/?id=${trackId}&quality=LOW`;
      const response = await fetch(url, {
        referrerPolicy: "no-referrer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(3000)
      });
      console.log(`- ${host}: status ${response.status}`);
      if (response.ok) {
        const json = await response.json();
        const manifestBase64 = json.data?.manifest || json.manifest || json.info?.manifest;
        if (manifestBase64) {
          console.log(`*** SUCCESS! WORKING MONOCHROME STREAM RESOLVER: ${host}`);
          const decoded = Buffer.from(manifestBase64, 'base64').toString('utf-8');
          console.log(`  Decoded manifest snippet: ${decoded.substring(0, 300)}`);
          break;
        }
      }
    } catch (e) {
      console.log(`- ${host}: failed: ${e.message}`);
    }
  }
}

testAllMonochrome();
