const list = [
  "https://inv.thepixora.com",
  "https://invidious.projectsegfau.lt"
];

async function testInvidious() {
  for (const inst of list) {
    try {
      console.log(`\nTesting Invidious instance: ${inst}`);
      // Search YouTube Music content
      const searchUrl = `${inst}/api/v1/search?q=Nemzzz%20ART&type=video`;
      const response = await fetch(searchUrl);
      console.log(`Search status: ${response.status}`);
      if (response.ok) {
        const items = await response.json();
        console.log(`Found items: ${items.length}`);
        if (items.length > 0) {
          console.log(`First item: ${items[0].title} (videoId: ${items[0].videoId})`);
          
          const videoId = items[0].videoId;
          const streamUrl = `${inst}/api/v1/videos/${videoId}`;
          const streamResponse = await fetch(streamUrl);
          console.log(`Stream status: ${streamResponse.status}`);
          if (streamResponse.ok) {
            const streamData = await streamResponse.json();
            const adaptive = streamData.adaptiveFormats || [];
            const audio = adaptive.find(f => f.type && f.type.startsWith("audio/"));
            if (audio) {
              console.log(`SUCCESS! Stream URL: ${audio.url.substring(0, 100)}...`);
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

testInvidious();
