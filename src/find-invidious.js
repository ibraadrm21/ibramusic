async function inspectInstances() {
  try {
    const res = await fetch("https://api.invidious.io/instances.json");
    const list = await res.json();
    console.log("Total instances in list:", list.length);
    console.log("First instance info:\n", JSON.stringify(list[0], null, 2));
    
    // Log instances where api is true
    const apiInstances = list.filter(item => item[1].api === true);
    console.log("Instances with api === true:", apiInstances.length);
    if (apiInstances.length > 0) {
      console.log("First API instance:\n", JSON.stringify(apiInstances[0], null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}
inspectInstances();
