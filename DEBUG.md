# Guide Debug

Le projet utilise la librairie [debug](https://github.com/debug-js/debug) pour un système de logging filtrable.

## Namespaces disponibles

- `handshake:main` - Messages du fichier principal
- `handshake:console` - Logs du module console-logger  
- `handshake:page` - Messages provenant de la page web (remplace les console.log de la page)
- `handshake:loader` - Logs du module connector-loader
- `handshake:comm` - Messages généraux de communication
- `handshake:playwright` - Logs spécifiques à Playwright
- `handshake:message` - Messages post-me échangés

## Utilisation

### Activer tous les logs
```bash
DEBUG=handshake:* yarn start examples/handshake-konnector
```

### Activer seulement les logs principaux
```bash
DEBUG=handshake:main,handshake:comm yarn start examples/handshake-konnector
```

### Activer seulement les messages post-me
```bash
DEBUG=handshake:message yarn start examples/handshake-konnector
```

### Activer les logs de la page web
```bash
DEBUG=handshake:page yarn start examples/handshake-konnector
```

### Activer la communication Playwright
```bash
DEBUG=handshake:playwright,handshake:message yarn start examples/handshake-konnector
```

### Désactiver tous les logs debug (mode silencieux)
```bash
yarn start examples/handshake-konnector
```

## Exemples de patterns

- `DEBUG=handshake:*` - Tous les logs du projet
- `DEBUG=handshake:main,handshake:loader` - Seulement main et loader
- `DEBUG=handshake:playwright,handshake:message` - Communication Playwright
- `DEBUG=handshake:page,handshake:message` - Communication bidirectionnelle
- `DEBUG=*` - Tous les logs (inclut les dépendances)

## Logs d'erreur

Les erreurs critiques (handshake failed, loading errors) restent affichées via `console.error` même sans DEBUG activé pour assurer le debugging en production.

## Notes

- Tous les `console.log` du code ont été remplacés par le système debug
- Les logs de la page (ReactNativeWebView, post-me forwarding) sont redirigés vers `handshake:page`
- En mode silencieux, seules les erreurs critiques s'affichent 