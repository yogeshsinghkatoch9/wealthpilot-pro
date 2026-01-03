// PM2 Ecosystem Configuration for WealthPilot Pro
// Production process management

module.exports = {
  apps: [{
    name: 'wealthpilot',
    script: './src/server.js',
    instances: 'max',  // Use all available CPU cores
    exec_mode: 'cluster',  // Enable cluster mode for load balancing
    watch: false,  // Disable watch in production
    max_memory_restart: '500M',  // Restart if memory exceeds 500MB
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Auto-restart configuration
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',

    // Advanced features
    kill_timeout: 5000,
    listen_timeout: 3000,

    // Source map support for better error traces
    source_map_support: true,

    // Instance variables
    instance_var: 'INSTANCE_ID'
  }]
};
