<?php
/**
 * Plugin Name:  H5P xAPI Enhanced Tracker
 * Description:  Tracciamento xAPI dettagliato per H5P (Interactive Video, Game Map,
 *               Virtual Tour) con pagina di configurazione integrata.
 * Version:      1.2.1
 * Author:       Nicola Mastrorilli / Cartesiani
 * GitHub Plugin URI: https://github.com/Renato1596/h5p-xapi-enhanced
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ═══════════════════════════════════════════════════════════════════════════
//  AUTO-AGGIORNAMENTO DA GITHUB
//  plugin-update-checker controlla le release GitHub e notifica WordPress
//  quando c'è una versione più recente disponibile.
// ═══════════════════════════════════════════════════════════════════════════

require_once plugin_dir_path( __FILE__ ) . 'plugin-update-checker/load-v5p3.php';

use YahnisElsts\PluginUpdateChecker\v5p3\PucFactory;

$h5pxapi_updater = PucFactory::buildUpdateChecker(
    'https://github.com/Renato1596/h5p-xapi-enhanced',
    __FILE__,
    'h5p-xapi-enhanced'
);

// Per repo pubblico non serve token — questa riga dice al checker
// di usare le GitHub Releases come fonte degli aggiornamenti
$h5pxapi_updater->getVcsApi()->enableReleaseAssets();

// ═══════════════════════════════════════════════════════════════════════════
//  COSTANTI  (wp-config.php ha sempre la precedenza sulle opzioni del DB)
// ═══════════════════════════════════════════════════════════════════════════

define( 'H5PXAPI_VERSION',     '1.2.1' );
define( 'H5PXAPI_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'H5PXAPI_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );
define( 'H5PXAPI_OPTION_KEY',  'h5pxapi_settings' );

// Legge le impostazioni: prima da wp-config.php, poi dal database
function h5pxapi_get( $key, $default = '' ) {
    $const_map = [
        'lrs_endpoint' => 'H5PXAPI_LRS_ENDPOINT',
        'lrs_username' => 'H5PXAPI_LRS_USERNAME',
        'lrs_password' => 'H5PXAPI_LRS_PASSWORD',
        'homepage'     => 'H5PXAPI_HOMEPAGE',
    ];
    if ( isset( $const_map[ $key ] ) && defined( $const_map[ $key ] ) ) {
        return constant( $const_map[ $key ] );
    }
    $opts = get_option( H5PXAPI_OPTION_KEY, [] );
    return $opts[ $key ] ?? $default;
}


// ═══════════════════════════════════════════════════════════════════════════
//  PAGINA DI CONFIGURAZIONE ADMIN
// ═══════════════════════════════════════════════════════════════════════════

add_action( 'admin_menu', function () {
    add_options_page(
        'H5P xAPI Tracker',       // titolo pagina
        'H5P xAPI Tracker',       // voce nel menu
        'manage_options',
        'h5pxapi-settings',
        'h5pxapi_render_settings_page'
    );
} );

add_action( 'admin_init', 'h5pxapi_register_settings' );

function h5pxapi_register_settings() {
    register_setting(
        'h5pxapi_group',
        H5PXAPI_OPTION_KEY,
        [ 'sanitize_callback' => 'h5pxapi_sanitize_settings' ]
    );
}

function h5pxapi_sanitize_settings( $input ) {
    return [
        'lrs_endpoint' => esc_url_raw( trim( $input['lrs_endpoint'] ?? '' ) ),
        'lrs_username' => sanitize_text_field( $input['lrs_username'] ?? '' ),
        'lrs_password' => sanitize_text_field( $input['lrs_password'] ?? '' ),
        'homepage'     => esc_url_raw( trim( $input['homepage'] ?? '' ) ),
        'debug'        => ! empty( $input['debug'] ) ? '1' : '0',
    ];
}

// ── Stili inline per la pagina settings ────────────────────────────────────
add_action( 'admin_head', function () {
    $screen = get_current_screen();
    if ( ! $screen || $screen->id !== 'settings_page_h5pxapi-settings' ) return;
    ?>
    <style>
    /* ── layout generale ── */
    #h5pxapi-wrap { max-width: 780px; }
    #h5pxapi-wrap h1 { display:flex; align-items:center; gap:10px; }
    #h5pxapi-wrap h1 .badge {
        font-size:12px; font-weight:600; background:#1d2327; color:#fff;
        padding:2px 8px; border-radius:20px; letter-spacing:.5px;
    }

    /* ── card ── */
    .h5pxapi-card {
        background:#fff; border:1px solid #c3c4c7; border-radius:6px;
        padding:24px 28px; margin-top:20px; box-shadow:0 1px 3px rgba(0,0,0,.06);
    }
    .h5pxapi-card h2 {
        margin:0 0 18px; font-size:15px; font-weight:600;
        border-bottom:1px solid #f0f0f1; padding-bottom:10px;
        display:flex; align-items:center; gap:8px;
    }
    .h5pxapi-card h2 .dashicons { color:#2271b1; font-size:18px; }

    /* ── form fields ── */
    .h5pxapi-field { margin-bottom:18px; }
    .h5pxapi-field label {
        display:block; font-weight:600; margin-bottom:5px; font-size:13px;
    }
    .h5pxapi-field input[type=text],
    .h5pxapi-field input[type=url],
    .h5pxapi-field input[type=password] {
        width:100%; max-width:480px; padding:7px 10px;
        border:1px solid #8c8f94; border-radius:4px;
        font-size:13px; font-family:monospace;
    }
    .h5pxapi-field input:focus { border-color:#2271b1; box-shadow:0 0 0 1px #2271b1; outline:none; }
    .h5pxapi-field .desc { color:#646970; font-size:12px; margin-top:4px; }

    /* ── toggle password ── */
    .h5pxapi-pw-wrap { position:relative; display:inline-block; width:100%; max-width:480px; }
    .h5pxapi-pw-wrap input { width:100%; max-width:100%; padding-right:36px; }
    .h5pxapi-pw-wrap .toggle-pw {
        position:absolute; right:8px; top:50%; transform:translateY(-50%);
        background:none; border:none; cursor:pointer; color:#646970; padding:0;
    }
    .h5pxapi-pw-wrap .toggle-pw:hover { color:#2271b1; }

    /* ── debug toggle ── */
    .h5pxapi-toggle { display:flex; align-items:center; gap:10px; }
    .h5pxapi-toggle input[type=checkbox] { width:16px; height:16px; margin:0; }

    /* ── test connection ── */
    #h5pxapi-test-btn {
        margin-top:4px;
        display:inline-flex; align-items:center; gap:6px;
    }
    #h5pxapi-test-result {
        display:none; margin-top:10px; padding:10px 14px;
        border-radius:4px; font-size:13px; font-weight:500;
    }
    #h5pxapi-test-result.ok  { background:#edfaef; border:1px solid #68de7c; color:#1a7024; }
    #h5pxapi-test-result.err { background:#fcf0f1; border:1px solid #f86368; color:#8a1f26; }

    /* ── status badge ── */
    .h5pxapi-status {
        display:inline-flex; align-items:center; gap:6px;
        padding:4px 10px; border-radius:20px; font-size:12px; font-weight:600;
    }
    .h5pxapi-status.configured { background:#edfaef; color:#1a7024; }
    .h5pxapi-status.missing    { background:#fcf0f1; color:#8a1f26; }
    .h5pxapi-status::before { content:"●"; font-size:10px; }

    /* ── override notice ── */
    .h5pxapi-override {
        background:#fff8e5; border:1px solid #f0c000; border-radius:4px;
        padding:8px 12px; font-size:12px; color:#5a4000; margin-bottom:12px;
    }
    .h5pxapi-override code { background:rgba(0,0,0,.07); padding:1px 4px; border-radius:2px; }
    </style>
    <?php
} );

// ── Render della pagina ────────────────────────────────────────────────────
function h5pxapi_render_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) return;

    $opts     = get_option( H5PXAPI_OPTION_KEY, [] );
    $endpoint = h5pxapi_get( 'lrs_endpoint' );
    $username = h5pxapi_get( 'lrs_username' );
    $password = h5pxapi_get( 'lrs_password' );
    $homepage = h5pxapi_get( 'homepage', get_site_url() );
    $debug    = ( $opts['debug'] ?? '0' ) === '1';

    // Controlla se alcune opzioni sono sovrascritte da wp-config.php
    $ep_overridden = defined( 'H5PXAPI_LRS_ENDPOINT' );
    $un_overridden = defined( 'H5PXAPI_LRS_USERNAME' );
    $pw_overridden = defined( 'H5PXAPI_LRS_PASSWORD' );

    $is_configured = ! empty( $endpoint ) && ! empty( $username ) && ! empty( $password );
    ?>
    <div class="wrap" id="h5pxapi-wrap">

      <h1>
        <span class="dashicons dashicons-analytics" style="font-size:26px;color:#2271b1;"></span>
        H5P xAPI Enhanced Tracker
        <span class="badge">v<?php echo H5PXAPI_VERSION; ?></span>
      </h1>

      <?php settings_errors( 'h5pxapi_group' ); ?>

      <!-- ── Status card ── -->
      <div class="h5pxapi-card">
        <h2><span class="dashicons dashicons-info-outline"></span> Stato</h2>
        <p>
          LRS:
          <?php if ( $is_configured ): ?>
            <span class="h5pxapi-status configured">Configurato</span>
            &nbsp; <code style="font-size:12px;"><?php echo esc_html( $endpoint ); ?></code>
          <?php else: ?>
            <span class="h5pxapi-status missing">Non configurato</span>
          <?php endif; ?>
        </p>
        <p style="color:#646970;font-size:13px;margin:0;">
          Il tracker intercetta gli eventi interni di <strong>Interactive Video</strong>,
          <strong>Game Map</strong> e <strong>Virtual Tour</strong> e li invia come
          statement xAPI al tuo LRS, aggiungendo <code>result.duration</code> per ogni elemento.
        </p>
      </div>

      <!-- ── Form configurazione ── -->
      <form method="post" action="options.php" id="h5pxapi-form">
        <?php settings_fields( 'h5pxapi_group' ); ?>

        <div class="h5pxapi-card">
          <h2><span class="dashicons dashicons-cloud"></span> Connessione LRS</h2>

          <!-- Endpoint -->
          <div class="h5pxapi-field">
            <label for="h5pxapi_endpoint">Endpoint LRS <em style="font-weight:400;color:#646970;">(xAPI base URL)</em></label>
            <?php if ( $ep_overridden ): ?>
              <div class="h5pxapi-override">
                ⚠️ Sovrascritta da <code>wp-config.php</code> → il campo sotto è ignorato.
              </div>
            <?php endif; ?>
            <input type="url"
                   id="h5pxapi_endpoint"
                   name="<?php echo H5PXAPI_OPTION_KEY; ?>[lrs_endpoint]"
                   value="<?php echo esc_attr( $opts['lrs_endpoint'] ?? '' ); ?>"
                   placeholder="https://il-tuo-lrs.io/xapi"
                   <?php echo $ep_overridden ? 'disabled' : ''; ?> />
            <?php if ( $ep_overridden ): ?>
              <p class="desc">Valore attivo: <strong><?php echo esc_html( $endpoint ); ?></strong></p>
            <?php else: ?>
              <p class="desc">Es: <code>https://cartesiani--noisy.lrs.io/xapi</code> — senza slash finale</p>
            <?php endif; ?>
          </div>

          <!-- Username -->
          <div class="h5pxapi-field">
            <label for="h5pxapi_user">Username LRS</label>
            <?php if ( $un_overridden ): ?>
              <div class="h5pxapi-override">⚠️ Sovrascritta da <code>wp-config.php</code>.</div>
            <?php endif; ?>
            <input type="text"
                   id="h5pxapi_user"
                   name="<?php echo H5PXAPI_OPTION_KEY; ?>[lrs_username]"
                   value="<?php echo esc_attr( $opts['lrs_username'] ?? '' ); ?>"
                   autocomplete="off"
                   <?php echo $un_overridden ? 'disabled' : ''; ?> />
          </div>

          <!-- Password -->
          <div class="h5pxapi-field">
            <label for="h5pxapi_pass">Password LRS</label>
            <?php if ( $pw_overridden ): ?>
              <div class="h5pxapi-override">⚠️ Sovrascritta da <code>wp-config.php</code>.</div>
            <?php endif; ?>
            <div class="h5pxapi-pw-wrap">
              <input type="password"
                     id="h5pxapi_pass"
                     name="<?php echo H5PXAPI_OPTION_KEY; ?>[lrs_password]"
                     value="<?php echo esc_attr( $opts['lrs_password'] ?? '' ); ?>"
                     autocomplete="new-password"
                     <?php echo $pw_overridden ? 'disabled' : ''; ?> />
              <button type="button" class="toggle-pw" aria-label="Mostra/nascondi password"
                      onclick="var i=document.getElementById('h5pxapi_pass');
                               i.type=i.type==='password'?'text':'password';
                               this.querySelector('.dashicons').classList.toggle('dashicons-visibility');
                               this.querySelector('.dashicons').classList.toggle('dashicons-hidden');">
                <span class="dashicons dashicons-visibility"></span>
              </button>
            </div>
          </div>

          <!-- Test connessione -->
          <div class="h5pxapi-field">
            <label>Test connessione</label>
            <button type="button" id="h5pxapi-test-btn" class="button button-secondary">
              <span class="dashicons dashicons-update" style="margin-top:3px;"></span>
              Verifica connessione LRS
            </button>
            <div id="h5pxapi-test-result"></div>
          </div>
        </div>

        <div class="h5pxapi-card">
          <h2><span class="dashicons dashicons-admin-settings"></span> Impostazioni avanzate</h2>

          <!-- Homepage -->
          <div class="h5pxapi-field">
            <label for="h5pxapi_homepage">Homepage (IRI base per gli actor anonimi)</label>
            <input type="url"
                   id="h5pxapi_homepage"
                   name="<?php echo H5PXAPI_OPTION_KEY; ?>[homepage]"
                   value="<?php echo esc_attr( $opts['homepage'] ?? '' ); ?>"
                   placeholder="<?php echo esc_attr( get_site_url() ); ?>" />
            <p class="desc">Usato come <code>account.homePage</code> per gli utenti non loggati. Default: URL del sito.</p>
          </div>

          <!-- Debug -->
          <div class="h5pxapi-field">
            <label>Modalità debug</label>
            <div class="h5pxapi-toggle">
              <input type="checkbox"
                     id="h5pxapi_debug"
                     name="<?php echo H5PXAPI_OPTION_KEY; ?>[debug]"
                     value="1"
                     <?php checked( $debug ); ?> />
              <label for="h5pxapi_debug" style="font-weight:400;">
                Stampa tutti gli statement xAPI nella console del browser
              </label>
            </div>
            <p class="desc">Utile durante lo sviluppo. Disattiva in produzione.</p>
          </div>
        </div>

        <?php submit_button( 'Salva impostazioni', 'primary', 'submit', true,
            [ 'style' => 'margin-top:8px;' ] ); ?>
      </form>

    </div><!-- /#h5pxapi-wrap -->

    <script>
    // ── Test connessione LRS via AJAX ──────────────────────────────────────
    // Legge i valori DIRETTAMENTE dai campi del form — funziona anche prima di salvare
    document.getElementById('h5pxapi-test-btn').addEventListener('click', function () {
        var btn      = this;
        var res      = document.getElementById('h5pxapi-test-result');

        // Legge i valori attuali dai campi HTML (non dal database)
        var endpoint = document.getElementById('h5pxapi_endpoint').value.trim();
        var username = document.getElementById('h5pxapi_user').value.trim();
        var password = document.getElementById('h5pxapi_pass').value.trim();

        // Validazione client-side immediata, prima della chiamata AJAX
        if ( !endpoint || !username || !password ) {
            res.className     = 'err';
            res.textContent   = '\u26A0\uFE0F Compila endpoint, username e password prima di verificare.';
            res.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.querySelector('.dashicons').className = 'dashicons dashicons-update spin';
        res.style.display = 'none';

        var body = 'action=h5pxapi_test_connection'
                 + '&_wpnonce=<?php echo wp_create_nonce( "h5pxapi_test" ); ?>'
                 + '&endpoint=' + encodeURIComponent( endpoint )
                 + '&username=' + encodeURIComponent( username )
                 + '&password=' + encodeURIComponent( password );

        fetch(ajaxurl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    body,
        })
        .then(r => r.json())
        .then(data => {
            res.className     = data.success ? 'ok' : 'err';
            res.textContent   = data.message;
            res.style.display = 'block';
        })
        .catch(err => {
            res.className     = 'err';
            res.textContent   = 'Errore di rete: ' + err.message;
            res.style.display = 'block';
        })
        .finally(() => {
            btn.disabled = false;
            btn.querySelector('.dashicons').className = 'dashicons dashicons-update';
        });
    });

    // Aggiunge la classe "spin" via CSS inline (l'icona Dashicons non ha animazione nativa)
    var style = document.createElement('style');
    style.textContent = '@keyframes h5pxapi-spin{to{transform:rotate(360deg)}}'
        + '.spin{animation:h5pxapi-spin .8s linear infinite;display:inline-block;}';
    document.head.appendChild(style);
    </script>
    <?php
}


