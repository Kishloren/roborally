# RoboRally - Notes de reprise

Date de derniere mise a jour : 2026-05-20

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
- `/backoffice/` : editeur de maps PC sans authentification ;
- `/api/game/state` : etat public de la partie ;
- `/api/game/new` : recharge une nouvelle partie depuis une map ;
- `/api/game/qr` : QR code vers l'interface joueur.
- `/api/maps` : liste et creation des maps ;
- `/api/maps/:mapId` : lecture et sauvegarde d'une map JSON.

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

## Regles validees

Objectif :

- le jeu est une course sur une carte ;
- tous les robots partent de la meme case de depart ;
- une carte contient une seule case depart ;
- les robots doivent valider les checkpoints/etapes dans l'ordre ;
- le premier robot qui valide la derniere etape gagne.

Etat initial des robots :

- chaque robot commence avec `3` vies ;
- chaque robot commence avec `9` points de vie, donc `0` degat ;
- chaque robot dispose d'un laser frontal ;
- au depart, les robots sont holographiques pour permettre a plusieurs robots d'occuper la meme case.

Hologrammes :

- un robot holographique subit les effets du plateau ;
- un robot holographique n'interagit pas avec les autres robots : pas de tir recu, pas de poussee, pas de blocage physique ;
- un robot holographique peut valider un checkpoint ;
- un robot holographique peut reparer sur une case Repair ;
- a la fin d'un tour, un robot holographique seul sur sa case devient physique.

Tours et segments :

- un tour contient `5` segments ;
- au debut d'un tour, chaque joueur recoit `9 - degats` cartes ;
- le joueur programme `5` registres avec les cartes disponibles et les registres non bloques ;
- pour chaque segment :
  - les robots executent leur carte de programmation par priorite decroissante ;
  - les elements du plateau agissent ;
  - les lasers tirent.

Degats, registres et reparations :

- un robot a `9` points de vie ;
- il est detruit quand il atteint `10` degats ;
- a `9` degats, il n'est pas detruit mais ne recoit aucune carte ;
- au-dessus de `4` degats, les derniers registres sont bloques ;
- formule actuelle : `blockedRegisters = max(0, degats - 4)`, bloques depuis le registre 5 vers le registre 1 ;
- exemple : `6` degats donne `3` cartes et bloque les registres 4 et 5 ;
- un registre bloque conserve sa carte precedente ;
- en fin de tour, un robot sur Repair 1 repare `1` degat ;
- en fin de tour, un robot sur Repair 2 repare `2` degats.

Destruction et respawn :

- un robot detruit perd `1` vie ;
- s'il n'a plus de vie, il est elimine definitivement ;
- sinon il respawn au depart ou au dernier checkpoint valide ;
- il respawn sous forme holographique ;
- il respawn avec `2` degats.

Deplacements, murs, trous :

- un robot ne traverse pas les murs ;
- lors d'un deplacement, un robot physique pousse les robots physiques devant lui ;
- si la chaine de poussee est bloquee, le deplacement initial est annule ;
- un robot holographique n'est pas pousse et ne bloque pas ;
- un robot qui arrive sur un trou ou passe au-dessus d'un trou est immediatement detruit.

Lasers :

- chaque robot physique tire un laser frontal pendant la phase lasers ;
- un laser ne traverse pas les murs ;
- un laser s'arrete au premier robot physique touche ;
- un laser qui touche un robot inflige `1` degat ;
- un robot holographique n'est pas touche par les lasers.

Elements de plateau pris en compte dans le premier moteur :

- convoyeurs ;
- murs ;
- trous.

Les autres elements du plateau seront integres plus tard.

Convoyeurs :

- apres les deplacements intrinseques des robots, les convoyeurs rapides agissent une premiere fois seuls ;
- ensuite les convoyeurs rapides et normaux agissent ensemble dans une deuxieme vague ;
- les convoyeurs d'une meme vague sont simultanes ;
- si deux robots deplaces par la meme vague de convoyeurs veulent arriver sur la meme case, les deux deplacements sont annules ;
- si un robot deplace par convoyeur arrive sur une case occupee par un robot statique, il pousse ce robot selon les regles normales de poussee ;
- si cette poussee est bloquee, le deplacement par convoyeur est bloque ;
- un convoyeur rectiligne transporte vers sa sortie ;
- un virage atteint par une carte ou une poussee transporte vers sa sortie sans rotation du robot ;
- si un convoyeur deplace un robot sur une case de virage, la rotation du virage est appliquee sur cette case, sans nouvelle translation ;
- visuellement, une translation par convoyeur suivie d'une rotation sur la case d'arrivee est animee simultanement en `1` seconde ;
- un convoyeur `2 entrees` se comporte comme un rectiligne quand un robot y entre par carte ou poussee ;
- quand un robot entre sur un `2 entrees` par convoyeur via la deuxieme entree du sigle, la rotation d'entree est appliquee pendant la translation ;
- sinon, pas de rotation sur le `2 entrees`.

