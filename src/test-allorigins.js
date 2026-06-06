const instances = [
  "https://pipedapi.adminforge.de",
  "https://pipedapi.lvk.li",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.colt.top",
  "https://pipedapi.ast.lol",
  "https://pipedapi.reallyawesomedomain.xyz",
  "https://pipedapi.tokhmi.xyz"
];

async function test() {
  for (const inst of instances) {
    const target = `${inst}/search?q=adele&filter=videos`;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
    try {
      console.log(`\nTesting: ${inst}`);
      const res = await fetch(url);
      console.log("Status:", res.status);
      if (res.ok) {
        const json = await res.json();
        const items = json.items || json.relatedStreams || [];
        console.log("Found items:", items.length);
        if (items.length > 0) {
          console.log("SUCCESS! First item title:", items[0].title);
          break;
        }
      }
    } catch (e) {
      console.error("Failed:", e.message);
    }
  }
}
test();
