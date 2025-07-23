# Debug Logging Guide

Ce projet utilise la librairie `debug` pour des logs filtrés et modulaires.

## Namespaces disponibles

### Logs principaux
- `handshake:main` - Orchestration générale du programme

### Logs par page (worker/pilot)
Chaque page a ses propres namespaces isolés :

- `clisk:worker:main` / `clisk:pilot:main` - Lifecycle de la page
- `clisk:worker:page` / `clisk:pilot:page` - Console de la page web
- `clisk:worker:message` / `clisk:pilot:message` - Messages post-me détaillés
- `clisk:worker:comm` / `clisk:pilot:comm` - Communication et handshake
- `clisk:worker:nav` / `clisk:pilot:nav` - **Navigation et auto-reconnection** ⭐

### Logs du connecteur
- `clisk:connector` - Chargement et injection des connecteurs

## Exemples d'utilisation

### Démarrage normal
```bash
yarn start
```

### Logs principaux seulement
```bash
DEBUG=handshake:main yarn start
```

### Logs d'une page spécifique
```bash
DEBUG=clisk:worker:* yarn start
DEBUG=clisk:pilot:* yarn start
```

### Logs de navigation et auto-reconnection ⭐
```bash
DEBUG=clisk:worker:nav,clisk:pilot:nav yarn start
```

### Logs de communication seulement
```bash
DEBUG=clisk:*:comm yarn start
```

### Tous les logs
```bash
DEBUG=* yarn start
```

### Logs multi-pages avec communication
```bash
DEBUG=handshake:main,clisk:*:main,clisk:*:comm yarn start
```

## Fonctionnalité Auto-Reconnection ⭐

La nouvelle fonctionnalité d'auto-reconnection permet au système de maintenir la communication avec les connecteurs même quand l'utilisateur navigue vers de nouvelles URLs.

### Comment ça fonctionne
1. **Détection automatique** des changements d'URL via `framenavigated`
2. **Fermeture propre** de l'ancienne connexion post-me
3. **Réinjection automatique** du connecteur sur la nouvelle page
4. **Rétablissement** de la communication post-me

### Comment tester
1. Démarrer le système : `yarn start`
2. Dans un onglet, naviguer vers n'importe quelle URL (ex: google.com)
3. Observer les logs de reconnection automatique
4. Vérifier que la communication fonctionne toujours

### Logs spécifiques
```bash
# Surveiller la navigation et reconnection
DEBUG=clisk:worker:nav,clisk:pilot:nav yarn start

# Voir tout le processus de reconnection
DEBUG=clisk:*:nav,clisk:*:comm yarn start
```

### Contrôle programmatique
```javascript
// Désactiver l'auto-reconnection
workerPage.setAutoReconnect(false);

// Réactiver l'auto-reconnection  
pilotPage.setAutoReconnect(true);

// Forcer une reconnection manuelle
await workerPage.manualReconnect();
```

## Architecture Multi-Pages

Le système supporte maintenant parfaitement les pages multiples avec :
- **Communication isolée** par page
- **Logs séparés** par namespace
- **Auto-reconnection indépendante** par page
- **Performance optimisée** (parallélisme quand possible)

### Initialisation
- Pages : **séquentiel** (évite les conflits Playwright `exposeFunction`)
- Navigation : **parallèle** (sécurisé)
- Chargement connecteurs : **parallèle** (sécurisé)
- Handshakes : **parallèle** (sécurisé après init séquentiel) 