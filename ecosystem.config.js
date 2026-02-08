module.exports = {
  apps: [
    {
      name: 'claudecraft',
      script: 'dist/autonomousMode.js',
      cwd: '/Users/zach/Claudecraft',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      // Kill old port holders before restart
      kill_timeout: 5000,
      // Log config
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Environment
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'minecraft',
      script: 'java',
      args: '-Xmx4G -Xms2G -jar paper.jar --nogui',
      cwd: '/Users/zach/Claudecraft/minecraft-server',
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 10000,
      kill_timeout: 15000,
      // Log config
      error_file: '/Users/zach/Claudecraft/logs/mc-error.log',
      out_file: '/Users/zach/Claudecraft/logs/mc-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
