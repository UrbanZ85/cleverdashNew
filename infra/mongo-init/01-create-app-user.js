// Stari sistem je tekel brez avtentikacije na Mongu (mongodb://mongo_db:27017/belezenjeCasa).
// Nov ima uporabnika in geslo, tudi če je baza samo na internem omrežju Dockerja
// (docs/env-reference.md, razdelek "Baza").
db = db.getSiblingDB('cleverdash');
db.createUser({
  user: process.env.MONGO_INITDB_ROOT_USERNAME || 'cleverdash',
  pwd: process.env.MONGO_INITDB_ROOT_PASSWORD,
  roles: [{ role: 'readWrite', db: 'cleverdash' }],
});
