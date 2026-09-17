// PM2: define los dos procesos Node que corren en el VPS.
// Uso en el servidor:  pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: "vida-solidaria-api",
      cwd: "./apps/api",
      script: "dist/server.js",
      env: { NODE_ENV: "production" },
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
    },
    {
      name: "vida-solidaria-web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
    },
  ],
}
