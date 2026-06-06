const MONOCHROME_HOSTS = [
  "https://eu-central.monochrome.tf",
  "https://api.monochrome.tf",
  "https://hifi.geeked.wtf"
];

async function testMonochromeStream() {
  const trackId = "439865782"; // Real track ID from search results
  for (const host of MONOCHROME_HOSTS) {
    try {
      console.log(`\nTesting Monochrome host: ${host}`);
      const url = `${host}/track/?id=${trackId}&quality=LOW`;
      const response = await fetch(url, { referrerPolicy: "no-referrer" });
      console.log(`Status: ${response.status}`);
      if (response.ok) {
        const json = await response.json();
        console.log("JSON response keys:", Object.keys(json));
        
        const manifestBase64 = json.data?.manifest || json.manifest || json.info?.manifest || json.data?.info?.manifest;
        if (manifestBase64) {
          console.log("Found manifest Base64! Length:", manifestBase64.length);
          const decoded = Buffer.from(manifestBase64, 'base64').toString('utf-8');
          console.log("Decoded manifest snippet:", decoded.substring(0, 500));
          
          if (decoded.includes("http")) {
            console.log("Contains direct URL!");
          }
        } else {
          console.log("Full JSON response:\n", JSON.stringify(json, null, 2));
        }
      }
    } catch (e) {
      console.log(`Failed: ${e.message}`);
    }
  }
}

testMonochromeStream();
