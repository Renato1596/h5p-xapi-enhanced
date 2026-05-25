# H5P xAPI Enhanced Tracker

Plugin WordPress che aggiunge tracciamento xAPI **dettagliato** agli activity type H5P più avanzati.

---

## Il problema (e perché questo plugin esiste)

H5P invia statement xAPI nativamente, ma in modo molto limitato:

| Content Type      | xAPI nativo | Cosa manca                                          |
|-------------------|:-----------:|-----------------------------------------------------|
| Interactive Video | ✅ parziale  | play, pause, seek, milestone 25/50/75%              |
| Game Map          | ✅ parziale  | navigazione tra nodi/livelli                        |
| Virtual Tour      | ✅ parziale  | navigazione tra scene, clic su hotspot              |

Il tracciamento nativo si limita a `attempted`, `answered` (per le domande embedded), `completed`.  
**Tutto il comportamento di navigazione e fruizione viene perso.**

---

## Architettura — perché lo script va dentro l'iframe

H5P in WordPress gira **dentro un `<iframe>`**.

```
Pagina WordPress
└── <iframe> ← H5P gira qui
    ├── H5P.js
    ├── H5P.InteractiveVideo.js
    └── [il nostro tracker.js]  ← va iniettato QUI
```

Il `H5P.externalDispatcher` (il bus degli eventi xAPI) esiste **solo nel contesto dell'iframe**.  
Non puoi intercettarlo dal JavaScript della pagina WordPress esterna: è cross-origin JavaScript, vietato dal browser.

**La soluzione**: usare il filtro PHP `h5p_alter_library_scripts` che aggiunge script al bundle H5P **dentro l'iframe**. Da lì hai accesso diretto a tutto il runtime H5P.

---

## Installazione

### 1. Carica il plugin

Copia la cartella `h5p-xapi-enhanced/` in:
```
wp-content/plugins/h5p-xapi-enhanced/
```

### 2. Configura le credenziali LRS

In `wp-config.php` (o direttamente nel file `.php` del plugin):

```php
define( 'H5PXAPI_LRS_ENDPOINT', 'https://cartesiani--noisy.lrs.io/xapi' );
define( 'H5PXAPI_LRS_USERNAME', 'tuo-username' );
define( 'H5PXAPI_LRS_PASSWORD', 'tua-password' );
```

### 3. Attiva il plugin

Dashboard WordPress → Plugin → Attiva "H5P xAPI Enhanced Tracker"

### 4. Verifica

Apri un contenuto H5P (es. un Interactive Video) e apri la **console del browser**.  
Con `debug: true` nel config vedrai tutti gli statement in console.

Per attivare il debug temporaneamente, aggiungi in `wp-config.php`:
```php
define( 'WP_DEBUG', true );
```

---

## Statement generati

### Interactive Video (`H5P.InteractiveVideo`)

