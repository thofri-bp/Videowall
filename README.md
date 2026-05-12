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
- Optional beim ersten Start per Umgebungsvariable setzen: `ADMIN_PASSWORD=mein-passwort npm start`
- Das Passwort wird danach persistent in `data/state/admin.json` gespeichert
- Das Passwort kann später direkt in der Admin-Weboberfläche geändert werden
- Ein spaeteres Ueberschreiben per Umgebungsvariable passiert nur mit `ADMIN_PASSWORD_FORCE_UPDATE=1`

## Funktionen

- Bilder, Videos und PDFs hochladen
- PDFs werden beim Upload automatisch in Bildseiten umgewandelt
- Reihenfolge per Drag & Drop aendern
- Sichtbarkeit ein-/ausschalten
- Rotation, Position, Anzeigeart und Skalierung pro Bild/Video setzen
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
  -p 80:3000 \
  -e ADMIN_PASSWORD=mein-passwort \
  -v videowall_data:/app/data \
  videowall
```

Passwort spaeter bewusst aendern:

```bash
docker run -d \
  --name videowall \
  -p 80:3000 \
  -e ADMIN_PASSWORD=neues-passwort \
  -e ADMIN_PASSWORD_FORCE_UPDATE=1 \
  -v videowall_data:/app/data \
  videowall
```

Danach erreichbar unter:

- Admin: `http://localhost/admin`
- Display: `http://localhost/display`

Fuer Zugriff aus dem Netzwerk:

- Admin: `http://DEINE-IP/admin`
- Display: `http://DEINE-IP/display`

## Docker Compose

Voraussetzung fuer den Server:

- Empfohlen ist Docker Compose v2 (`docker compose`)
- Das alte `docker-compose` v1 kann auf Systemen mit Python 3.12 mit `No module named 'distutils'` scheitern

Mit Docker Compose ist der Start noch einfacher:

```bash
ADMIN_PASSWORD=mein-passwort docker compose up -d --build
```

Oder mit dem Deploy-Skript:

```bash
chmod +x deploy.sh
ADMIN_PASSWORD=mein-passwort ./deploy.sh
```

Sauber stoppen:

```bash
chmod +x stop.sh
./stop.sh
```

Passwort spaeter bewusst aendern:

```bash
ADMIN_PASSWORD=neues-passwort ADMIN_PASSWORD_FORCE_UPDATE=1 ./deploy.sh
```

Stoppen:

```bash
docker compose down
```

Danach erreichbar unter:

- Admin: `http://localhost/admin`
- Display: `http://localhost/display`

Standardmaessig wird Host-Port `80` auf Container-Port `3000` gemappt.
Optional kannst du den Host-Port ueberschreiben, z. B. mit `HOST_PORT=8080`.

Die Daten bleiben in einem Docker-Volume `videowall_data` persistent erhalten.
Das ist robuster bei Updates, Rebuilds und Container-Neustarts.

Falls du noch Daten im alten lokalen Ordner `./data` hast, migriert `./deploy.sh` sie beim ersten Deploy automatisch in das Volume, sofern das Volume noch leer ist.
Falls bereits ein passendes Daten-Volume aus einer aelteren Version existiert, verwendet `./deploy.sh` dieses automatisch weiter.
