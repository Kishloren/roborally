# RoboRally - Notes de reprise

Date de derniere mise a jour : 2026-05-17

## Objectif du projet

Adaptation numerique de RoboRally avec :

- un ecran commun pour tous les joueurs ;
- une interface smartphone par joueur, forcee en paysage autant que possible ;
- serveur Node.js local pour commencer, port `6282` ;
- stockage des donnees en fichiers JSON ;
- rendu principal avec Phaser ;
- utilisation privilegiee de sprites/spritesheets pour tous les elements visuels.

## Architecture actuelle

Routes principales :

- `/display/` : ecran commun Phaser ;
- `/player/` : interface joueur smartphone ;
- `/editor/` : emplacement reserve pour l'editeur de maps ;
- `/api/game/state` : etat public de la partie ;
- `/api/game/new` : recharge une nouvelle partie depuis une map ;
- `/api/game/qr` : QR code vers l'interface joueur.

Serveur :

- fichier principal : `server/index.js` ;
- port par defaut : `6282` ;
- Express + Socket.IO ;
- QR code via `qrcode` ;
- Phaser servi localement depuis `node_modules`.

Stockage :

- maps : `data/maps/*.json` ;
- sauvegardes : `data/saves/*.json` ;
- derniere sauvegarde : `data/saves/latest.json`.

## Deck de programmation

Le deck contient 84 cartes :

- 18 `Move 1`, priorites 490 a 660 ;
- 12 `Move 2`, priorites 670 a 780 ;
- 6 `Move 3`, priorites 790 a 840 ;
- 6 `Back Up`, priorites 430 a 480 ;
- 18 `Rotate Right`, priorites paires 80 a 420 ;
- 18 `Rotate Left`, priorites impaires 70 a 410 ;
- 6 `U-Turn`, priorites 10 a 60.

Definition : `src/game/cards.js`.

## Interface joueur

La page joueur est dans :

- `public/player/index.html`
- `public/player/styles.css`
- `public/player/main.js`

Etat actuel :

- le champ de saisie du nom joueur a ete supprime pour faciliter le debug ;
- le bouton `Rejoindre` utilise le nom par defaut `Player` ;
- la carte s'affiche des le chargement de l'etat serveur, meme sans joueur connecte ;
- les cartes restent manipulables par glisser-deplacer apres connexion ;
- les registres affichent un point vert/rouge pour indiquer libre/bloque ;
- les registres bloques refusent le drop.

Dimensions separees :

- `--board-tile-size` pour le plateau joueur ;
- `--card-width` pour les cartes.

## Spritesheets disponibles

Emplacement :

`public/shared/assets/images/`

Fichiers presents :

- `cartes.png` : spritesheet des cartes, 7 images de `310x460` ;
- `sols.png` : sols, frames de `66x66` ;
- `conv.png` : convoyeurs, frames de `66x66` ;
- `pits.png` : trous, frames de `66x66` ;
- `walls.png`
- `lasers.png`
- `gears.png`
- `zones.png`
- `pushers.png`
- `crush.png`

## Cartes joueur

`cartes.png` contient 7 images de `310x460`, dans cet ordre :

1. `move3`
2. `move2`
3. `move1`
4. `left`
5. `right`
6. `backup`
7. `uturn`

La priorite est ajoutee en blanc dans l'entete, zone source :

- coin haut-gauche : `(25, 15)` ;
- coin bas-droit : `(285, 80)`.

Le rendu actuel des cartes est encore DOM/CSS, avec la spritesheet en `background-image`.
Le plateau joueur, lui, est rendu avec Phaser.

## Sols

`sols.png` est charge comme spritesheet Phaser `66x66`.

Frames utilisees indifferemment :

- `0`
- `6`
- `13`
- `14`
- `15`
- `16`

Chaque tuile choisit une frame pseudo-aleatoire stable d'apres ses coordonnees, avec rotation stable par increments de 90 degres.

## Trous

`pits.png` est charge comme spritesheet Phaser `66x66`.

Mapping connu :

