# Log Levels Configuration

Ce projet utilise le système de debug pour contrôler les niveaux de logs. Voici les différents niveaux disponibles :

## Niveaux de Logs

### 🔥 EXTREME
**Commande :** `npm run start:extreme` ou `DEBUG=clisk:* npm start`

Affiche **TOUS** les logs, y compris :
- Logs CLI et launcher
- Logs des pages (pilot et worker)
- Logs de communication post-me
- Logs de navigation
- Logs des messages
- Logs de console des pages

**Utilisation :** Débogage complet, voir absolument tout ce qui se passe

### 📊 FULL
**Commande :** `npm run start:full` ou `DEBUG=clisk:cli:*,clisk:launcher:*,clisk:pilot:*,clisk:worker:* npm start`

Affiche les logs principaux sans les détails des pages :
- ✅ Logs CLI et launcher
- ✅ Logs principaux des pages (pilot et worker)
- ❌ Pas de logs de communication détaillés
- ❌ Pas de logs de navigation
- ❌ Pas de logs de console des pages

**Utilisation :** Débogage général, voir le flux principal sans être submergé

### 📝 NORMAL
**Commande :** `npm run start:normal` ou `DEBUG=clisk:cli:*,clisk:launcher:* npm start`

Affiche seulement les logs essentiels :
- ✅ Logs CLI et launcher
- ❌ Pas de logs des pages
- ❌ Pas de logs de communication
- ❌ Pas de logs de navigation

**Utilisation :** Utilisation normale, logs minimaux pour suivre l'exécution

### 🔇 QUIET
**Commande :** `npm run start:quiet` ou `npm start`

Aucun log de debug :
- ❌ Aucun log de debug
- ✅ Seulement les erreurs console.error
- ✅ Seulement les messages console.log explicites

**Utilisation :** Production ou quand vous voulez un output minimal

## Utilisation Avancée

### Via Variable d'Environnement
```bash
# Définir le niveau via variable d'environnement
LOG_LEVEL=extreme npm start
LOG_LEVEL=full npm start
LOG_LEVEL=normal npm start
LOG_LEVEL=quiet npm start
```

### Via Paramètre de Ligne de Commande
```bash
# Le troisième paramètre définit le niveau de log
node src/index.js examples/evaluate-konnector extreme
node src/index.js examples/evaluate-konnector full
node src/index.js examples/evaluate-konnector normal
node src/index.js examples/evaluate-konnector quiet
```

### Via Variable DEBUG Directe
```bash
# Utiliser directement la variable DEBUG pour un contrôle fin
DEBUG=clisk:cli:*,clisk:launcher:* npm start
DEBUG=clisk:pilot:* npm start
DEBUG=clisk:worker:comm npm start
```

## Tests avec Différents Niveaux

Les mêmes niveaux sont disponibles pour les tests :

```bash
npm run test:extreme    # Tous les logs pendant les tests
npm run test:full       # Logs principaux pendant les tests
npm run test:normal     # Logs minimaux pendant les tests
npm run test            # Pas de logs de debug (quiet)
```

## Structure des Namespaces Debug

```
clisk:cli:main          # Logs du CLI principal
clisk:launcher:playwright # Logs du launcher Playwright
clisk:pilot:main        # Logs principaux de la page pilot
clisk:pilot:page        # Logs de console de la page pilot
clisk:pilot:message     # Logs de messages de la page pilot
clisk:pilot:comm        # Logs de communication de la page pilot
clisk:pilot:nav         # Logs de navigation de la page pilot
clisk:worker:main       # Logs principaux de la page worker
clisk:worker:page       # Logs de console de la page worker
clisk:worker:message    # Logs de messages de la page worker
clisk:worker:comm       # Logs de communication de la page worker
clisk:worker:nav        # Logs de navigation de la page worker
```

## Recommandations d'Usage

- **Développement initial :** `extreme` pour voir tout
- **Débogage de problèmes :** `full` pour voir le flux principal
- **Utilisation quotidienne :** `normal` pour un suivi basique
- **Production/démonstration :** `quiet` pour un output propre 