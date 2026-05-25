/**
 * H5P xAPI Enhanced Tracker  —  tracker.js  v1.2.1
 * ─────────────────────────────────────────────────────────────────────────────
 * Questo script viene caricato DENTRO il contesto H5P (iframe incluso).
 *
 * Content type supportati con tracciamento potenziato:
 *   ✦ H5P.InteractiveVideo  → play, pause, seek, milestone 25/50/75%,
 *                             duration su ogni segmento riprodotto e su domande
 *   ✦ H5P.GameMap           → navigazione tra nodi + tempo per nodo
 *   ✦ H5P.ThreeImage        → navigazione tra scene + tempo per scena + hotspot
 *
 * result.duration è in formato ISO 8601 (PTxxMxx.xxxS) come richiesto da xAPI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // 0.  ATTENDI H5P
  // ══════════════════════════════════════════════════════════════════════════

  if (typeof H5P === 'undefined') {
    console.warn('[H5PxAPI] H5P non trovato — tracker non attivato.');
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    setTimeout(onReady, 200);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1.  CONFIGURAZIONE
  // ══════════════════════════════════════════════════════════════════════════

  var cfg      = window.H5PxAPIConfig || {};
  var LRS_ENDPOINT = cfg.lrsEndpoint || '';
  var LRS_AUTH     = cfg.lrsAuth     || '';
  var DEBUG        = cfg.debug       || false;

  function log() {
    if (DEBUG) console.log.apply(console, ['[H5PxAPI]'].concat(Array.prototype.slice.call(arguments)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2.  ACTOR
  // ══════════════════════════════════════════════════════════════════════════

  function buildActor() {
    if (cfg.actorMbox) {
      return { objectType: 'Agent', name: cfg.actorName || 'Learner', mbox: cfg.actorMbox };
    }
    var u = window.H5PIntegration && H5PIntegration.user;
    if (u && u.mail) {
      return { objectType: 'Agent', name: u.name || 'Learner', mbox: 'mailto:' + u.mail };
    }
    return {
      objectType: 'Agent',
      name: 'Learner',
      account: { homePage: (cfg.homepage || window.location.origin), name: 'anonymous' },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3.  UTILITY TEMPO
  //     isoDuration(ms) → "PT1M23.456S"   (ISO 8601 duration)
  //     Timer           → oggetto start/elapsed per misurare il tempo speso
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Converte millisecondi in stringa ISO 8601 duration.
   * Esempi:  5000 → "PT5S"   |   90500 → "PT1M30.5S"   |   3723000 → "PT1H2M3S"
   */
  function isoDuration(ms) {
    if (!ms || ms < 0) return 'PT0S';
    var totalSec = ms / 1000;
    var hours    = Math.floor(totalSec / 3600);
    var minutes  = Math.floor((totalSec % 3600) / 60);
    var seconds  = parseFloat((totalSec % 60).toFixed(3));

    var str = 'PT';
    if (hours)              str += hours   + 'H';
    if (minutes)            str += minutes + 'M';
    if (seconds || str === 'PT') str += seconds + 'S';
    return str;
  }

  /**
   * Timer semplice — tiene traccia di start, pause e resume
   * per calcolare il tempo EFFETTIVO (esclude i periodi in pausa).
   *
   * Uso:
   *   var t = new Timer();   // parte subito
   *   t.pause();             // sospende il conteggio
   *   t.resume();            // riprende
   *   t.elapsed()            // ms trascorsi (solo attivo)
   *   t.isoElapsed()         // come ISO 8601
   */
  function Timer(autoStart) {
    this._start      = null;
    this._elapsed    = 0;
    this._running    = false;
    if (autoStart !== false) this.start();
  }

  Timer.prototype.start = function () {
    if (!this._running) {
      this._start   = Date.now();
      this._running = true;
    }
  };

  Timer.prototype.pause = function () {
    if (this._running) {
      this._elapsed += Date.now() - this._start;
      this._running  = false;
    }
  };

  Timer.prototype.resume = function () {
    if (!this._running) {
      this._start   = Date.now();
      this._running = true;
    }
  };

  Timer.prototype.stop = function () {
    this.pause();
    var e = this._elapsed;
    this._elapsed = 0;
    this._running = false;
    return e;
  };

  Timer.prototype.elapsed = function () {
    if (this._running) return this._elapsed + (Date.now() - this._start);
    return this._elapsed;
  };

  Timer.prototype.isoElapsed = function () {
    return isoDuration(this.elapsed());
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4.  INVIO STATEMENT
  // ══════════════════════════════════════════════════════════════════════════

  function sendStatement(stmt) {
    if (!stmt.id)        stmt.id        = generateUUID();
    if (!stmt.timestamp) stmt.timestamp = new Date().toISOString();
    if (!stmt.actor)     stmt.actor     = buildActor();

    log('Statement:', stmt.verb.id.split('/').pop(),
        '| object:', stmt.object.id.split('/').pop(),
        stmt.result && stmt.result.duration ? '| duration:' + stmt.result.duration : '');

    if (!LRS_ENDPOINT) {
      console.info('[H5PxAPI] Statement (no LRS):', JSON.stringify(stmt, null, 2));
      return;
    }

    fetch(LRS_ENDPOINT + '/statements', {
      method:  'POST',
      headers: {
        'Content-Type':             'application/json',
        'X-Experience-API-Version': '1.0.3',
        'Authorization':            'Basic ' + LRS_AUTH,
      },
      body: JSON.stringify(stmt),
    })
    .then(function (res) {
      if (!res.ok) console.error('[H5PxAPI] LRS errore:', res.status);
    })
    .catch(function (err) {
      console.error('[H5PxAPI] Rete:', err.message);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5.  STATEMENT FIXER — migliora la qualità degli statement nativi H5P
  //
  //  Problemi che corregge:
  //   A) Activity ID brutti (admin-ajax.php?action=h5p_embed&id=1?subContentId=xxx)
  //      → sostituiti con URL leggibili basati sulla pagina reale
  //   B) object.definition.name mancante
  //      → copiato da definition.description (dove H5P mette il testo della domanda)
  //   C) contextActivities incompleto
  //      → parent pulito, grouping con IV + pagina WordPress, category preservata
  // ══════════════════════════════════════════════════════════════════════════

  // URL della pagina WordPress che ha embeddato l'H5P.
  // Dentro l'iframe: document.referrer = pagina embedding.
  // In embed div (no iframe): window.location.href = la pagina stessa.
  var _pageUrl = null;

  function getPageUrl() {
    if (_pageUrl) return _pageUrl;
    var isIframe = window.parent !== window;
    if (isIframe && document.referrer) {
      _pageUrl = document.referrer.split('?')[0].replace(/\/$/, '');
    } else if (!isIframe) {
      _pageUrl = window.location.href.split('?')[0].replace(/\/$/, '');
    } else {
      _pageUrl = cfg.homepage || window.location.origin;
    }
    return _pageUrl;
  }

  function isH5PEmbedUrl(id) {
    return id && id.indexOf('h5p_embed') !== -1;
  }

  function parseH5PEmbedUrl(id) {
    var contentIdMatch   = id.match(/[?&]id=(\d+)/);
    var subContentIdMatch = id.match(/subContentId=([a-f0-9-]+)/i);
    return {
      contentId:    contentIdMatch    ? contentIdMatch[1]    : null,
      subContentId: subContentIdMatch ? subContentIdMatch[1] : null,
    };
  }

  // Costruisce un activity ID pulito e stabile:
  // https://uniarts.it/nome-pagina#h5p-1            → il contenuto IV
  // https://uniarts.it/nome-pagina#h5p-1/uuid       → un'interazione dentro l'IV
  function buildCleanId(contentId, subContentId) {
    var base = getPageUrl() + '#h5p-' + contentId;
    return subContentId ? base + '/' + subContentId : base;
  }

  // Estrae il content ID numerico dallo statement (non il subContentId)
  function getContentIdFromStmt(stmt) {
    var ext = stmt.object && stmt.object.definition && stmt.object.definition.extensions;
    if (ext && ext['http://h5p.org/x-api/h5p-local-content-id']) {
      return String(ext['http://h5p.org/x-api/h5p-local-content-id']);
    }
    if (stmt.object && stmt.object.id) {
      var m = stmt.object.id.match(/[?&]id=(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  function getTitleFromContentId(contentId) {
    var cid = 'cid-' + contentId;
    if (window.H5PIntegration && H5PIntegration.contents && H5PIntegration.contents[cid]) {
      return H5PIntegration.contents[cid].title || 'H5P Content';
    }
    return 'H5P Content';
  }

  function fixStatement(stmt) {
    var contentId    = getContentIdFromStmt(stmt);
    if (!contentId) return stmt;  // non è uno statement H5P che possiamo migliorare

    var pageUrl      = getPageUrl();
    var contentTitle = getTitleFromContentId(contentId);
    var pageTitle    = document.title || pageUrl;

    // ── A. Pulisci object.id ─────────────────────────────────────────────
    if (stmt.object && stmt.object.id && isH5PEmbedUrl(stmt.object.id)) {
      var parsedObj  = parseH5PEmbedUrl(stmt.object.id);
      stmt.object.id = buildCleanId(
        parsedObj.contentId || contentId,
        parsedObj.subContentId
      );
    }

    // ── B. Aggiungi object.definition.name se mancante ───────────────────
    // H5P mette il testo della domanda in definition.description ma spesso
    // lascia definition.name vuoto. Lo copiamo per avere un nome leggibile.
    if (stmt.object && stmt.object.definition) {
      var def = stmt.object.definition;
      var hasName = def.name && Object.keys(def.name).length > 0;
      if (!hasName) {
        if (def.description && Object.keys(def.description).length > 0) {
          def.name = deepClone(def.description);
        } else {
          def.name = { 'en-US': contentTitle };
        }
      }
    }

    // ── C. Ricostruisci contextActivities ────────────────────────────────
    var ctx = stmt.context = stmt.context || {};
    var ca  = ctx.contextActivities = ctx.contextActivities || {};

    // parent: pulisci URL brutti mantenendo il riferimento corretto
    if (ca.parent && ca.parent.length > 0) {
      ca.parent = ca.parent.map(function (p) {
        if (!p.id || !isH5PEmbedUrl(p.id)) return p;
        var pp     = parseH5PEmbedUrl(p.id);
        var cleanId = buildCleanId(pp.contentId || contentId, pp.subContentId);
        return {
          objectType: 'Activity',
          id: cleanId,
          definition: p.definition || {
            type: pp.subContentId
              ? 'http://adlnet.gov/expapi/activities/interaction'
              : 'https://w3id.org/xapi/video/activity-type/video',
            name: { 'en-US': pp.subContentId ? 'Interaction' : contentTitle },
          },
        };
      });
    }

    // grouping: aggiungi l'IV e la pagina WordPress come contesto più ampio
    var h5pId          = buildCleanId(contentId, null);
    var existingOther  = (ca.grouping || []).filter(function (g) {
      return g.id && !isH5PEmbedUrl(g.id) && g.id !== h5pId && g.id !== pageUrl;
    });

    ca.grouping = [
      {
        objectType: 'Activity',
        id: h5pId,
        definition: {
          type: 'https://w3id.org/xapi/video/activity-type/video',
          name: { 'en-US': contentTitle },
        },
      },
      {
        objectType: 'Activity',
        id: pageUrl,
        definition: {
          type: 'http://adlnet.gov/expapi/activities/module',
          name: { 'en-US': pageTitle },
        },
      },
    ].concat(existingOther);

    // category: già corretta da H5P (es. H5P.SingleChoiceSet-1.11) — non toccare

    return stmt;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6.  PASS-THROUGH xAPI nativo
  //     Forwarda tutti gli statement H5P al LRS dopo aver:
  //       1. aggiunto l'actor se mancante
  //       2. applicato fixStatement per pulire ID e gerarchia
  //       3. aggiunto result.duration sui completed senza durata
  // ══════════════════════════════════════════════════════════════════════════

  // Timer globale per il tempo sulla pagina/sessione
  var sessionTimer = new Timer();

  function onNativeXAPI(event) {
    var stmt = event.data && event.data.statement;
    if (!stmt) return;

    stmt = deepClone(stmt);

    // Actor
    if (!stmt.actor || (!stmt.actor.mbox && !stmt.actor.account)) {
      stmt.actor = buildActor();
    }

    // Migliora la qualità dello statement
    stmt = fixStatement(stmt);

    // Aggiungi duration ai completed che ne sono privi
    if (stmt.verb && stmt.verb.id &&
        stmt.verb.id.indexOf('completed') !== -1 &&
        stmt.result && !stmt.result.duration) {
      stmt.result.duration = sessionTimer.isoElapsed();
    }

    sendStatement(stmt);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6.  INTERACTIVE VIDEO — tracciamento potenziato con durata
  // ══════════════════════════════════════════════════════════════════════════

  function attachInteractiveVideoTracking(instance) {
    var video = instance.video;
    if (!video) { log('IV: video non trovato'); return; }

    log('IV: attach tracking a contentId', instance.contentId);

    var activityId  = getActivityId(instance);
    var title       = getContentTitle(instance);
    var duration    = null;

    // ── Timer per ogni segmento di riproduzione ────────────────────────────
    // Misura quanto l'utente guarda effettivamente (esclude pause e seek)
    var playTimer = new Timer(false);

    // ── Timer per le domande embedded ─────────────────────────────────────
    // Ogni volta che appare una domanda, partiamo; quando risponde, stoppiamo
    var questionTimers = {}; // { questionId: Timer }

    // ── Milestone di avanzamento ───────────────────────────────────────────
    var milestones  = { 25: false, 50: false, 75: false };
    var progressInt = null;
    var lastTime    = 0;
    var isPlaying   = false;

    video.on('loaded', function () {
      duration = video.getDuration ? video.getDuration() : null;
      log('IV: durata =', duration);
    });

    // ── Cambio stato video ─────────────────────────────────────────────────
    video.on('stateChange', function (event) {
      var state       = event.data;
      var currentTime = video.getCurrentTime ? video.getCurrentTime() : 0;

      // PLAYING
      if (state === 1) {
        isPlaying = true;
        playTimer.resume();

        sendStatement({
          actor:  buildActor(),
          verb: {
            id:      'https://w3id.org/xapi/video/verbs/played',
            display: { 'it-IT': 'avviato', 'en-US': 'played' },
          },
          object: buildVideoObject(activityId, title),
          result: {
            extensions: {
              'https://w3id.org/xapi/video/extensions/time': parseFloat(currentTime.toFixed(3)),
            },
          },
          context: buildVideoContext(instance),
        });
        startProgressMonitoring();
      }

      // PAUSED
      if (state === 2) {
        isPlaying = false;
        playTimer.pause();
        stopProgressMonitoring();

        var segDuration = isoDuration(playTimer.elapsed());
        var progress    = duration ? currentTime / duration : 0;

        sendStatement({
          actor:  buildActor(),
          verb: {
            id:      'https://w3id.org/xapi/video/verbs/paused',
            display: { 'it-IT': 'messo in pausa', 'en-US': 'paused' },
          },
          object: buildVideoObject(activityId, title),
          result: {
            // duration = tempo di riproduzione accumulato fino a questa pausa
            duration: segDuration,
            extensions: {
              'https://w3id.org/xapi/video/extensions/time':     parseFloat(currentTime.toFixed(3)),
              'https://w3id.org/xapi/video/extensions/progress': parseFloat(progress.toFixed(4)),
              'https://w3id.org/xapi/video/extensions/played-segments':
                parseFloat(lastTime.toFixed(3)) + '[.]' + parseFloat(currentTime.toFixed(3)),
            },
          },
          context: buildVideoContext(instance),
        });
        lastTime = currentTime;
      }

      // ENDED
      if (state === 0) {
        isPlaying = false;
        stopProgressMonitoring();
        var totalWatched = playTimer.stop();
        log('IV: video terminato. Tempo totale di visione:', isoDuration(totalWatched));
        // Il completed finale H5P lo invia già in nativo (pass-through)
        // ma aggiungiamo la duration totale di visione tramite un statement
        // "experienced" separato per non sovrascrivere il completed H5P
        sendStatement({
          actor:  buildActor(),
          verb: {
            id:      'http://adlnet.gov/expapi/verbs/experienced',
            display: { 'it-IT': 'guardato', 'en-US': 'experienced' },
          },
          object: buildVideoObject(activityId, title),
          result: {
            // Durata EFFETTIVA di visione (somma di tutti i segmenti play)
            duration:   isoDuration(totalWatched),
            completion: true,
            extensions: {
              'https://w3id.org/xapi/video/extensions/progress': 1.0,
            },
          },
          context: buildVideoContext(instance),
        });
      }
    });

    // ── SEEKED ─────────────────────────────────────────────────────────────
    video.on('seeked', function () {
      var newTime = video.getCurrentTime ? video.getCurrentTime() : 0;
      sendStatement({
        actor:  buildActor(),
        verb: {
          id:      'https://w3id.org/xapi/video/verbs/seeked',
          display: { 'it-IT': 'spostato', 'en-US': 'seeked' },
        },
        object: buildVideoObject(activityId, title),
        result: {
          extensions: {
            'https://w3id.org/xapi/video/extensions/time-from': parseFloat(lastTime.toFixed(3)),
            'https://w3id.org/xapi/video/extensions/time-to':   parseFloat(newTime.toFixed(3)),
          },
        },
        context: buildVideoContext(instance),
      });
      lastTime = newTime;
    });

    // ── MILESTONE 25 / 50 / 75% ───────────────────────────────────────────
    function startProgressMonitoring() {
      if (progressInt) return;
      progressInt = setInterval(function () {
        if (!isPlaying || !duration) return;
        var t   = video.getCurrentTime ? video.getCurrentTime() : 0;
        var pct = Math.floor((t / duration) * 100);

        [25, 50, 75].forEach(function (m) {
          if (pct >= m && !milestones[m]) {
            milestones[m] = true;
            sendStatement({
              actor:  buildActor(),
              verb: {
                id:      'http://adlnet.gov/expapi/verbs/progressed',
                display: { 'it-IT': 'progredito', 'en-US': 'progressed' },
              },
              object: buildVideoObject(activityId, title),
              result: {
                // duration = tempo di visione accumulato fino al milestone
                duration:   playTimer.isoElapsed(),
                completion: false,
                extensions: {
                  'https://w3id.org/xapi/video/extensions/progress': m / 100,
                  'https://w3id.org/xapi/video/extensions/time':     parseFloat(t.toFixed(3)),
                },
              },
              context: buildVideoContext(instance),
            });
            log('IV: milestone', m + '%', '| watch-time:', playTimer.isoElapsed());
          }
        });
      }, 2000);
    }

    function stopProgressMonitoring() {
      if (progressInt) { clearInterval(progressInt); progressInt = null; }
    }

    // ── Domande embedded — timer per tempo di risposta ─────────────────────
    //
    // H5P.InteractiveVideo mette in pausa il video quando mostra una domanda.
    // Intercettiamo i suoi sotto-eventi per avviare/fermare un timer per domanda.
    //
    // Il modo più affidabile è ascoltare i sotto-statement xAPI:
    // quando arriva un "answered" per un sotto-contenuto, sappiamo l'ID
    // della domanda e possiamo calcolare il tempo.
    //
    // Teniamo un dizionario questionTimers keyed per activity ID della domanda.
    H5P.externalDispatcher.on('xAPI', function (event) {
      var stmt = event.data && event.data.statement;
      if (!stmt) return;

      var verbId = stmt.verb && stmt.verb.id;
      if (!verbId) return;

      // Quando arriva "attempted" per una sotto-interazione del nostro IV,
      // avviamo il timer per quella domanda
      if (verbId.indexOf('attempted') !== -1 &&
          stmt.context && stmt.context.contextActivities &&
          stmt.context.contextActivities.parent) {
        var parents = stmt.context.contextActivities.parent;
        for (var i = 0; i < parents.length; i++) {
          if (parents[i].id === activityId) {
            var qId = stmt.object && stmt.object.id;
            if (qId && !questionTimers[qId]) {
              questionTimers[qId] = new Timer();
              log('IV: timer domanda avviato per', qId.split('/').pop());
            }
            break;
          }
        }
      }

      // Quando arriva "answered" per una sotto-interazione, fermiamo il timer
      // e aggiungiamo la duration allo statement (che poi viene reinviato
      // dal pass-through con la duration aggiunta)
      if (verbId.indexOf('answered') !== -1 &&
          stmt.context && stmt.context.contextActivities &&
          stmt.context.contextActivities.parent) {
        var parentsA = stmt.context.contextActivities.parent;
        for (var j = 0; j < parentsA.length; j++) {
          if (parentsA[j].id === activityId) {
            var qIdA = stmt.object && stmt.object.id;
            if (qIdA && questionTimers[qIdA]) {
              var elapsed = questionTimers[qIdA].stop();
              delete questionTimers[qIdA];
              // Inietta duration nello statement prima che il pass-through lo invii
              if (stmt.result) {
                stmt.result.duration = isoDuration(elapsed);
              } else {
                stmt.result = { duration: isoDuration(elapsed) };
              }
              log('IV: domanda risposta in', isoDuration(elapsed));
            }
            break;
          }
        }
      }
    });

    // ── Helpers Video xAPI Profile ─────────────────────────────────────────
    function buildVideoObject(id, name) {
      return {
        objectType: 'Activity',
        id: id,
        definition: {
          type: 'https://w3id.org/xapi/video/activity-type/video',
          name: { 'it-IT': name, 'en-US': name },
        },
      };
    }

    function buildVideoContext(inst) {
      var parentId = window.parent !== window
        ? (document.referrer || window.location.href)
        : window.location.href;

      return {
        extensions: {
          'https://w3id.org/xapi/video/extensions/session-id':  inst.contentId,
          'https://w3id.org/xapi/video/extensions/full-screen': false,
          'https://w3id.org/xapi/video/extensions/screen-size':
            window.screen.width + 'x' + window.screen.height,
        },
        contextActivities: {
          category: [{
            id: 'https://w3id.org/xapi/video',
            definition: { type: 'http://adlnet.gov/expapi/activities/profile' },
          }],
          parent: [{ objectType: 'Activity', id: parentId }],
        },
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7.  GAME MAP — navigazione nodi + tempo per nodo
  // ══════════════════════════════════════════════════════════════════════════

  function attachGameMapTracking(instance) {
    log('GameMap: attach tracking a contentId', instance.contentId);

    var activityId   = getActivityId(instance);
    var title        = getContentTitle(instance);
    var currentNode  = null;
    var nodeTimer    = null;  // Timer per il nodo corrente

    function sendNodeNavigation(nodeId, nodeName) {
      // Ferma il timer del nodo precedente e invia un "experienced" con duration
      if (currentNode && nodeTimer) {
        var timeOnNode = nodeTimer.stop();
        sendStatement({
          actor: buildActor(),
          verb: {
            id:      'http://adlnet.gov/expapi/verbs/experienced',
            display: { 'it-IT': 'visitato', 'en-US': 'experienced' },
          },
          object: {
            objectType: 'Activity',
            id: activityId + '/node/' + encodeURIComponent(currentNode.id),
            definition: {
              type: 'http://adlnet.gov/expapi/activities/module',
              name: { 'it-IT': currentNode.name, 'en-US': currentNode.name },
            },
          },
          result: {
            // Tempo effettivo trascorso nel nodo precedente
            duration: isoDuration(timeOnNode),
          },
          context: {
            contextActivities: {
              parent: [{ objectType: 'Activity', id: activityId }],
            },
          },
        });
        log('GameMap: lasciato nodo', currentNode.name, '| tempo:', isoDuration(timeOnNode));
      }

      // Invia "navigated-in" per il nuovo nodo
      sendStatement({
        actor: buildActor(),
        verb: {
          id:      'https://w3id.org/xapi/adl/verbs/navigated-in',
          display: { 'it-IT': 'navigato in', 'en-US': 'navigated in' },
        },
        object: {
          objectType: 'Activity',
          id: activityId + '/node/' + encodeURIComponent(nodeId),
          definition: {
            type: 'http://adlnet.gov/expapi/activities/module',
            name: { 'it-IT': nodeName, 'en-US': nodeName },
          },
        },
        context: {
          contextActivities: {
            parent: [{ objectType: 'Activity', id: activityId }],
          },
          extensions: {
            'http://id.tincanapi.com/extension/h5p/content-id': instance.contentId,
          },
        },
      });

      // Avvia il timer per il nuovo nodo
      currentNode = { id: nodeId, name: nodeName };
      nodeTimer   = new Timer();
      log('GameMap: entrato in nodo', nodeName);
    }

    // Event listener (API ufficiale, se disponibile)
    var nodeEvents = ['enterTask', 'openTask', 'taskOpened', 'goToTask'];
    nodeEvents.forEach(function (evName) {
      instance.on(evName, function (event) {
        var data     = event.data || {};
        var nodeId   = data.id   || data.contentId || data.taskId || 'unknown';
        var nodeName = data.label || data.title    || data.name   || ('Nodo ' + nodeId);
        sendNodeNavigation(nodeId, nodeName);
      });
    });

    // Monkey-patch come fallback
    setTimeout(function () {
      if (!instance.gamemap) return;
      var proto = Object.getPrototypeOf(instance.gamemap);
      ['showTask', 'openTask', 'navigateTo', 'gotoTask'].forEach(function (method) {
        if (typeof proto[method] === 'function') {
          var original = proto[method];
          proto[method] = function (taskOrId) {
            original.apply(this, arguments);
            var nodeId   = (taskOrId && taskOrId.id)    || taskOrId || 'unknown';
            var nodeName = (taskOrId && taskOrId.label) || ('Nodo ' + nodeId);
            sendNodeNavigation(nodeId, nodeName);
          };
          log('GameMap: monkey-patched', method);
        }
      });
    }, 500);

    // Quando la mappa viene completata, ferma il timer dell'ultimo nodo
    instance.on('xAPI', function (event) {
      var verb = event.data && event.data.statement && event.data.statement.verb;
      if (verb && verb.id && verb.id.indexOf('completed') !== -1) {
        if (currentNode && nodeTimer) {
          var finalTime = nodeTimer.stop();
          log('GameMap: completato. Ultimo nodo:', currentNode.name, '| tempo:', isoDuration(finalTime));
          // Il completed nativo arriverà via pass-through — aggiungiamo la duration
          var stmt = event.data.statement;
          if (stmt.result) {
            stmt.result.duration = isoDuration(finalTime);
          }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8.  VIRTUAL TOUR — navigazione scene + tempo per scena + hotspot
  // ══════════════════════════════════════════════════════════════════════════

  function attachVirtualTourTracking(instance) {
    log('VirtualTour: attach tracking a contentId', instance.contentId);

    var activityId    = getActivityId(instance);
    var title         = getContentTitle(instance);
    var currentScene  = null;
    var sceneTimer    = null;  // Timer per la scena corrente

    function sendSceneNavigation(sceneId, sceneName) {
      // Ferma il timer della scena precedente
      if (currentScene && sceneTimer) {
        var timeInScene = sceneTimer.stop();
        sendStatement({
          actor: buildActor(),
          verb: {
            id:      'http://adlnet.gov/expapi/verbs/experienced',
            display: { 'it-IT': 'visitato', 'en-US': 'experienced' },
          },
          object: {
            objectType: 'Activity',
            id: activityId + '/scene/' + encodeURIComponent(currentScene.id),
            definition: {
              type: 'https://w3id.org/xapi/virtual-reality/activity-type/scene',
              name: { 'it-IT': currentScene.name, 'en-US': currentScene.name },
            },
          },
          result: {
            // Tempo trascorso nella scena precedente
            duration: isoDuration(timeInScene),
          },
          context: {
            contextActivities: {
              parent: [{ objectType: 'Activity', id: activityId }],
            },
          },
        });
        log('VirtualTour: lasciata scena', currentScene.name, '| tempo:', isoDuration(timeInScene));
      }

      // Invia "navigated-in" per la nuova scena
      sendStatement({
        actor: buildActor(),
        verb: {
          id:      'https://w3id.org/xapi/adl/verbs/navigated-in',
          display: { 'it-IT': 'navigato verso', 'en-US': 'navigated to' },
        },
        object: {
          objectType: 'Activity',
          id: activityId + '/scene/' + encodeURIComponent(sceneId),
          definition: {
            type: 'https://w3id.org/xapi/virtual-reality/activity-type/scene',
            name: { 'it-IT': sceneName, 'en-US': sceneName },
          },
        },
        context: {
          contextActivities: {
            parent: [{
              objectType: 'Activity',
              id: activityId,
              definition: { type: 'http://adlnet.gov/expapi/activities/course', name: { 'it-IT': title } },
            }],
          },
          extensions: {
            'http://id.tincanapi.com/extension/h5p/scene-from': currentScene ? currentScene.id : null,
            'http://id.tincanapi.com/extension/h5p/scene-to':   sceneId,
          },
        },
      });

      // Avvia il timer per la nuova scena
      currentScene = { id: sceneId, name: sceneName };
      sceneTimer   = new Timer();
      log('VirtualTour: entrato in scena', sceneName);
    }

    // Event listener
    instance.on('navigatedTo', function (event) {
      var data      = event.data || {};
      var sceneId   = data.sceneId   || data.id    || 'unknown';
      var sceneName = data.sceneName || data.title || data.label || ('Scena ' + sceneId);
      sendSceneNavigation(sceneId, sceneName);
    });

    // Hotspot cliccati — includiamo il tempo accumulato nella scena fino al click
    instance.on('interact', function (event) {
      var data          = event.data || {};
      var interactionId = data.interactionId || data.id || 'unknown';
      var interactName  = data.label || data.title    || ('Hotspot ' + interactionId);

      sendStatement({
        actor: buildActor(),
        verb: {
          id:      'http://adlnet.gov/expapi/verbs/interacted',
          display: { 'it-IT': 'interagito', 'en-US': 'interacted' },
        },
        object: {
          objectType: 'Activity',
          id: activityId + '/scene/' + encodeURIComponent(currentScene ? currentScene.id : 'default')
              + '/hotspot/' + encodeURIComponent(interactionId),
          definition: {
            type: 'http://adlnet.gov/expapi/activities/interaction',
            name: { 'it-IT': interactName, 'en-US': interactName },
          },
        },
        result: {
          // Tempo trascorso nella scena fino a questo click
          duration: sceneTimer ? sceneTimer.isoElapsed() : 'PT0S',
        },
        context: {
          contextActivities: {
            parent: [{
              objectType: 'Activity',
              id: activityId + '/scene/' + encodeURIComponent(currentScene ? currentScene.id : 'default'),
            }],
            grouping: [{ objectType: 'Activity', id: activityId }],
          },
        },
      });
      log('VirtualTour: hotspot', interactName, '| tempo nella scena:', sceneTimer ? sceneTimer.isoElapsed() : '?');
    });

    // Monkey-patch navigateTo come fallback
    setTimeout(function () {
      if (typeof instance.navigateTo === 'function') {
        var origNav = instance.navigateTo.bind(instance);
        instance.navigateTo = function (sceneId) {
          origNav(sceneId);
          var sceneData = ((instance.params && instance.params.scenes) || [])
            .find(function (s) { return s.sceneId === sceneId; });
          instance.trigger('navigatedTo', {
            sceneId:   sceneId,
            sceneName: sceneData
              ? (sceneData.scenename || sceneData.sceneDescription || 'Scena')
              : ('Scena ' + sceneId),
          });
        };
        log('VirtualTour: monkey-patched navigateTo');
      }
    }, 500);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9.  DISPATCHER — rileva tipo istanza e applica tracker
  // ══════════════════════════════════════════════════════════════════════════

  var trackedInstances = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function alreadyTracked(instance) {
    if (trackedInstances) {
      if (trackedInstances.has(instance)) return true;
      trackedInstances.add(instance);
      return false;
    }
    if (instance.__h5pxapiTracked) return true;
    instance.__h5pxapiTracked = true;
    return false;
  }

  function attachEnhancedTracking(instance) {
    if (!instance || alreadyTracked(instance)) return;
    var library = instance.libraryInfo && instance.libraryInfo.machineName;
    if (!library) return;

    log('Istanza rilevata:', library);

    switch (library) {
      case 'H5P.InteractiveVideo': attachInteractiveVideoTracking(instance); break;
      case 'H5P.GameMap':          attachGameMapTracking(instance);          break;
      case 'H5P.ThreeImage':       attachVirtualTourTracking(instance);      break;
      default:
        log('Pass-through xAPI per:', library);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. UTILITY
  // ══════════════════════════════════════════════════════════════════════════

  function getActivityId(instance) {
    var cid = 'cid-' + instance.contentId;
    if (window.H5PIntegration && H5PIntegration.contents && H5PIntegration.contents[cid]) {
      var url = H5PIntegration.contents[cid].url;
      if (url) return url;
    }
    return (cfg.homepage || window.location.origin) + '/h5p-content/' + instance.contentId;
  }

  function getContentTitle(instance) {
    var cid = 'cid-' + instance.contentId;
    if (window.H5PIntegration && H5PIntegration.contents && H5PIntegration.contents[cid]) {
      return H5PIntegration.contents[cid].title || 'Contenuto H5P';
    }
    return 'Contenuto H5P';
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function deepClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 11. INIZIALIZZAZIONE
  // ══════════════════════════════════════════════════════════════════════════

  function onReady() {
    log('H5P xAPI Enhanced Tracker v1.2.1 — inizializzazione');

    H5P.externalDispatcher.on('xAPI', onNativeXAPI);

    if (H5P.instances && H5P.instances.length) {
      H5P.instances.forEach(attachEnhancedTracking);
    }

    var originalNewRunnable = H5P.newRunnable;
    H5P.newRunnable = function () {
      var inst = originalNewRunnable.apply(this, arguments);
      if (inst) setTimeout(function () { attachEnhancedTracking(inst); }, 300);
      return inst;
    };

    log('Tracker attivo. LRS:', LRS_ENDPOINT || '(solo console)');
  }

})();
