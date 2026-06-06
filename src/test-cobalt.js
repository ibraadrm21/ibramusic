async function testCobalt() {
  const videoId = "UybnqDs2GDk"; // Nemzzz - ART
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    console.log(`Querying Cobalt API for: ${youtubeUrl}`);
    const response = await fetch("https://api.cobalt.tools/api/json", {
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
    if (response.ok) {
      const json = await response.json();
      console.log("SUCCESS! Cobalt response:", json);
    } else {
      const text = await response.text();
      console.log(`Failed: ${text}`);
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

testCobalt();
