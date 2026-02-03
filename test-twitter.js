require("dotenv").config();
const { TwitterAgent } = require("./dist/twitterAgent.js");
const agent = new TwitterAgent();

const testTweets = [
  "@claudecraftsol -build castle",
  "@claudecraftsol /build a giant pyramid", 
  "@claudecraftsol build me a treehouse",
  "@claudecraftsol build a dragon",
  "@claudecraftsol please make a tower",
  "@claudecraftsol hi there",
];

console.log("Testing build request extraction:\n");
for (const tweet of testTweets) {
  const result = agent.extractBuildRequest(tweet);
  console.log("Tweet:", tweet);
  console.log("  → Request:", result || "null (ignored)", "\n");
}
