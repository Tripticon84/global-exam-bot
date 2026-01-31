# GlobalExam Bot 🤖

Bot d'automatisation pour compléter les exercices sur GlobalExam (TOEIC).

## 📋 Fonctionnalités

- ✅ Connexion automatique à GlobalExam
- ✅ Navigation vers les plannings d'exercices
- ✅ Détection et filtrage des exercices à faire
- ✅ Support de plusieurs types d'exercices
  - **Question-Réponse**
  - **Conversation**
  - **Monologue**
  - **Phrases à trous**
  - **Textes à compléter**
  - **Textes simples**
  - **Textes multiples**
- ✅ Attente réaliste basée sur la durée de l'audio (Listening)
- ✅ Temps de réflexion aléatoire configurable
- ✅ Exécution par section (une section par lancement)
- ✅ Résumé de session à la fin

## 🚀 Installation

```bash
# Cloner le repository
git clone https://github.com/Tripticon84/global-exam-bot.git
cd global-exam-bot

# Installer les dépendances
npm install

# Installer les navigateurs Playwright
npx playwright install chromium
```

## ⚙️ Configuration

Créer un fichier `.env` à la racine du projet (voir `.env.example`) :

```env
# Identifiants GlobalExam
GLOBAL_EXAM_LOGIN=votre.email@example.com
GLOBAL_EXAM_PASSWORD=votre_mot_de_passe

# Attente entre chaque validation de questions
# true = attendre la durée de l'audio + temps aléatoire
# false = pas d'attente
WAIT_ENABLED=true

# Temps aléatoire supplémentaire (en millisecondes)
# Le temps d'attente sera: durée audio + random(WAIT_MIN_EXTRA, WAIT_MAX_EXTRA)
WAIT_MIN_EXTRA=2000
WAIT_MAX_EXTRA=8000

# Temps de base pour les exercices sans audio (en millisecondes)
WAIT_BASE_TIMER=15000
```

## 🎮 Utilisation

```bash
# Lancer le bot
npm start

# Ou en mode développement (avec rechargement automatique)
npm run dev
```

Le bot va :

1. Se connecter à GlobalExam
2. Récupérer la liste des exercices à faire
3. Compléter **une section** d'exercices
4. Afficher un résumé de la session

> ⚠️ **Note** : Le bot ne traite qu'une seule section par exécution. Relancez-le pour faire la section suivante.

## 📁 Structure du projet

```
global-exam-bot/
├── src/
│   ├── main.js                 # Point d'entrée principal
│   ├── gets/
│   │   └── get-all-exos.js     # Récupération des exercices
│   └── exercices/
│       ├── exercices-types.js  # Définition des types d'exercices
│       ├── conversation.js     # Handler Conversation/Monologue
│       ├── phrases-a-troue.js  # Handler Phrases à trous
│       └── textes-a-completer.js # Handler Textes à compléter
├── .env.example                # Exemple de configuration
├── package.json
└── README.md
```

## 🔧 Configuration avancée

### Sections ignorées

Dans `main.js`, certaines sections peuvent être ignorées :

```javascript
const SECTIONS_TO_SKIP = [
  "pm-55094",
  "pm-55095",
  "pm-55098",
  "pm-55101",
  "pm-55102",
];
```

## 📝 TODO

- [ ] Intégration IA pour sélectionner les bonnes réponses (actuellement aléatoire)
- [ ] Support des exercices Photographie (Listening Partie 1)
