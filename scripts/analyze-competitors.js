#!/usr/bin/env node
/**
 * Colosseum Competitive Intelligence
 * Fetches all forum posts + leaderboard, analyzes what teams are talking about,
 * and generates strategic messaging recommendations via Claude.
 */

require('dotenv').config();
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk').default;

const COLOSSEUM_API_KEY = process.env.COLOSSEUM_API_KEY;
if (!COLOSSEUM_API_KEY) {
  console.error('Missing COLOSSEUM_API_KEY in .env');
  process.exit(1);
}

function colosseumReq(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'agents.colosseum.com',
      port: 443,
      path: '/api' + path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${COLOSSEUM_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };
    const r = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

(async () => {
  console.log('Fetching Colosseum data...\n');

  const [postsRes, lbRes] = await Promise.all([
    colosseumReq('/forum/posts?limit=50'),
    colosseumReq('/leaderboard'),
  ]);

  const posts = postsRes.posts || [];
  const entries = lbRes.entries || [];

  // Print raw data summary
  console.log(`=== LEADERBOARD (${entries.length} projects) ===`);
  entries.slice(0, 30).forEach((e) => {
    const p = e.project;
    console.log(
      `#${e.rank} ${p.name} (${p.ownerAgentName}) H:${p.humanUpvotes} A:${p.agentUpvotes} - ${(p.description || '').slice(0, 100)}`
    );
  });

  console.log(`\n=== FORUM POSTS (${posts.length}) ===`);
  const otherPosts = posts.filter((p) => p.agentId !== 42); // filter out ours
  otherPosts.forEach((p) => {
    console.log(`---`);
    console.log(`#${p.id} ${p.agentName} | Score:${p.score} Comments:${p.commentCount} Tags:${(p.tags || []).join(',')}`);
    console.log(`  ${p.title}`);
    console.log(`  ${(p.body || '').slice(0, 200)}`);
  });

  // Build a digest for Claude
  const leaderboardDigest = entries.slice(0, 30).map((e) => {
    const p = e.project;
    return `#${e.rank} "${p.name}" by ${p.ownerAgentName} (H:${p.humanUpvotes} A:${p.agentUpvotes}) — ${(p.description || '').slice(0, 200)}`;
  }).join('\n');

  const postsDigest = otherPosts.map((p) => {
    return `[${p.agentName}] "${p.title}" (score:${p.score}, comments:${p.commentCount}, tags:${(p.tags || []).join(',')}):\n${(p.body || '').slice(0, 500)}`;
  }).join('\n---\n');

  // Get our current post for reference
  const ourPosts = posts.filter((p) => p.agentId === 42);
  const ourPostDigest = ourPosts.map((p) => `"${p.title}" (score:${p.score}, comments:${p.commentCount}): ${(p.body || '').slice(0, 300)}`).join('\n');

  console.log('\n\n========================================');
  console.log('  RUNNING COMPETITIVE ANALYSIS VIA CLAUDE');
  console.log('========================================\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `You are a competitive intelligence analyst for ClaudeCraft, an AI agent project in the Colosseum hackathon. ClaudeCraft gives AI agents real bodies in Minecraft — they can walk, build, explore, and fight in token-wagered PvP.

Here's the current hackathon landscape:

=== LEADERBOARD (top 30) ===
${leaderboardDigest}

=== OTHER TEAMS' FORUM POSTS ===
${postsDigest}

=== OUR POSTS ===
${ourPostDigest}

Analyze this data and give me:

## 1. COMPETITOR LANDSCAPE
- What categories of projects dominate? (DeFi, social, AI infra, consumer, etc.)
- Who are the top 5 threats to us and why?
- What themes/narratives are getting the most engagement (votes + comments)?

## 2. MESSAGING GAPS
- What are competitors saying that resonates? What language/framing works?
- What are they NOT saying that we could own?
- How do our posts compare in tone, structure, and persuasiveness?

## 3. STRATEGIC RECOMMENDATIONS (top 5)
For each recommendation, give:
- The specific action to take
- Why it would work based on the data
- Draft messaging or talking points

## 4. CONTENT CALENDAR (next 3 posts)
Give me 3 specific forum post ideas with titles and key bullets, tailored to what's currently resonating in the ecosystem.

## 5. COALITION TARGETS
Which specific projects should we prioritize for partnerships/vote exchanges based on alignment and engagement levels?

Be specific, data-driven, and actionable. Reference specific projects and posts by name.`,
      },
    ],
  });

  const analysis = response.content[0].type === 'text' ? response.content[0].text : '';
  console.log(analysis);

  // Save the analysis
  const fs = require('fs');
  const outPath = require('path').join(__dirname, '../data/competitor-analysis.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        leaderboard_count: entries.length,
        posts_analyzed: otherPosts.length,
        analysis,
      },
      null,
      2
    )
  );
  console.log(`\nAnalysis saved to data/competitor-analysis.json`);
})();
