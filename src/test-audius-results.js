async function testAudius() {
  const query = "Nemzzz ART";
  const searchUrl = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=ibramusic`;
  try {
    const res = await fetch(searchUrl);
    if (res.ok) {
      const json = await res.json();
      const tracks = json.data || [];
      console.log(`Found ${tracks.length} tracks on Audius for query "${query}":`);
      for (const t of tracks.slice(0, 10)) {
        console.log(`- Title: "${t.title}" | Artist/User: "${t.user?.name}" | Duration: ${t.duration}s | ID: ${t.id} | Genre: ${t.genre}`);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
testAudius();
