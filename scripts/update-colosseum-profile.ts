/**
 * Update ClaudeCraft's project description on Colosseum
 * Run with: npx ts-node scripts/update-colosseum-profile.ts
 */

import * as dotenv from 'dotenv';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const COLOSSEUM_API_KEY = process.env.COLOSSEUM_API_KEY;
const PROJECT_ID = 32;

if (!COLOSSEUM_API_KEY) {
  console.error('❌ COLOSSEUM_API_KEY not set');
  process.exit(1);
}

// Load the description from our data file
const descriptionPath = path.join(__dirname, '../data/colosseum-update.json');
const descriptionData = JSON.parse(fs.readFileSync(descriptionPath, 'utf-8'));
const description = descriptionData.body;

console.log('📝 Updating ClaudeCraft description on Colosseum...');
console.log('---');
console.log(description.slice(0, 500) + '...');
console.log('---');

// Make the API request - try different endpoints
const requestBody = JSON.stringify({ description });

// Try different possible endpoints
const endpoints = [
  { method: 'PATCH', path: `/api/projects/${PROJECT_ID}` },
  { method: 'PUT', path: `/api/projects/${PROJECT_ID}/description` },
  { method: 'POST', path: `/api/projects/${PROJECT_ID}/update` },
];

async function tryEndpoint(endpoint: { method: string; path: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'agents.colosseum.com',
      port: 443,
      path: endpoint.path,
      method: endpoint.method,
      headers: {
        'Authorization': `Bearer ${COLOSSEUM_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`\n${endpoint.method} ${endpoint.path} → Status: ${res.statusCode}`);
        try {
          const result = JSON.parse(data);
          if (result.project || result.success) {
            console.log('✅ Successfully updated project description!');
            resolve(true);
          } else {
            console.log('Response:', JSON.stringify(result, null, 2).slice(0, 200));
            resolve(false);
          }
        } catch {
          console.log('Response:', data.slice(0, 200));
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Error:', e);
      resolve(false);
    });
    req.write(requestBody);
    req.end();
  });
}

// Try each endpoint
(async () => {
  for (const endpoint of endpoints) {
    const success = await tryEndpoint(endpoint);
    if (success) {
      break;
    }
  }
})();
