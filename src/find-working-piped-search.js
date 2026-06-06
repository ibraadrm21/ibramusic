const instances = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi-libre.kavin.rocks",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.moe.xyz",
  "https://pipedapi.lvk.li",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.colt.top",
  "https://pipedapi.ast.lol",
  "https://pipedapi.tokhmi.xyz",
  "https://pipedapi.reallyawesomedomain.xyz"
];

async function findWorkingPiped() {
  console.log(`Testing ${instances.length} Piped API instances...`);
  for (const inst of instances) {
    try {
      const url = `${inst}/search?q=Adele&filter=music_songs`;
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      console.log(`- ${inst}: status ${response.status}`);
      if (response.ok) {
        const json = await response.json();
        const items = json.items || json.relatedStreams || [];
        if (items.length > 0) {
          console.log(`*** WORKING PIPED INSTANCE FOUND: ${inst}`);
          console.log(`  First item: ${items[0].title}`);
          return inst;
        }
      }
    } catch (e) {
      console.log(`- ${inst}: failed: ${e.message}`);
    }
  }
  console.log("No working Piped instances found.");
  return null;
}

findWorkingPiped();
