// Stub temporal de arranque para Hostinger.
//
// El preset "Fastify" del asistente de Hostinger no ejecuta ningun paso de
// compilacion (no corre "npm run build"), asi que el server.js real
// (compilado desde TypeScript a dist/server.js) nunca se genera solo con
// el deploy automatico. Este archivo existe para que el deploy pueda
// completarse con exito (arranca un servidor minimo). Inmediatamente
// despues, por SSH, se compila el backend real y se reemplaza el proceso
// en ejecucion - ver DEPLOY.md.
const Fastify = require("fastify");
const app = Fastify();

app.get("/", async () => ({
  status: "stub",
  mensaje: "Vida Solidaria API - deploy en progreso, esperando build real por SSH",
}));

const port = process.env.PORT || 3000;
app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Stub API escuchando en puerto ${port}`);
});
