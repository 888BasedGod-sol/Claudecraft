#!/usr/bin/env node
/**
 * PlanetMinecraft Build Scraper
 * 
 * Scrapes popular builds from PlanetMinecraft and adds them to agent training data.
 * Run every 3 days via cron: 0 0 1,4,7,10,13,16,19,22,25,28 * * node scripts/scrape-planetminecraft.js
 * 
 * Usage: node scripts/scrape-planetminecraft.js [--category=<category>] [--pages=<n>]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const TRAINING_PATH = path.join(__dirname, '../src/training/knowledge/planetminecraft-builds.json');
const LAST_SCRAPE_PATH = path.join(__dirname, '../data/planetminecraft-last-scrape.json');

// Categories to scrape
const CATEGORIES = [
  { name: 'popular', url: 'https://www.planetminecraft.com/projects/?order=order_popularity', description: 'Most popular builds of all time' },
  { name: 'trending', url: 'https://www.planetminecraft.com/projects/?order=order_hot', description: 'Currently trending builds' },
  { name: 'medieval', url: 'https://www.planetminecraft.com/projects/tag/medieval/', description: 'Medieval castles, villages, fortresses' },
  { name: 'modern', url: 'https://www.planetminecraft.com/projects/tag/modern/', description: 'Modern houses, cities, skyscrapers' },
  { name: 'fantasy', url: 'https://www.planetminecraft.com/projects/tag/fantasy/', description: 'Fantasy builds, magical structures' },
  { name: 'steampunk', url: 'https://www.planetminecraft.com/projects/tag/steampunk/', description: 'Steampunk machinery and buildings' },
  { name: 'japanese', url: 'https://www.planetminecraft.com/projects/tag/japanese/', description: 'Japanese architecture and gardens' },
  { name: 'ships', url: 'https://www.planetminecraft.com/projects/tag/ship/', description: 'Ships, boats, submarines' },
  { name: 'castles', url: 'https://www.planetminecraft.com/projects/tag/castle/', description: 'Castle builds of all sizes' },
  { name: 'trains', url: 'https://www.planetminecraft.com/projects/tag/train/', description: 'Train stations, locomotives, railways' },
];

// Parse command line args
const args = process.argv.slice(2);
const categoryArg = args.find(a => a.startsWith('--category='));
const pagesArg = args.find(a => a.startsWith('--pages='));
const selectedCategory = categoryArg ? categoryArg.split('=')[1] : null;
const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1]) : 2;

/**
 * Fetch a webpage with proper headers to avoid bot detection
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    };

    https.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract build information from HTML
 */
