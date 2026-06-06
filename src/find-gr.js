async function findGr() {
  try {
    const res = await fetch("https://music.b1s4.xyz/assets/index-DscBp67i.js");
    const text = await res.text();
    
    // Find "function gr(" or "gr="
    let idx = text.indexOf('async function gr(');
    if (idx === -1) {
      idx = text.indexOf(' gr=');
    }
    
    if (idx !== -1) {
      console.log("Found gr definition. Snippet:\n");
      console.log(text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 400)));
    } else {
      console.log("Could not find gr definition.");
    }
  } catch (e) {
    console.error(e);
  }
}
findGr();
