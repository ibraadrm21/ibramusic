const instances = [
  "https://invidious.projectsegfau.lt",
  "https://invidious.no-logs.com"
];

async function scan200() {
  const videoId = "UybnqDs2GDk";
  for (const inst of instances) {
    try {
      console.log(`\nTesting: ${inst}`);
      const url = `${inst}/api/v1/videos/${videoId}`;
      const response = await fetch(url);
      console.log(`- Status: ${response.status}`);
      const text = await response.text();
      console.log(`- Response (first 400 chars):\n${text.substring(0, 400)}`);
    } catch (e) {
      console.log(`- Failed: ${e.message}`);
    }
  }
}

scan200();
