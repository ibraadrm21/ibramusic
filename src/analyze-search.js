async function analyze() {
  try {
    const res = await fetch("https://music.b1s4.xyz/assets/index-DscBp67i.js");
    const text = await res.text();
    
    const terms = ["/album", "/artist"];
    for (const term of terms) {
      let idx = 0;
      console.log(`=== Matches for ${term} ===`);
      while ((idx = text.indexOf(term, idx)) !== -1) {
        console.log(`Found "${term}" at index ${idx}:`);
        console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 300)));
        console.log("--------------------------------------------------");
        idx += term.length;
      }
    }
  } catch (e) {
    console.error(e);
  }
}
analyze();
