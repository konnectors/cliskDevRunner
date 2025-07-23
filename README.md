# HandshakeTester

Projet simple pour tester les connecteurs avec Playwright et post-me.

## Installation

```bash
yarn install
```

## Utilisation

Lancer avec le connecteur minimal par défaut :
```bash
yarn start
```

Ou spécifier un connecteur particulier :
```bash
yarn start examples/minimal-konnector
yarn start examples/sample-konnector
yarn start examples/handshake-konnector
```

## Niveaux de Logs

Le projet supporte différents niveaux de logs pour contrôler la verbosité :

```bash
# Logs extrêmes (tout voir)
npm run start:extreme

# Logs complets (flux principal)
npm run start:full

# Logs normaux (essentiels)
npm run start:normal

# Logs silencieux (minimal)
npm run start:quiet
```

**📖 Voir [LOG_LEVELS.md](LOG_LEVELS.md) pour plus de détails sur les niveaux de logs.**

## Fonctionnement

1. Lance Playwright avec Chromium
2. Simule un environnement webview mobile (comme React Native)
3. Expose `window.ReactNativeWebView.postMessage`
4. Configure un messenger post-me pour la communication
5. Navigue vers `about:blank`
6. Injecte le code du connecteur choisi
7. Garde le navigateur ouvert pour les tests

## Structure

- `index.js` - Fichier principal
- `log-config.js` - Configuration des niveaux de logs
- `examples/` - Connecteurs de test existants
- `package.json` - Configuration des dépendances

## Debug

Les messages de communication sont affichés dans la console selon le niveau de log configuré :
- 📤 Messages sortants du connecteur
- 📥 Messages entrants vers l'host
- 🤝 Messages post-me handshake
- 🔔 Messages de debug post-me 