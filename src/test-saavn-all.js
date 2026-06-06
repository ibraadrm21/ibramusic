async function testAllResults() {
  const query = "Hotline Bling";
  const url = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=10`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const results = json.data?.results || json.results || [];
      console.log(`Found ${results.length} results for "${query}":`);
      for (const s of results) {
        console.log(`- "${s.name}" by "${s.primaryArtists || s.artists?.primary?.[0]?.name}" | Album: "${s.album?.name || s.album}"`);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
testAllResults();
