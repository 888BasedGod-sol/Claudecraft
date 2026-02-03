const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8888,
    allow_origin: '*',
    mediaroot: './media',
  },
  trans: {
    ffmpeg: '/opt/homebrew/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        hlsKeep: false,
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]',
        dashKeep: false
      }
    ]
  }
};

const nms = new NodeMediaServer(config);

nms.on('preConnect', (id, args) => {
  console.log('[NodeMediaServer] Client connecting:', id, args);
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeMediaServer] Client connected:', id);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] Stream starting:', id, StreamPath);
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] 🔴 Stream LIVE:', StreamPath);
  console.log('[NodeMediaServer] HLS URL: http://localhost:8888' + StreamPath + '/index.m3u8');
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeMediaServer] Stream ended:', StreamPath);
});

console.log('='.repeat(50));
console.log('🎬 ClaudeCraft Media Server');
console.log('='.repeat(50));
console.log('');
console.log('📡 RTMP Server: rtmp://localhost:1935/live');
console.log('🌐 HTTP Server: http://localhost:8888');
console.log('');
console.log('OBS Settings:');
console.log('  Server: rtmp://localhost/live');
console.log('  Stream Key: claudecraft');
console.log('');
console.log('Once streaming, HLS URL will be:');
console.log('  http://localhost:8888/live/claudecraft/index.m3u8');
console.log('='.repeat(50));

nms.run();
