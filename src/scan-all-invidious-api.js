async function scanAllInvidious() {
  try {
    const res = await fetch("https://api.invidious.io/instances.json");
    const list = await res.json();
    
    const candidates = list
      .map(item => ({
        domain: item[0],
        uri: item[1].uri,
        api: item[1].api,
        cors: item[1].cors,
        type: item[1].type,
        uptime: item[1].monitor ? item[1].monitor.uptime : 0,
        down: item[1].monitor ? item[1].monitor.down : true
      }))
      .filter(item => item.api === true && item.down === false);

    console.log(`Scanning ${candidates.length} Invidious API instances...`);
    for (const c of candidates) {
      const inst = c.uri;
      try {
        const searchUrl = `${inst}/api/v1/search?q=Adele&type=video`;
        const response = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
        console.log(`- ${inst}: status ${response.status}`);
        if (response.ok) {
          const text = await response.text();
          if (text.trim().startsWith("[")) {
            const data = JSON.parse(text);
            if (data.length > 0) {
              console.log(`*** WORKING INVIDIOUS SEARCH FOUND: ${inst}`);
              // Try to check if stream details also works!
              const videoId = data[0].videoId;
              const streamUrl = `${inst}/api/v1/videos/${videoId}`;
              const streamRes = await fetch(streamUrl, { signal: AbortSignal.timeout(3000) });
              console.log(`  - Stream status: ${streamRes.status}`);
              if (streamRes.ok) {
                const streamText = await streamRes.text();
                if (streamText.includes("adaptiveFormats")) {
                  console.log(`  *** FULL PLAYBACK FUNCTIONAL INSTANCE: ${inst}`);
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        console.log(`- ${inst}: failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
scanAllInvidious();
