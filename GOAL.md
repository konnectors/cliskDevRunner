Ceci est un projet qui va tourner avec nodejs, yarn et playwright.

Dans le dossier examples, il y a différents programmes que j'appelle connecteurs. Ce sont des fichiers js accompagnés de manifests.

Le but est de créer un projet avec la structure la plus simple possible (pas trop de fichiers et d'indirections) qui va lancer playwright et créer un onglet, naviguer sur about:blank et embarquer le code de ce connecteur dedans.

- étape suivante: le connecteur s'attend à se connecter via la librairie post-me (renseigne toi sur le net). Pour cela il s'attend à communiquer avec l'extérieur via window.ReactNativeWebView.postMessage. Il faut donc lui exposer cette fonction qui n'existe pas par défaut. De plus, si tu regardes la documentation post-me, il faut créer un messenger spécifique à playwright qui va être capable d'envoyer des messages au connecteur dans la page en injectant du javascript qui fait appel à window.postMessage.

Je veux aussi que tous les messages de console qui arrivent dans la page soient montrés dans la sortie standard du programme