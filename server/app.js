import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration (override with environment variables for local dev)
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const LOGIN_USER = process.env.LOGIN_USER || 'user';
const LOGIN_PASS = process.env.LOGIN_PASS || 'pass';

// Base directory that contains PDFs. Defaults to ../data/pdfs relative to this file
const PDF_DIR = process.env.PDF_DIR || path.resolve(__dirname, '../data/pdfs');

// Ensure the PDF directory exists at startup
await fs.mkdir(PDF_DIR, { recursive: true });

const app = express();

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    name: 'dev.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

// Simple auth guard middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.redirect('/login');
}

// Root redirects to files or login depending on session
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/files');
  }
  return res.redirect('/login');
});

// Render a very simple login form
app.get('/login', (req, res) => {
  const error = req.query.error ? 'Identifiants invalides' : '';
  res.type('html').send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, sans-serif; margin: 2rem; }
      main { max-width: 420px; margin: 0 auto; }
      form { display: grid; gap: 0.75rem; }
      input[type="text"], input[type="password"] { padding: 0.6rem; font-size: 1rem; }
      button { padding: 0.6rem 0.9rem; font-size: 1rem; cursor: pointer; }
      .error { color: #b00020; margin-bottom: 0.5rem; }
      .hint { color: #666; font-size: 0.9rem; margin-top: 0.75rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Connexion</h1>
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="post" action="/login">
        <label>
          Utilisateur
          <input name="username" type="text" autocomplete="username" required />
        </label>
        <label>
          Mot de passe
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit">Se connecter</button>
      </form>
      <p class="hint">Identifiants par défaut: <code>${LOGIN_USER}</code> / <code>${LOGIN_PASS}</code></p>
    </main>
  </body>
  </html>`);
});

// Handle login POST
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  // Simple static check for local dev only
  if (username === LOGIN_USER && password === LOGIN_PASS) {
    req.session.authenticated = true; // Mark session as authenticated
    return res.redirect('/files');
  }
  return res.redirect('/login?error=1');
});

// Logout route
app.post('/logout', (req, res) => {
  // Destroy session and redirect to login
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// List available PDFs for download
app.get('/files', requireAuth, async (req, res) => {
  // Read the directory and filter for .pdf files only
  let entries = [];
  try {
    const files = await fs.readdir(PDF_DIR, { withFileTypes: true });
    entries = files
      .filter(d => d.isFile())
      .map(d => d.name)
      .filter(name => name.toLowerCase().endsWith('.pdf'))
      .sort();
  } catch (err) {
    // Show an empty list if reading fails; this is okay for dev server
    entries = [];
  }

  const list = entries.map(name => `<li><a href="/download/${encodeURIComponent(name)}" download>${name}</a></li>`).join('');

  res.type('html').send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fichiers PDF</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, sans-serif; margin: 2rem; }
      main { max-width: 720px; margin: 0 auto; }
      ul { padding-left: 1.25rem; }
      li { margin: 0.25rem 0; }
      form { margin-top: 1rem; }
      button { padding: 0.5rem 0.8rem; font-size: 1rem; cursor: pointer; }
      .empty { color: #666; }
      .path { color: #666; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Fichiers disponibles</h1>
      <p class="path">Dossier: <code>${PDF_DIR}</code></p>
      ${entries.length ? `<ul>${list}</ul>` : `<p class="empty">Aucun PDF trouvé.</p>`}
      <form method="post" action="/logout"><button type="submit">Se déconnecter</button></form>
    </main>
  </body>
  </html>`);
});

// Secure download endpoint
app.get('/download/:name', requireAuth, async (req, res) => {
  const fileName = path.basename(req.params.name);
  // Only allow .pdf files
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return res.status(400).send('Invalid file');
  }
  const filePath = path.join(PDF_DIR, fileName);
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return res.status(404).send('Not found');
    }
  } catch {
    return res.status(404).send('Not found');
  }
  return res.download(filePath);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Dev server listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log('Login with', LOGIN_USER, '/', LOGIN_PASS);
});
