# Monitoring Stan's Games - ajout RoboRally

Ces changements sont a appliquer sur le serveur Ubuntu, dans les fichiers qui gerent le monitoring.

## monitor.html

Dans le tableau `SERVICES`, ajouter l'entree suivante :

```js
{
  name: 'RoboRally',
  script: '/home/ubuntu/roborally/server/index.js',
  pm2name: 'roborally',
  ecosystem: '/home/ubuntu/roborally/ecosystem.config.cjs'
},
```

Par exemple juste apres `Slideshow` :

```js
  { name: 'Slideshow', script: '/home/ubuntu/slideshow/server/index.js', pm2name: 'slideshow', ecosystem: '/home/ubuntu/slideshow/ecosystem.config.js' },
  { name: 'RoboRally', script: '/home/ubuntu/roborally/server/index.js', pm2name: 'roborally', ecosystem: '/home/ubuntu/roborally/ecosystem.config.cjs' },
];
```

## monitoring-api.js

Dans `ALLOWED_SCRIPTS`, ajouter :

```js
  '/home/ubuntu/roborally/server/index.js',
  '/home/ubuntu/roborally/ecosystem.config.cjs',
```

Ce qui donne, en fin de liste :

```js
  '/home/ubuntu/slideshow/server/index.js',
  '/home/ubuntu/slideshow/ecosystem.config.js',
  '/home/ubuntu/roborally/server/index.js',
  '/home/ubuntu/roborally/ecosystem.config.cjs',
];
```

## Fichier PM2 RoboRally

Le fichier `ecosystem.config.cjs` doit etre present dans :

`/home/ubuntu/roborally/ecosystem.config.cjs`

Il lance :

- nom PM2 : `roborally`
- script : `server/index.js`
- port : `6282`
- prefixe public : `/roborally`

## Commandes utiles

Apres copie des fichiers :

```bash
cd /home/ubuntu/roborally
npm install
pm2 start ecosystem.config.cjs
pm2 save
```

Apres modification de `monitoring-api.js` :

```bash
pm2 restart monitoring-api
```

Apres modification nginx :

```bash
sudo nginx -t
sudo systemctl reload nginx
```
