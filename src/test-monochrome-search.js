async function testSearch(type, query, param) {
  const host = "https://eu-central.monochrome.tf";
  const url = `${host}/search/?${param}=${encodeURIComponent(query)}`;

  try {
    console.log(`Testing URL: ${url}`);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const json = await res.json();
      console.log(`Keys of response data:`, Object.keys(json.data || json || {}));
      const data = json.data || json;
      if (data) {
        for (const key of ['tracks', 'albums', 'artists', 'playlists', 'topHits']) {
          if (data[key]) {
            const list = data[key].items || [];
            console.log(`Found data.${key}: ${list.length} items`);
            if (list.length > 0) {
              console.log(`First item in data.${key}:`, JSON.stringify(list[0]).substring(0, 400));
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(`Failed: ${e.message}`);
  }
}

async function testAlbumDetail(id) {
  const host = "https://eu-central.monochrome.tf";
  const url = `${host}/album/?id=${id}`;
  try {
    console.log(`Testing Album URL: ${url}`);
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const items = json.data?.items || json.items || [];
      console.log(`Found ${items.length} tracks in album.`);
      if (items.length > 0) {
        console.log("First track:", JSON.stringify(items[0]).substring(0, 300));
      }
    }
  } catch (e) {
    console.error(e);
  }
}

async function testArtistDetail(id) {
  const host = "https://eu-central.monochrome.tf";
  const url = `${host}/artist/?f=${id}`;
  try {
    console.log(`Testing Artist URL: ${url}`);
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const tracks = json.tracks || [];
      console.log(`Found ${tracks.length} tracks for artist.`);
      if (tracks.length > 0) {
        console.log("First track:", JSON.stringify(tracks[0]).substring(0, 300));
      }
    }
  } catch (e) {
    console.error(e);
  }
}

async function run() {
  console.log("=== Testing Album Detail ===");
  await testAlbumDetail("287369655");
  console.log("\n=== Testing Artist Detail ===");
  await testArtistDetail("3632070");
}

run();