// ═══════════════════════════════════════════════════════════════════════════
//  AJAX — test connessione LRS
// ═══════════════════════════════════════════════════════════════════════════

add_action( 'wp_ajax_h5pxapi_test_connection', function () {
    check_ajax_referer( 'h5pxapi_test' );
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );

    // Legge prima i valori inviati dal form (non ancora salvati),
    // poi cade su quelli del database / wp-config.php come fallback.
    $endpoint = ! empty( $_POST['endpoint'] )
        ? esc_url_raw( trim( $_POST['endpoint'] ) )
        : h5pxapi_get( 'lrs_endpoint' );

    $username = ! empty( $_POST['username'] )
        ? sanitize_text_field( $_POST['username'] )
        : h5pxapi_get( 'lrs_username' );

    $password = ! empty( $_POST['password'] )
        ? sanitize_text_field( $_POST['password'] )
        : h5pxapi_get( 'lrs_password' );

    if ( empty( $endpoint ) || empty( $username ) || empty( $password ) ) {
        wp_send_json( [ 'success' => false, 'message' => '⚠️ Configurazione incompleta: endpoint, username e password sono obbligatori.' ] );
    }

    // Chiama GET /about sull'LRS (endpoint standard xAPI, non richiede body)
    $response = wp_remote_get(
        trailingslashit( $endpoint ) . 'about',
        [
            'headers' => [
                'Authorization'             => 'Basic ' . base64_encode( $username . ':' . $password ),
                'X-Experience-API-Version'  => '1.0.3',
            ],
            'timeout' => 10,
            'sslverify' => true,
        ]
    );

    if ( is_wp_error( $response ) ) {
        wp_send_json( [ 'success' => false, 'message' => '❌ Errore di rete: ' . $response->get_error_message() ] );
    }

    $code = wp_remote_retrieve_response_code( $response );

    if ( $code === 200 ) {
        $body    = json_decode( wp_remote_retrieve_body( $response ), true );
        $version = $body['version'][0] ?? 'n/d';
        wp_send_json( [ 'success' => true, 'message' => '✅ Connessione riuscita! LRS risponde correttamente. xAPI version: ' . $version ] );
    } elseif ( $code === 401 ) {
        wp_send_json( [ 'success' => false, 'message' => '❌ Credenziali non valide (401). Controlla username e password.' ] );
    } else {
        wp_send_json( [ 'success' => false, 'message' => '❌ Il server ha risposto con codice HTTP ' . $code . '. Controlla l\'endpoint.' ] );
    }
} );