Display et interface joueur :

- le display commence par afficher la liste des plateaux disponibles ;
- apres choix du plateau, le display affiche un QR code ;
- les joueurs scannent le QR code, choisissent leur robot et saisissent leur pseudo ;
- le display affiche une colonne avec robot, pseudo, progression checkpoints et points de vie ;
- les interfaces joueurs repliquent le plateau ;
- les robots clignotent lentement par alpha avec une periode de `2` secondes ;
- un robot holographique apparait ethere, en greyscale, avec un outline vif dans la couleur principale du robot ;
- si plusieurs robots sont sur la meme case, ils apparaissent a tour de role ;
- un joueur peut alterner entre la vue globale de tous les robots et la vue limitee a son propre robot ;
- le plateau joueur est scrollable et zoomable.

## Interface joueur

La page joueur est dans :

- `public/player/index.html`
- `public/player/styles.css`
- `public/player/main.js`

Etat actuel :

- le champ de saisie du nom joueur a ete supprime pour faciliter le debug ;
- le bouton `Rejoindre` utilise le nom par defaut `Player` ;
- l'interface joueur est une scene Phaser unique en plein ecran reel, avec `Phaser.Scale.NONE` et une resolution logique elevee ;
- le rendu joueur vise au minimum du Full HD logique (`1920x1080`) sur mobile quand le device le permet ;
- le plateau occupe `2/3` de la largeur et le volet droit `1/3` ;
- le plateau est deplacable et zoomable via Phaser ;
- la carte s'affiche des le chargement de l'etat serveur, meme sans joueur connecte ;
- les cartes du volet droit sont rendues dans Phaser et restent manipulables par glisser-deplacer apres connexion ;
- les registres affichent un point vert/rouge pour indiquer libre/bloque ;
- les registres bloques refusent le drop.
- le bouton de calibration et l'overlay de debug rouge ont ete retires de l'interface normale.

Layout Phaser :

- largeur et hauteur CSS : viewport stable detecte (`screen`, `outer`, `inner`, document ou `visualViewport`) ;
- largeur et hauteur Phaser : viewport CSS multiplie par le facteur de resolution logique ;
- plateau : `2/3` de la largeur ;
- volet joueur : `1/3` de la largeur ;
- le layout est recalcule a chaque resize.

Drag/drop des cartes :

- les cartes sont des `Container` Phaser contenant le sprite de carte et le texte de priorite ;
- la surface interactive/draggable est le sprite `Image`, pas le `Container` ;
- les evenements de drag deplacent le `Container` parent afin que l'image et la priorite restent synchronisees ;
- les coordonnees de drop utilisent le centre du `Container` de carte, avec fallback sur la position du pointeur.

## Spritesheets disponibles

Emplacement :

`public/shared/assets/images/`

Fichiers presents :

- `cartes.png` : spritesheet des cartes, 7 images de `310x460` ;
- `sols.png` : sols, frames de `66x66` ;
- `conv.png` : convoyeurs, frames de `66x66` ;
- `shared/data/conveyors.json` : table explicite des correspondances de virages convoyeurs ;
- `pits.png` : trous, frames de `66x66` ;
- `walls.png`
- `lasers.png`
- `gears.png`
- `zones.png`
- `pushers.png`
- `crush.png`

## Backoffice / editeur de maps

La page backoffice est dans :

- `public/editor/index.html`
- `public/editor/styles.css`
- `public/editor/main.js`

Adresse locale :

`http://localhost:6282/backoffice/`

Adresse de production prevue derriere nginx :

`https://www.stansgames.fr/roborally/backoffice/`

Etat actuel :

