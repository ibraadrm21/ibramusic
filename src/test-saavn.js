const host = "https://saavn.sumit.co";

const queries = [
  "Nemzzz COLD",
  "Drake Hotline Bling",
  "Ed Sheeran Shape of You",
  "Adele Hello"
];

async function testMultiple() {
  for (const q of queries) {
    try {
      console.log(`\nSearching JioSaavn for: "${q}"`);
      const searchUrl = `${host}/api/search/songs?query=${encodeURIComponent(q)}`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const json = await res.json();
        const results = json.data?.results || json.results || [];
        console.log(`Found ${results.length} results.`);
        if (results.length > 0) {
          const song = results[0];
          console.log(`- Top Match: "${song.name}" by "${song.primaryArtists || song.artists?.primary?.[0]?.name}"`);
          const downloadUrl = song.downloadUrl || song.download_url || [];
          const best = downloadUrl[downloadUrl.length - 1];
          console.log(`- Stream Link (${best?.quality}): ${best?.link || best?.url}`);
        }
      }
    } catch (e) {
      console.log(`Failed for "${q}": ${e.message}`);
    }
  }
}

testMultiple();
