const instances = [
  "https://yewtu.be",
  "https://invidious.projectsegfau.lt",
  "https://inv.tux.im",
  "https://invidious.nerd.one",
  "https://invidious.privacydev.net"
];

async function testAll() {
  for (const inst of instances) {
    try {
      console.log(`\nTesting Invidious instance: ${inst}`);
      const url = `${inst}/api/v1/search?q=adele&type=video`;
      const res = await fetch(url);
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const json = await res.json();
        console.log(`Results count: ${json.length}`);
        if (json.length > 0) {
          console.log("First item videoId:", json[0].videoId, "title:", json[0].title);
          // Try to get video details
          const streamUrl = `${inst}/api/v1/videos/${json[0].videoId}`;
          const streamRes = await fetch(streamUrl);
          console.log(`Stream Details Status: ${streamRes.status}`);
          if (streamRes.ok) {
            const streamJson = await streamRes.json();
            const adaptive = streamJson.adaptiveFormats || [];
            const audio = adaptive.find(f => f.type && f.type.startsWith("audio/"));
            if (audio) {
              console.log("Audio Stream URL:", audio.url.substring(0, 100));
              break;
            }
          }
        }
      }
    } catch (e) {
      console.log(`Failed: ${e.message}`);
    }
  }
}
testAll();
