# Guide d'utilisation des tests

## Scripts de test disponibles

### Tests complets
```bash
# Tous les tests (7 tests, ~50s)
yarn test

# Tous les tests avec output détaillé  
yarn test:verbose

# Mode watch (redémarre automatiquement)
yarn test:watch
```

### Tests filtrés individuels (plus rapide pour debug)
```bash
# Test ping simple (~7s)
yarn test:ping

# Test goto-konnector avec ensureAuthenticated (~10s)
yarn test:goto

# Test multi-pages simultanées (~7s)
yarn test:multi

# Test contrôle pilot -> worker (~12s)
yarn test:worker-control
```

### Filtrage manuel (syntaxe directe)
```bash
# Pour un filtrage personnalisé, utilisez directement :
node --test --test-name-pattern="mot-clé" test/*.test.js

# Exemples :
node --test --test-name-pattern="ping" test/*.test.js
node --test --test-name-pattern="goto" test/*.test.js  
node --test --test-name-pattern="worker" test/*.test.js
```

## Liste des tests disponibles

1. **`should load handshake connector and call ping function`**
   - Test basic de chargement connecteur et ping
   - Durée: ~7s

2. **`should handle connector events`**
   - Test gestion d'événements
   - Durée: ~6s

3. **`should support multiple method calls`**
   - Test appels multiples de méthodes
   - Durée: ~6s

4. **`should establish connection and respond to ping`**
   - Test établissement connexion post-me
   - Durée: ~5s

5. **`should handle worker and pilot pages simultaneously`**
   - Test multi-pages avec handshake simultané
   - Durée: ~7s

6. **`should allow pilot to control worker URL via setWorkerState`**
   - Test contrôle URL worker par pilot
   - Durée: ~12s

7. **`should use goto-konnector ensureAuthenticated to navigate worker`**
   - Test navigation via ensureAuthenticated
   - Durée: ~10s

## Debugging

Pour debug un test spécifique, utilisez les scripts individuels qui sont plus rapides et isolent les problèmes. 