// ═══════════════════════════════════════════════════════════════════════════
//  INIEZIONE SCRIPT H5P
// ═══════════════════════════════════════════════════════════════════════════

add_filter( 'h5p_alter_library_scripts', 'h5pxapi_inject_scripts', 10, 3 );

function h5pxapi_inject_scripts( &$scripts, $libraries, $embed_type ) {
    // Inietta solo nell'embed di fruizione, non nell'editor H5P.
    // L'editor passa $embed_type = 'editor', il player passa 'div' o 'iframe'.
    if ( $embed_type === 'editor' ) {
        return $scripts;
    }

    // Genera il file config.js statico se non esiste o è scaduto
    h5pxapi_generate_config_file();

    $scripts[] = (object) [
        'path'    => H5PXAPI_PLUGIN_URL . 'js/config.js',
        'version' => '?ver=' . md5( h5pxapi_get('lrs_endpoint') . h5pxapi_get('lrs_username') ),
    ];
    $scripts[] = (object) [
        'path'    => H5PXAPI_PLUGIN_URL . 'js/tracker.js',
        'version' => '?ver=' . H5PXAPI_VERSION,
    ];
    return $scripts;
}

// Genera js/config.js come file statico con le credenziali correnti.
// Viene rigenerato ogni volta che le impostazioni cambiano.
function h5pxapi_generate_config_file() {
    $user       = wp_get_current_user();
    $actor_name = $user->ID ? $user->display_name : '';
    $actor_mbox = $user->ID ? 'mailto:' . $user->user_email : '';
    $auth       = base64_encode( h5pxapi_get('lrs_username') . ':' . h5pxapi_get('lrs_password') );
    $opts       = get_option( H5PXAPI_OPTION_KEY, [] );
    $debug      = ( $opts['debug'] ?? '0' ) === '1' ? 'true' : 'false';

    $js = "/* H5P xAPI Enhanced — config (auto-generato) */
";
    $js .= "window.H5PxAPIConfig = {
";
    $js .= "  lrsEndpoint: " . json_encode( rtrim( h5pxapi_get('lrs_endpoint'), '/' ) ) . ",
";
    $js .= "  lrsAuth:     " . json_encode( $auth ) . ",
";
    $js .= "  actorName:   " . json_encode( $actor_name ) . ",
";
    $js .= "  actorMbox:   " . json_encode( $actor_mbox ) . ",
";
    $js .= "  homepage:    " . json_encode( h5pxapi_get('homepage', get_site_url()) ) . ",
";
    $js .= "  debug:       " . $debug . "
";
    $js .= "};
";

    $file_path = H5PXAPI_PLUGIN_DIR . 'js/config.js';
    file_put_contents( $file_path, $js );
}

// Rigenera config.js ogni volta che le impostazioni vengono salvate
add_action( 'update_option_' . H5PXAPI_OPTION_KEY, 'h5pxapi_generate_config_file' );

// ═══════════════════════════════════════════════════════════════════════════
//  LINK RAPIDO "Impostazioni" nella lista plugin
// ═══════════════════════════════════════════════════════════════════════════

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
    $settings_link = '<a href="' . admin_url( 'options-general.php?page=h5pxapi-settings' ) . '">Impostazioni</a>';
    array_unshift( $links, $settings_link );
    return $links;
} );
