async function testSquid() {
  const trackId = "439865782"; // Real track ID
  const url = `https://music.b1s4.xyz/squid/track/?id=${trackId}&quality=LOW`;
  try {
    console.log("Fetching stream from music.b1s4.xyz/squid proxy...");
    const response = await fetch(url, {
      referrerPolicy: "no-referrer",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (response.ok) {
      const json = await response.json();
      console.log("JSON response keys:", Object.keys(json));
      const manifestBase64 = json.data?.manifest || json.manifest || json.info?.manifest;
      if (manifestBase64) {
        console.log("SUCCESS! Found manifest. Length:", manifestBase64.length);
        const decoded = Buffer.from(manifestBase64, 'base64').toString('utf-8');
        console.log("Decoded Manifest JSON:", decoded);
      }
    } else {
      const text = await response.text();
      console.log("Failed:", text);
    }
  } catch (e) {
    console.error(e);
  }
}
testSquid();
