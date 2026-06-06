// Use global fetch

async function scrapeSpotifyEmbed(type, id) {
  const url = `https://open.spotify.com/embed/${type}/${id}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  
  try {
    console.log(`Fetching embed for ${type} (${id})...`);
    const res = await fetch(proxyUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status}`);
    }
    const html = await res.text();
    
    // Look for <script id="initial-state" type="application/json">...</script>
    // or <script id="session" type="application/json">...</script>
    // or search for target JSON inside script tags
    const match = html.match(/<script id="(resource|initial-state|session)"[^>]*>([\s\S]*?)<\/script>/i) 
                  || html.match(/<script[^>]*>([\s\S]*?Spotify[\s\S]*?)<\/script>/i);
                  
    if (match) {
      console.log("Found a script tag!");
      // Let's print out the first 500 chars of the script tag content
      console.log(match[0].substring(0, 500));
    } else {
      console.log("Could not find any matching script tag. Let's look for JSON strings...");
      // Let's find script tags
      const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;
      let m;
      let count = 0;
      while ((m = scriptRegex.exec(html)) !== null) {
        count++;
        const content = m[1];
        if (content.includes("initialState") || content.includes("resource") || content.includes("props")) {
          console.log(`Script ${count} matches keywords. Length: ${content.length}`);
          console.log(content.substring(0, 500));
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
}

// Test with a track ID
scrapeSpotifyEmbed("track", "4PTG3Z6ehGkBF3sIqR13dC");
