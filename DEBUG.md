# Guide Debug

Le projet utilise la librairie [debug](https://github.com/debug-js/debug) pour un système de logging filtrable.

## Namespaces disponibles

### Namespaces globaux
- `handshake:main` - Messages du fichier principal
- `handshake:loader` - Logs du module connector-loader

### Namespaces par page (CliskPage)
- `clisk:{pageName}:main` - Messages principaux de la page
- `clisk:{pageName}:page` - Messages console de la page web
- `clisk:{pageName}:message` - Messages post-me échangés
- `clisk:{pageName}:comm` - Communication générale de la page

**Exemple pour la page "main" :**
- `clisk:main:main` - Messages principaux 
- `clisk:main:page` - Console de la page
- `clisk:main:message` - Messages post-me
- `clisk:main:comm` - Communication

## Utilisation

### Activer tous les logs
```bash
DEBUG=handshake:*,clisk:* yarn start examples/handshake-konnector
```

### Activer seulement les logs principaux
```bash
DEBUG=handshake:main,clisk:main:main yarn start examples/handshake-konnector
```

### Activer seulement les messages post-me d'une page
```bash
DEBUG=clisk:main:message yarn start examples/handshake-konnector
```

### Activer les logs de la page web
```bash
DEBUG=clisk:main:page yarn start examples/handshake-konnector
```

### Activer la communication d'une page spécifique
```bash
DEBUG=clisk:main:comm,clisk:main:message yarn start examples/handshake-konnector
```

### Activer tous les logs d'une page
```bash
DEBUG=clisk:main:* yarn start examples/handshake-konnector
```

### Désactiver tous les logs debug (mode silencieux)
```bash
yarn start examples/handshake-konnector
```

## Exemples de patterns

- `DEBUG=clisk:*` - Tous les logs de toutes les pages
- `DEBUG=clisk:main:*` - Tous les logs de la page "main"
- `DEBUG=clisk:*:message` - Messages post-me de toutes les pages
- `DEBUG=clisk:*:comm` - Communication de toutes les pages
- `DEBUG=handshake:main,clisk:main:main` - Logs principaux globaux et de page
- `DEBUG=*` - Tous les logs (inclut les dépendances)

## Architecture multi-pages

Le système est conçu pour supporter plusieurs pages simultanément :
- Chaque page a ses propres namespaces debug
- Isolation complète des handlers et variables
- Communication post-me cloisonnée par page
- Logs identifiés par nom de page

**Exemple avec plusieurs pages :**
```javascript
const mainPage = new CliskPage(context, 'main');
const adminPage = new CliskPage(context, 'admin');
```

Namespaces générés :
- `clisk:main:*` pour la page "main"
- `clisk:admin:*` pour la page "admin"

## Logs d'erreur

Les erreurs critiques (handshake failed, loading errors) restent affichées via `console.error` même sans DEBUG activé pour assurer le debugging en production.

## Notes

- Tous les `console.log` du code ont été remplacés par le système debug
- Les logs de page incluent le nom de la page pour identification
- En mode silencieux, seules les erreurs critiques s'affichent
- Chaque CliskPage est complètement isolée des autres 