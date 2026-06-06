async function testCobaltV10() {
  const videoId = "UybnqDs2GDk"; // Nemzzz - ART
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  const endpoints = [
    "https://api.cobalt.tools",
    "https://cobalt.tools/api"
  ];
  
  for (const ep of endpoints) {
    try {
      console.log(`\nQuerying Cobalt at: ${ep}`);
      const response = await fetch(ep, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: youtubeUrl,
          isAudioOnly: true,
          aFormat: "mp3"
        })
      });
      
      console.log(`Status: ${response.status}`);
      const text = await response.text();
      console.log("Response:", text.substring(0, 300));
    } catch (e) {
      console.error("Error:", e.message);
    }
  }
}

testCobaltV10();
