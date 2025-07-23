# Tests Automatisés

Ce dossier contient les tests automatisés pour valider le bon fonctionnement du système HandshakeTester.

## 🧪 Tests disponibles

### `handshake.test.js`
Tests principaux qui valident :

1. **Chargement du connecteur**
   - Charge le handshake-konnector depuis `examples/`
   - Valide le manifest (nom, version)
   - Confirme l'établissement de la connexion post-me

2. **Appel de la fonction ping**
   - Utilise un spy pour tracker les appels de méthodes
   - Confirme que le connecteur appelle bien `ping()` automatiquement
   - Valide que la réponse contient le nom de la page

3. **Gestion des événements**
   - Teste la réception d'événements émis par le connecteur
   - Valide la structure des données d'événement

4. **Appels multiples de méthodes**
   - Tracks tous les appels de méthodes locales
   - Confirme que plusieurs méthodes peuvent être appelées

5. **Connexion et réactivité**
   - Teste l'établissement de la connexion post-me
   - Valide que le système reste réactif

6. **Worker et Pilot simultanés** ⭐
   - Crée deux pages indépendantes (worker et pilot)
   - Valide les handshakes simultanés sur les deux pages
   - Confirme que `ping()` est appelée sur chaque page
   - Vérifie l'isolation complète entre les pages
   - Teste l'architecture multi-pages en conditions réelles

## 🚀 Utilisation

### Exécuter tous les tests
```bash
yarn test
```

### Tests en mode watch (re-exécution automatique lors de changements)
```bash
yarn test:watch
```

### Tests avec sortie détaillée
```bash
yarn test:verbose
```

### Exécuter un test spécifique
```bash
node --test test/handshake.test.js
```

## 🏗 Architecture des tests

Les tests utilisent :
- **Node.js built-in test runner** (pas de dépendance externe)
- **Playwright** pour l'automatisation du navigateur
- **CliskPage** pour l'isolation des pages de test
- **Mode headless** pour une exécution rapide
- **Spies/Mocks** via héritage de classe pour tracker les appels

### Exemple de test personnalisé

```javascript
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { CliskPage } from '../src/clisk-page.js';

describe('Mon Test Custom', () => {
  let testPage;

  test('should do something', async () => {
    // Créer une page de test personnalisée
    class MyTestPage extends CliskPage {
      getLocalMethods() {
        const methods = super.getLocalMethods();
        // Ajouter des spies ou modifications
        return methods;
      }
    }

    testPage = new MyTestPage(context, 'my-test');
    
    // Votre logique de test ici
    await testPage.init();
    // ...
    
    assert.ok(true, 'Test should pass');
  });
});
```

## 📊 Résultats attendus

```
▶ Handshake Connector Tests
  ✔ should load handshake connector and call ping function (5574ms)
  ✔ should handle connector events (5549ms)
  ✔ should support multiple method calls (5552ms)
  ✔ should establish connection and respond to ping (5048ms)
  ✔ should handle worker and pilot pages simultaneously (6581ms)
✔ Handshake Connector Tests (28424ms)
ℹ tests 5
ℹ suites 1
ℹ pass 5
ℹ fail 0
```

## 🔧 Configuration

Les tests utilisent un navigateur en mode headless pour la rapidité :
- **User Agent** : Android Mobile WebView
- **Viewport** : 375x667 (mobile)
- **Sécurité** : Désactivée pour les tests
- **Sandbox** : Désactivé

## 🐛 Debugging

Pour débugger un test qui échoue :

1. **Activer le mode visible** :
   ```javascript
   browser = await chromium.launch({ 
     headless: false, // Voir le navigateur
     slowMo: 1000     // Ralentir les actions
   });
   ```

2. **Ajouter des logs de debug** :
   ```bash
   DEBUG=clisk:* yarn test
   ```

3. **Augmenter les timeouts** si nécessaire :
   ```javascript
   await new Promise(resolve => setTimeout(resolve, 5000));
   ```

## 📝 Conventions

- **Noms de tests** : Descriptifs en anglais commençant par "should"
- **Structure AAA** : Arrange, Act, Assert
- **Cleanup** : Chaque test nettoie ses ressources dans `afterEach`
- **Isolation** : Chaque test utilise sa propre instance de CliskPage
- **Timeouts** : Adaptés à la vitesse du handshake (2-5 secondes) 