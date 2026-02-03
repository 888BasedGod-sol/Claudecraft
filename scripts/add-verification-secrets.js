const fs = require('fs');
const agentsPath = './data/external-agents.json';
const agents = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));

// Generate verification secrets for existing agents
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function genSecret() {
  let s = 'VERIFY_';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

agents.forEach(a => {
  if (!a.verification_secret) {
    a.verification_secret = genSecret();
    console.log(a.name + ': ' + a.verification_secret);
  }
});

fs.writeFileSync(agentsPath, JSON.stringify(agents, null, 2));
console.log('\n✅ Updated ' + agents.length + ' agents with verification secrets');
