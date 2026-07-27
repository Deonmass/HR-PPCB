# Application Web Gestion RH - PPC Barnet (Next.js)

Application Next.js de gestion des données RH avec menu latéral.

## Prérequis

- [Node.js LTS](https://nodejs.org/) (v20+)

## Installation et lancement

```bash
cd C:\Users\Gedeon.Massadi\hr-rh-app
npm install
npm run dev
```

Ouvrir : **http://localhost:3000**

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build production |
| `npm start` | Serveur production |

## Fonctionnalités

### Employés > Liste
- 176 employés importés depuis `Annual review employees.xlsx`
- Recherche, filtres, ajout/modification via modal
- Sauvegarde dans `data/employees.json`

### Employés > Check documents
Deux onglets :

1. **Statistiques** — KPIs globaux, cartes par département, inspection par critère (recalcul live)
2. **Grand tableau** — Matricule, nom, département + une colonne par document avec sélecteur **Y / N / NA** modifiable (sauvegarde automatique via API)

### Heures supplémentaires
- Import Excel, traitement selon politique PPCB, export rempli

## Structure

```
hr-rh-app/
├── app/                    # Pages Next.js (App Router)
├── components/             # Composants React
├── lib/                    # Logique métier
├── data/
│   ├── employees.json      # Données employés
│   └── dashboard.json      # Stats initiales Excel
└── package.json
```
