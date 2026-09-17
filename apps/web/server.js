// Servidor mínimo para arrancar Next.js en producción en plataformas (como
// Hostinger Node.js Apps) que necesitan un archivo de entrada .js concreto
// en vez de un comando tipo "next start". No reemplaza next start: hace
// exactamente lo mismo, a mano.
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`> Vida Solidaria web lista en el puerto ${port}`);
  });
});