- pas d'authentification ;
- interface PC avec liste de maps, barre de nom/dimensions, canvas Phaser et palette compacte d'icones ;
- les icones de la palette et de la pile de case sont extraites des spritesheets existantes ;
- creation d'une nouvelle map en `12x12`, nommee "Nouvelle carte", avec toutes les cases en sol standard par defaut ;
- la taille de map est editable entre `1x1` et `64x64` ;
- les maps sont stockees en JSON dans `data/maps` ;
- seules les cases modifiees sont presentes dans `tiles`, les autres restent du sol standard implicite ;
- sauvegarde automatique apres chaque changement de nom, dimensions ou contenu ;
- palette utilisable par glisser/deposer depuis la palette vers la grille ;
- le clic sur la grille selectionne une case active ;
- le panneau droit affiche la pile des elements presents sur la case active ;
- chaque element de la pile peut etre selectionne individuellement ;
- `R` tourne l'element selectionne de la case active si applicable ;
- `F` inverse l'element selectionne de la case active si applicable ;
- `Suppr` ou `Retour arriere` efface l'element selectionne, ou la case si aucun element n'est selectionne ;
- boutons et raccourcis `Ctrl+C`, `Ctrl+X`, `Ctrl+V` pour copier/couper/coller l'element selectionne avec sa configuration courante ;
- le plateau est volontairement rendu plus petit que la zone disponible pour eviter les debordements sur ecrans PC modestes.

Panneau de test backoffice :

- situe en bas de la colonne droite ;
- le segment courant est choisi dans la colonne gauche avec 5 boutons radio alignes ;
- sous le segment courant, la colonne gauche affiche une grille `2x4` avec un exemplaire des cartes d'ordres depuis `cartes.png` ;
- test n° 1 : cliquer une carte d'ordre applique immediatement son effet au robot pose/selectionne ;
- pour ce premier test, les cartes gerent uniquement rotation et deplacement sur plateau vierge, avec arret au bord de map ;
- chaque effet de carte anime le robot pendant `1000ms` avec easing `Cubic.easeInOut`, par translation et/ou rotation ;
- les animations de deplacement ne creent pas de tween de rotation quand l'orientation du robot ne change pas, pour eviter les tours parasites notamment en direction ouest ;
- les tweens de rotation calculent leur cible depuis la rotation reellement stockee par le sprite Phaser, afin d'eviter le passage `pi/-pi` qui provoquait un `3/4` de tour depuis l'ouest ;
- test convoyeurs lents : apres une carte d'ordre, si le robot est sur un convoyeur normal, le backoffice applique un transport d'une case en second effet anime `1000ms` ;
- les convoyeurs lents droits et a deux entrees transportent vers `conveyor.direction` ; les virages transportent vers la sortie et tournent le robot d'un quart de tour ;
- regle source des virages : la rotation du robot sur un virage n'est appliquee que si la source du mouvement est `conveyor` ; pour les futurs mouvements `card` ou `push`, le virage applique seulement la translation vers sa sortie ;
- les mouvements par carte amènent le robot sur la case, puis le convoyeur de cette case agit comme phase separee avec la source `card` : un virage applique sa translation de sortie sans rotation du robot ;
- si un convoyeur deplace le robot sur une case de virage, la rotation du virage est appliquee sur cette case comme une phase separee, sans nouvelle translation ;
- visuellement, quand une phase convoyeur implique translation puis rotation sur un virage, la translation et la rotation sont animees simultanement en une seule seconde ;
- convoyeurs `2 entrees` : un robot qui y entre par carte ou poussee suit simplement la sortie finale ; quand il y entre par convoyeur par la deuxieme entree du sigle, il subit une rotation d'entree pendant la translation.
- ordre des convoyeurs par registre : apres les deplacements intrinseques, les convoyeurs rapides agissent seuls une premiere fois, puis les convoyeurs rapides et normaux agissent ensemble dans une seconde vague.
- convention de rotation logique : `+1` = droite/horaire, `-1` = gauche/antihoraire ; les virages `turn: "right"` utilisent donc `+1`.
- le backoffice force l'utilisation de la map JSON `test`, nommee `test`, en `12x12` vide ;
- le bouton de creation de carte sert a reinitialiser cette map `test` ;
- les elements poses sur la map `test` restent visibles et actifs pendant les tests ;
- affiche les 8 frames de `robots.png` comme elements drag/droppables ;
- glisser un robot sur la grille le pose ou le deplace ;
- le drag robot conserve l'element DOM pendant `dragstart` et declare aussi un fallback `text/plain` `robot:n` pour fiabiliser le drop ;
- le clic sur un robot deja pose le selectionne via une zone Phaser interactive sur la case du robot ;
- sur une case contenant un element de plateau, `R/F/Suppr` ciblent d'abord la couche selectionnee dans la pile avant le robot ;
- `R` tourne le robot selectionne ;
- prochaine etape : reappliquer les cartes de programmation au robot selectionne sur ce socle plus simple.
- la map `test` affiche de nouveau un catalogue de convoyeurs ; les libelles rouges sont derives du JSON par `conveyorDebugLabel`, afin d'eviter les divergences entre etiquette manuelle et modele.
- les virages ne sont plus calcules implicitement cote sprite : `conveyors.json` fige `label`, `from`, `to`, `turn`, `spriteRotation` et `spriteFlipX`.

