module.exports = {
    apps: [{
      name: 'app',
      script: './index.js',
      watch: true,
      max_restarts: 9999,
      restart_delay: 1000, 
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }]
  }