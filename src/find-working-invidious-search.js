async function findWorkingInvidiousSearch() {
  try {
    const res = await fetch("https://api.invidious.io/instances.json");
    if (!res.ok) throw new Error("Failed to fetch instances list");
    const list = await res.json();
    
    const candidates = list
      .map(item => ({
        domain: item[0],
        uri: item[1].uri,
        api: item[1].api,
        cors: item[1].cors,
        type: item[1].type,
        uptime: item[1].monitor ? item[1].monitor.uptime : 0,
        down: item[1].monitor ? item[1].monitor.down : true
      }))
      .filter(item => item.api === true && item.down === false);

    console.log(`Found ${candidates.length} active Invidious instances. Testing search...`);

    for (const c of candidates) {
      const inst = c.uri;
      try {
        const searchUrl = `${inst}/api/v1/search?q=Adele&type=video`;
        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
        if (searchRes.ok) {
          const text = await searchRes.text();
          if (text.trim().startsWith("[")) {
            console.log(`*** WORKING INVIDIOUS INSTANCE FOUND: ${inst}`);
            return inst;
          } else {
            console.log(`- ${inst}: status ${searchRes.status} but response is not JSON array`);
          }
        } else {
          console.log(`- ${inst}: status ${searchRes.status}`);
        }
      } catch (e) {
        console.log(`- ${inst}: failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
  return null;
}

findWorkingInvidiousSearch();
