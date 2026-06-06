async function testSpotifydown() {
  const playlistId = "0FOiZWmF31s0Khs4mr0Vu4";
  
  // Endpoints to test:
  // 1. https://api.spotifydown.com/metadata/playlist/{playlistId}
  // 2. https://api.spotifydown.com/trackList/playlist/{playlistId}
  
  const urls = [
    `https://api.spotifydown.com/metadata/playlist/${playlistId}`,
    `https://api.spotifydown.com/trackList/playlist/${playlistId}`
  ];
  
  for (const baseUrl of urls) {
    // Try directly first
    try {
      console.log(`\nTesting Direct Fetch for: ${baseUrl}`);
      const res = await fetch(baseUrl, {
        headers: {
          "Origin": "https://spotifydown.com",
          "Referer": "https://spotifydown.com/"
        }
      });
      console.log("Status:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("Keys:", Object.keys(data));
        if (data.success) {
          console.log("Success! Playlist name:", data.title || data.playlist?.name);
          console.log("Tracks count:", data.tracks?.length || data.items?.length);
          if (data.tracks && data.tracks.length > 0) {
            console.log("Sample track:", JSON.stringify(data.tracks[0]));
          }
        }
      }
    } catch (e) {
      console.error("Direct fetch failed:", e.message);
    }
    
    // Try via Codetabs proxy
    try {
      console.log(`\nTesting Proxy Fetch for: ${baseUrl}`);
      const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(baseUrl)}`;
      const res = await fetch(proxyUrl);
      console.log("Proxy Status:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("Keys:", Object.keys(data));
        console.log("Success value:", data.success);
        console.log("Tracks count:", data.tracks?.length || data.items?.length);
        if (data.tracks && data.tracks.length > 0) {
          console.log("Sample track:", JSON.stringify(data.tracks[0]));
        }
      }
    } catch (e) {
      console.error("Proxy fetch failed:", e.message);
    }
  }
}

testSpotifydown();
