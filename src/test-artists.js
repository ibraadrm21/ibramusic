async function test() {
  const url = "https://eu-central.monochrome.tf/search/?s=PIN Torrres";
  try {
    const res = await fetch(url);
    const data = await res.json();
    const items = data.data?.items || [];
    console.log("Items found:", items.length);
    if (items.length > 0) {
      console.log("First item title:", items[0].title);
      console.log("First item artist:", JSON.stringify(items[0].artist));
      console.log("First item artists:", JSON.stringify(items[0].artists));
    }
  } catch (e) {
    console.error(e);
  }
}
test();