Conformi al **[Video xAPI Profile](https://w3id.org/xapi/video)**:

| Evento           | Verb IRI                                           | Dati aggiuntivi                                    |
|------------------|----------------------------------------------------|----------------------------------------------------|
| Video avviato    | `https://w3id.org/xapi/video/verbs/played`         | `time` (posizione in secondi)                      |
| Video in pausa   | `https://w3id.org/xapi/video/verbs/paused`         | `time`, `progress`, `played-segments`              |
| Seek             | `https://w3id.org/xapi/video/verbs/seeked`         | `time-from`, `time-to`                             |
| Milestone 25%    | `http://adlnet.gov/expapi/verbs/progressed`        | `progress: 0.25`, `time`                           |
| Milestone 50%    | `http://adlnet.gov/expapi/verbs/progressed`        | `progress: 0.50`, `time`                           |
| Milestone 75%    | `http://adlnet.gov/expapi/verbs/progressed`        | `progress: 0.75`, `time`                           |

Plus tutto il tracciamento nativo (domande, completed, ecc.) via pass-through.

### Game Map (`H5P.GameMap`)

| Evento           | Verb IRI                                              | Dati aggiuntivi                         |
|------------------|-------------------------------------------------------|-----------------------------------------|
| Entrata in nodo  | `https://w3id.org/xapi/adl/verbs/navigated-in`        | ID nodo, nome, parent = mappa           |

### Virtual Tour (`H5P.ThreeImage`)

| Evento           | Verb IRI                                              | Dati aggiuntivi                         |
|------------------|-------------------------------------------------------|-----------------------------------------|
| Cambio scena     | `https://w3id.org/xapi/adl/verbs/navigated-in`        | sceneId from/to, nome scena             |
| Click hotspot    | `http://adlnet.gov/expapi/verbs/interacted`           | ID hotspot, scena corrente, parent      |

---

## Come funziona il codice

### PHP → inietta la config nell'iframe

```php
// Il filtro aggiunge i nostri script al bundle H5P (dentro l'iframe)
add_filter( 'h5p_alter_library_scripts', 'h5pxapi_inject_scripts', 10, 3 );

// Un endpoint wp-ajax serve la configurazione come JavaScript
// Include le credenziali LRS + i dati dell'utente WP loggato
add_action( 'wp_ajax_h5pxapi_config', 'h5pxapi_serve_config' );
```

### JavaScript — tre livelli di intercettazione

**Livello 1: Pass-through xAPI nativo**
```javascript
H5P.externalDispatcher.on('xAPI', onNativeXAPI);
// ↳ cattura TUTTI gli statement xAPI che H5P già invia, li forwarda all'LRS
```

**Livello 2: Event listener sulle istanze**
```javascript
// Per Interactive Video: ascolto eventi del video player
instance.video.on('stateChange', function(event) { ... });
instance.video.on('seeked', function() { ... });

// Per Virtual Tour: ascolto navigazione scene
instance.on('navigatedTo', function(event) { ... });
```

**Livello 3: Monkey-patching (fallback)**
```javascript
// Se gli eventi non sono esposti, intercettiamo direttamente il metodo
var original = proto.navigateTo;
proto.navigateTo = function(sceneId) {
    original.apply(this, arguments);
    // ... poi inviamo il nostro statement
};
```

**Intercettazione di future istanze:**
```javascript
// H5P.newRunnable è la factory di tutte le istanze H5P
var originalNewRunnable = H5P.newRunnable;
H5P.newRunnable = function() {
    var inst = originalNewRunnable.apply(this, arguments);
    if (inst) setTimeout(() => attachEnhancedTracking(inst), 300);
    return inst;
};
```

---

## Struttura file

```
h5p-xapi-enhanced/
├── h5p-xapi-enhanced.php   ← plugin principale (PHP)
└── js/
    └── tracker.js          ← logica di tracciamento (JavaScript)
```

---

## FAQ per lo sviluppo del corso

**Q: Perché non basta usare `wp_enqueue_script` nella pagina WordPress?**  
A: Perché H5P gira in un iframe. Il JavaScript della pagina non può accedere al runtime H5P dentro l'iframe (same-origin policy del browser). L'unico modo è iniettare dentro l'iframe tramite `h5p_alter_library_scripts`.

**Q: Cosa succede se l'utente non è loggato in WordPress?**  
A: Il plugin genera un actor anonimo con `account.name = 'anonymous'`. Per corsi che richiedono identificazione, bisogna assicurarsi che gli utenti siano loggati.

**Q: Il tracciamento funziona anche per contenuti H5P embeddati via shortcode?**  
A: Sì, `h5p_alter_library_scripts` si applica a tutti i render H5P, inclusi shortcode nelle pagine.

**Q: E se H5P non usa iframe (embed type "div")?**  
A: Funziona ancora, in modo ancora più diretto: `H5P` è accessibile direttamente nel contesto della pagina.

**Q: Come testo se gli statement arrivano al LRS?**  
A: Veracity (e la maggior parte degli LRS) offre una tab "Statement Stream" o simile per vedere i statement in tempo reale. Puoi anche usare la console del browser con `debug: true`.

---

## Note su H5P.GameMap e H5P.ThreeImage

Questi due content type sono relativamente recenti e i nomi degli eventi interni possono variare tra versioni. Il tracker usa **due strategie in parallelo**:

1. **Event listener** sul metodo `on()` dell'istanza (quando gli eventi sono esposti)
2. **Monkey-patch** del metodo di navigazione (fallback universale)

Se gli statement di navigazione non appaiono in console, apri la DevTools e ispeziona l'istanza H5P:
```javascript
// Nella console del browser (dentro l'iframe H5P)
H5P.instances[0]  // ispezione dell'istanza
```

---

*Realizzato per il Modulo 3 — Tracciamento xAPI avanzato con H5P*  
*Corso: Specializzazione xAPI per Instructional Designer*