- trou `1x1` : frame `11` ;
- trou `1x2` : frames `3`, `10` ;
- trou `2x1` : frames `17`, `18`.

Pour l'instant, `floor: "pit"` utilise le trou `1x1`, frame `11`.

## Convoyeurs

`conv.png` est charge comme spritesheet Phaser `66x66`.

Reglage valide et verrouille pour le debug actuel :

- segment droit normal : frame `0`, orientee ouest par defaut ;
- virage normal : frame `1` uniquement.

Les segments droits utilisent `conveyor.direction`.

Mapping des segments droits :

- `west` : rotation `0` ;
- `north` : rotation `90 degres` ;
- `east` : rotation `180 degres` ;
- `south` : rotation `-90 degres`.

Mapping valide pour les virages horaires autour du premier trou :

- `east -> north` : frame `1`, rotation `180 degres` ;
- `north -> west` : frame `1`, rotation `90 degres` sens trigo ;
- `west -> south` : frame `1`, rotation `0 degre` ;
- `south -> east` : frame `1`, rotation `270 degres` sens trigo.

Important : ne pas reutiliser les autres frames de virage de `conv.png` tant que leur convention n'a pas ete explicitement validee.

## Map de debug actuelle

Map : `data/maps/factory-01.json`

Etat volontairement simplifie :

- plateau `12x12` ;
- un seul trou en `(4,4)` ;
- un seul circuit horaire autour de ce trou ;
- les quatre segments rectilignes ont ete valides ;
- les quatre coins utilisent la frame `1` selon le mapping valide ci-dessus.

Circuit autour du trou :

- `(3,3)` : virage ;
- `(4,3)` : segment droit ;
- `(5,3)` : virage ;
- `(3,4)` : segment droit ;
- `(4,4)` : trou ;
- `(5,4)` : segment droit ;
- `(3,5)` : virage ;
- `(4,5)` : segment droit ;
- `(5,5)` : virage.

Pour recharger la map de debug :

```powershell
Invoke-RestMethod http://localhost:6282/api/game/new -Method Post -ContentType 'application/json' -Body '{"mapId":"factory-01"}'
```

Puis rafraichir :

`http://localhost:6282/player/`

## Sauvegarde

La sauvegarde JSON est automatique sur les changements importants :

- creation/rechargement de partie ;
- connexion joueur ;
- ready joueur ;
- soumission du programme.

La reprise actuelle charge `data/saves/latest.json` si present.

## Commandes utiles

Installer les dependances :

```powershell
npm install
```

Lancer le serveur :

```powershell
npm start
```

Verifier la syntaxe du client joueur :

```powershell
node --check public/player/main.js
```

Verifier l'API :

```powershell
Invoke-WebRequest http://localhost:6282/api/game/state -UseBasicParsing
```

## Deploiement nginx sous /roborally

Le projet supporte le prefixe public via la variable d'environnement :

```powershell
BASE_PATH=/roborally
```

Sur Ubuntu, lancer le serveur avec :

```bash
cd /home/ubuntu/roborally
npm install
BASE_PATH=/roborally PORT=6282 npm start
```

URLs cible :

- display : `https://www.stansgames.fr/roborally/display/`
- player : `https://www.stansgames.fr/roborally/player/`
- backoffice : `https://www.stansgames.fr/roborally/backoffice/`

L'extrait nginx est dans :

`deploy/nginx-roborally.conf`

Le monitoring Stan's Games doit aussi connaitre le service. Voir :

`deploy/monitoring-roborally.md`

Le fichier PM2 du projet est :

`ecosystem.config.cjs`

## Points a faire ensuite

- Continuer la validation des convoyeurs, d'abord les virages antihoraires ;
- basculer progressivement les cartes joueur vers un rendu Phaser complet si souhaite ;
- utiliser les spritesheets restantes : murs, lasers, gears, zones, pushers, crush ;
- enrichir le modele JSON des maps pour decrire proprement les grands trous, convoyeurs, murs, lasers, pousseurs, ecraseurs ;
- implementer la resolution serveur des cartes programmees ;
- ajouter l'editeur de maps.
