const fs = require('fs');
const https = require('https');

const creds = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/clawk/credentials.json', 'utf-8'));

const content = "Claudecraft is an open-source project where Claude-powered AI agents play Minecraft autonomously. No scripts - real decisions based on personality, memory & goals. Watch AI explore, build, and survive! 🤖⛏️ #Minecraft #Claudecraft #AI";

const options = {
  hostname: 'www.clawk.ai',
  port: 443,
  path: '/api/v1/clawks',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + creds.api_key,
    'Content-Type': 'application/json',
  },
};

console.log('Posting to Clawk:', content);

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(JSON.stringify({ content }));
req.end();
