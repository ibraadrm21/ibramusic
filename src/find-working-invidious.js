async function findWorkingInvidious() {
  try {
    const res = await fetch("https://api.invidious.io/instances.json");
    if (!res.ok) throw new Error("Failed to fetch instances list");
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
      .filter(item => item.api === true && item.down === false && item.uptime > 80);

    console.log(`Found ${candidates.length} candidate Invidious instances. Testing search and stream...`);

    for (const c of candidates) {
      const inst = c.uri;
      try {
        console.log(`\nTesting: ${inst}`);
        const searchUrl = `${inst}/api/v1/search?q=Nemzzz%20COLD&type=video`;
        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
        if (!searchRes.ok) {
          console.log(`- Search failed with status: ${searchRes.status}`);
          continue;
        }
        
        let items;
        try {
          items = await searchRes.json();
        } catch (e) {
          console.log(`- Search response not valid JSON`);
          continue;
        }
        
        if (!Array.isArray(items) || items.length === 0) {
          console.log(`- No items found`);
          continue;
        }

        const videoId = items[0].videoId;
        console.log(`- Found videoId: ${videoId}. Fetching streams...`);
        
        const streamUrl = `${inst}/api/v1/videos/${videoId}`;
        const streamRes = await fetch(streamUrl, { signal: AbortSignal.timeout(4000) });
        if (!streamRes.ok) {
          console.log(`- Stream fetch failed with status: ${streamRes.status}`);
          continue;
        }
        
        const streamData = await streamRes.json();
        const adaptive = streamData.adaptiveFormats || [];
        const audio = adaptive.find(f => f.type && f.type.startsWith("audio/"));
        if (audio && audio.url) {
          console.log(`*** SUCCESS! Invidious instance is fully functional: ${inst}`);
          console.log(`- Audio stream URL snippet: ${audio.url.substring(0, 100)}...`);
          return inst; // Stop at first successful instance!
        } else {
          console.log(`- No audio format with direct URL found in stream details`);
        }
      } catch (e) {
        console.log(`- Request failed: ${e.message}`);
      }
    }
    console.log("\nNo fully functional Invidious instance found.");
  } catch (e) {
    console.error("Main error:", e.message);
  }
  return null;
}

findWorkingInvidious();
