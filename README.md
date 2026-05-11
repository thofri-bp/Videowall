# VideoWall

Kleiner lokaler Webserver mit Admin-Interface und Fullscreen-Display fuer Bilder und Videos.

## Start

1. `npm install`
2. `npm start`
3. Admin: `http://localhost:3000/admin`
4. Display: `http://localhost:3000/display`

Fuer Zugriff aus dem lokalen Netzwerk den Host explizit setzen:

`HOST=0.0.0.0 npm start`

## Standardzugang

- Passwort: `videowall-admin`
- Optional per Umgebungsvariable setzen: `ADMIN_PASSWORD=mein-passwort npm start`

## Funktionen

- Bilder und Videos hochladen
- Reihenfolge per Drag & Drop aendern
- Sichtbarkeit ein-/ausschalten
- Rotation pro Medium setzen
- Hintergrund, Bilddauer, Uebergaenge und Synchronmodus verwalten
- Speicherung in `data/uploads` und `data/state`

## Docker

Docker-Images sollten in der Praxis klein geschrieben benannt werden. Fuer dieses Projekt daher:

- Image-Name: `videowall`

Build fuer x64 / `linux/amd64`:

```bash
docker buildx build --platform linux/amd64 -t videowall .
```

Container starten:

```bash
docker run -d \
  --name videowall \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=mein-passwort \
  -v "$(pwd)/data:/app/data" \
  videowall
```

Danach erreichbar unter:

- Admin: `http://localhost:3000/admin`
- Display: `http://localhost:3000/display`

Fuer Zugriff aus dem Netzwerk:

- Admin: `http://DEINE-IP:3000/admin`
- Display: `http://DEINE-IP:3000/display`

## Docker Compose

Mit Docker Compose ist der Start noch einfacher:

```bash
ADMIN_PASSWORD=mein-passwort docker compose up -d --build
```

Oder mit dem Deploy-Skript:

```bash
chmod +x deploy.sh
ADMIN_PASSWORD=mein-passwort ./deploy.sh
```

Stoppen:

```bash
docker compose down
```

Danach erreichbar unter:

- Admin: `http://localhost:3000/admin`
- Display: `http://localhost:3000/display`

Die Daten bleiben ueber `./data:/app/data` persistent erhalten.