Elements actuellement posables :

- effacer ;
- trou ;
- convoyeur normal droit ;
- convoyeur normal virage ;
- convoyeur normal a deux entrees ;
- convoyeur rapide droit ;
- convoyeur rapide virage ;
- rotator horaire / antihoraire ;
- murs par cote de case ;
- repair 1 / repair 2 ;
- points de depart ;
- checkpoints ;
- emetteur laser simple ;
- rayon laser ;
- pousseur ;
- ecraseur.

Ecraseur / crusher :

- spritesheet : `crush.png` ;
- version plain : frame `21` ;
- version a placer sur convoyeur rectiligne : frame `28` ;
- la frame `28` est orientee `west -> east` dans sa configuration source ;
- JSON plain : `crusher: { "variant": "plain", "activeRegisters": [2, 4] }` ;
- JSON sur convoyeur : `crusher: { "variant": "conveyor", "direction": "east", "activeRegisters": [2, 4] }` ;
- la rotation `R` modifie la direction de la version sur convoyeur ;
- le flip `F` inverse la direction de la version sur convoyeur.
- les crushers portent au maximum deux segments d'activation dans `activeRegisters` ;
- les touches `1` a `5`, quand la couche crusher est selectionnee, activent/desactivent les segments en gardant les deux derniers choix ;
- si une couche crusher est deselectionnee sans aucun segment actif, le backoffice force `activeRegisters` a `[1]` ;
- icones de segment en haut : frames `23` a `27` pour les segments `1` a `5` ;
- icones de segment en bas : frames `30` a `34` pour les segments `1` a `5` ;
- exemple `2-4` : frame `24` en haut et frame `33` en bas ;
- ces icones tournent avec le crusher mais ne sont pas flippees.

Convoyeur a deux entrees :

- spritesheet : `conv.png` ;
- frame normale : `2` ;
- frame rapide : `10` ;
- convention de base : entrees `west` et `south`, sortie `east` ;
- JSON : `conveyor: { "type": "normal", "shape": "merge", "inputs": ["west", "south"], "direction": "east" }` ;
- version rapide : meme structure avec `"type": "fast"` ;
- dans le deplacement `west -> east`, il se comportera comme un convoyeur droit ;
- dans le deplacement `south -> east`, il se comportera comme un virage droit ;
- l'element possede 8 configurations : 4 rotations et 2 flips ;
- la rotation `R` fait tourner ensemble les entrees et la sortie ;
- le flip `F` conserve la sortie et inverse l'entree laterale.

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

Les cartes joueur sont maintenant rendues dans Phaser avec la spritesheet `cartes.png`.

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

Convention de nommage de discussion pour la suite :

- premiere lettre : type de forme, `R` pour rectiligne, `V` pour virage, `3` pour convoyeur a trois entrees ;
- deuxieme lettre : vitesse, `S` pour simple/lent, `R` pour rapide ;
- suffixe directionnel : directions cardinales abregees `N`, `E`, `S`, `W` ;
- convoyeur rectiligne simple oriente nord : `RSN` ;
- convoyeur rapide virage est vers nord : `VREN` ;
- convoyeur trois entrees est+sud vers nord : `3ESN`.

Mapping des segments droits :

- `west` : rotation `0` ;
- `north` : rotation `90 degres` ;
- `east` : rotation `180 degres` ;
- `south` : rotation `-90 degres`.

Mapping valide pour les virages horaires autour du premier trou :

- `east -> north` : frame `1`, rotation `0 degre` ;
- `north -> west` : frame `1`, rotation `90 degres` sens trigo ;
- `west -> south` : frame `1`, rotation `180 degres` ;
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
