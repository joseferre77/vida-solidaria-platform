# deploy/

- **La guía real para tu hosting actual (compartido/Business) está en
  [`../DEPLOY.md`](../DEPLOY.md)** — no hace falta ningún archivo de esta
  carpeta para ese camino, Hostinger lo gestiona todo desde hPanel.
- **`vps-appendix/`** — scripts y configs que solo aplican si en el futuro
  migrás a un VPS propio (control total, pero autogestionado): script de
  setup del servidor, config de Nginx, PM2, y el workflow de GitHub Actions
  con deploy por SSH. Guardados por si los necesitás más adelante — no los
  toques mientras estés en hosting compartido/Business.
