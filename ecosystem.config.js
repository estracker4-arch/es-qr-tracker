const path = require('path');

module.exports = {
  apps: [{
    name: 'es-qr-tracker',
    script: 'server.js',
    cwd: path.join(__dirname, 'backend'),
    watch: false,
    restart_delay: 5000,
    max_restarts: 15,
    env: {
      NODE_ENV: 'production',
    },
  }],
};
