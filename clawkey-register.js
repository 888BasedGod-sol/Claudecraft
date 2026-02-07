const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const identity = JSON.parse(fs.readFileSync(process.env.HOME + '/.openclaw/identity/device.json', 'utf8'));

const timestamp = Date.now();
const message = 'clawkey-register-' + timestamp;

const privateKey = crypto.createPrivateKey(identity.privateKeyPem);
const signature = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey);

const publicKeyDer = crypto
  .createPublicKey(identity.publicKeyPem)
  .export({ type: 'spki', format: 'der' });

const challenge = {
  deviceId: identity.deviceId,
  publicKey: publicKeyDer.toString('base64'),
  message,
  signature: signature.toString('base64'),
  timestamp
};

const body = JSON.stringify(challenge);

const req = https.request({
  hostname: 'api.clawkey.ai',
  port: 443,
  path: '/v1/agent/register/init',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const response = JSON.parse(data);
      console.log(JSON.stringify(response, null, 2));
      if (response.registrationUrl) {
        console.log('\n===========================================');
        console.log('HUMAN ACTION REQUIRED');
        console.log('===========================================');
        console.log('Open this link to complete verification:');
        console.log(response.registrationUrl);
        console.log('===========================================\n');
        console.log('Session ID:', response.sessionId);
        console.log('Expires:', response.expiresAt);
      }
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(body);
req.end();
