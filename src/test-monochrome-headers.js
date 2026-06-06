async function testMonochromeHeaders() {
  const trackId = "439865782"; // Real track ID
  const url = `https://eu-central.monochrome.tf/track/?id=${trackId}&quality=LOW`;
  
  try {
    console.log("Fetching stream from Monochrome with browser headers...");
    const response = await fetch(url, {
      referrerPolicy: "no-referrer",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://music.b1s4.xyz" // Try sending Origin just in case
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (response.ok) {
      const json = await response.json();
      console.log("JSON Keys:", Object.keys(json));
      const manifestBase64 = json.data?.manifest || json.manifest || json.info?.manifest || json.data?.info?.manifest;
      if (manifestBase64) {
        const decoded = Buffer.from(manifestBase64, 'base64').toString('utf-8');
        console.log("Decoded Manifest JSON:", decoded);
        try {
          const parsed = JSON.parse(decoded);
          const streamUrl = Array.isArray(parsed.urls) ? parsed.urls[0] : parsed.url;
          console.log("SUCCESS! Stream URL:", streamUrl);
        } catch (e) {
          console.log("Decoded manifest is not JSON (might be XML/DASH):", decoded.substring(0, 300));
        }
      }
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

testMonochromeHeaders();