function extractBuilds(html) {
  const builds = [];
  
  // Match project cards - pattern: <a class="r-info" href="/project/...">
  const projectPattern = /<div class="r-info"[^>]*>[\s\S]*?<a[^>]*href="([^"]*project[^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<span[^>]*>([^<]*)<\/span>/gi;
  
  // Simpler fallback pattern for project links
  const linkPattern = /href="(\/project\/[^"]+)"[^>]*title="([^"]+)"/gi;
  
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const [, url, title] = match;
    if (title && !builds.find(b => b.title === title)) {
      builds.push({
        title: title.trim(),
        url: `https://www.planetminecraft.com${url}`,
        scrapedAt: new Date().toISOString()
      });
    }
  }
  
  // Also try to extract from card titles
  const cardPattern = /<div class="info">[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
  while ((match = cardPattern.exec(html)) !== null) {
    const title = match[1].trim();
    if (title && title.length > 3 && !builds.find(b => b.title === title)) {
      builds.push({
        title,
        url: '',
        scrapedAt: new Date().toISOString()
      });
    }
  }

  return builds.slice(0, 20); // Limit to 20 per category
}

/**
 * Convert scraped builds into training-ready format
 */
function convertToTrainingFormat(builds, category) {
  return builds.map(build => {
    // Analyze title to infer build type and materials
    const title = build.title.toLowerCase();
    
    const inferredStyle = 
      title.includes('medieval') || title.includes('castle') ? 'medieval' :
      title.includes('modern') || title.includes('contemporary') ? 'modern' :
      title.includes('fantasy') || title.includes('magic') ? 'fantasy' :
      title.includes('japanese') || title.includes('asian') ? 'japanese' :
      title.includes('steampunk') ? 'steampunk' :
      title.includes('rustic') || title.includes('cottage') ? 'rustic' :
      title.includes('futuristic') || title.includes('sci-fi') ? 'futuristic' :
      category.name;
    
    const inferredDifficulty = 
      title.includes('simple') || title.includes('small') || title.includes('starter') ? 'easy' :
      title.includes('mega') || title.includes('massive') || title.includes('epic') || title.includes('huge') ? 'hard' :
      'medium';

    return {
      name: build.title,
      source: 'planetminecraft',
      sourceUrl: build.url,
      category: category.name,
      style: inferredStyle,
      difficulty: inferredDifficulty,
      scrapedAt: build.scrapedAt,
      // These would ideally be filled in from detailed page scraping
      tips: [],
      materials: [],
      techniques: []
    };
  });
}

/**
 * Load existing training data
 */
function loadExistingData() {
  try {
    if (fs.existsSync(TRAINING_PATH)) {
      return JSON.parse(fs.readFileSync(TRAINING_PATH, 'utf-8'));
    }
  } catch (e) {
    console.log('[Scraper] Creating new training data file');
  }
  
  return {
    version: '1.0',
    source: 'PlanetMinecraft.com',
    description: 'Build inspiration and techniques scraped from PlanetMinecraft popular projects',
    lastUpdated: null,
    builds: [],
    buildsByCategory: {}
  };
}

/**
 * Get last scrape info
 */
function getLastScrapeInfo() {
  try {
    if (fs.existsSync(LAST_SCRAPE_PATH)) {
      return JSON.parse(fs.readFileSync(LAST_SCRAPE_PATH, 'utf-8'));
    }
  } catch (e) {}
  return { lastScrape: null, scrapeCount: 0 };
}

/**
 * Main scraper function
 */
async function scrape() {
  console.log('='.repeat(50));
  console.log('  PlanetMinecraft Build Scraper');
  console.log('='.repeat(50));
  
  const lastScrape = getLastScrapeInfo();
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  
  if (lastScrape.lastScrape && new Date(lastScrape.lastScrape).getTime() > threeDaysAgo) {
    const daysSince = Math.round((Date.now() - new Date(lastScrape.lastScrape).getTime()) / (24 * 60 * 60 * 1000) * 10) / 10;
    console.log(`\n⏳ Last scrape was ${daysSince} days ago. Next scrape in ${(3 - daysSince).toFixed(1)} days.`);
    console.log('   Use --force to scrape anyway.\n');
    
    if (!args.includes('--force')) {
      return;
    }
    console.log('   --force flag detected, proceeding with scrape...\n');
  }
  
  const data = loadExistingData();
  const categoriesToScrape = selectedCategory 
    ? CATEGORIES.filter(c => c.name === selectedCategory)
    : CATEGORIES;
  
  if (categoriesToScrape.length === 0) {
    console.log(`Unknown category: ${selectedCategory}`);
    console.log(`Available: ${CATEGORIES.map(c => c.name).join(', ')}`);
    return;
  }
  
  console.log(`\n📦 Scraping ${categoriesToScrape.length} categories...\n`);
  
  let totalBuilds = 0;
  
  for (const category of categoriesToScrape) {
    console.log(`📂 ${category.name}: ${category.description}`);
    
    try {
      const html = await fetchPage(category.url);
      const rawBuilds = extractBuilds(html);
      const builds = convertToTrainingFormat(rawBuilds, category);
      
      if (builds.length > 0) {
        // Merge with existing, avoiding duplicates
        if (!data.buildsByCategory[category.name]) {
          data.buildsByCategory[category.name] = [];
        }
        
        for (const build of builds) {
          const existing = data.buildsByCategory[category.name].find(
            b => b.name.toLowerCase() === build.name.toLowerCase()
          );
          if (!existing) {
            data.buildsByCategory[category.name].push(build);
            data.builds.push(build);
            totalBuilds++;
          }
        }
        
        console.log(`   ✅ Found ${builds.length} builds (${totalBuilds} new total)`);
      } else {
        console.log(`   ⚠️  No builds extracted (site may be blocking)`);
      }
      
      // Rate limit between requests
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }
  
  // Save updated data
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TRAINING_PATH, JSON.stringify(data, null, 2));
  
  // Save scrape timestamp
  fs.mkdirSync(path.dirname(LAST_SCRAPE_PATH), { recursive: true });
  fs.writeFileSync(LAST_SCRAPE_PATH, JSON.stringify({
    lastScrape: new Date().toISOString(),
    scrapeCount: (lastScrape.scrapeCount || 0) + 1,
    totalBuilds: data.builds.length
  }, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Scrape complete! ${totalBuilds} new builds added.`);
  console.log(`📁 Total builds in training: ${data.builds.length}`);
  console.log(`📄 Saved to: ${TRAINING_PATH}`);
  console.log('='.repeat(50) + '\n');
}

// Run if called directly
if (require.main === module) {
  scrape().catch(console.error);
}

module.exports = { scrape, CATEGORIES };
