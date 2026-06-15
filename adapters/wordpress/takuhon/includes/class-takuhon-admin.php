<?php
/**
 * The admin screen and the authenticated admin REST endpoints.
 *
 * @package Takuhon
 */

namespace Takuhon;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wires the admin menu page, enqueues its React bundle, and registers the
 * authenticated admin REST routes.
 *
 * The admin React app (built into `build/admin.js`) is where the takuhon
 * profile is edited. It runs `@takuhon/core` and `@takuhon/api` in the browser
 * to validate the profile and derive the public bundle (privacy-filtered
 * profiles, JSON-LD, and per-locale HTML), then POSTs both the canonical master
 * and the derived bundle to {@see Admin::rest_publish()}. This class never
 * derives anything itself — it only reads/writes through the {@see Store}.
 *
 * Admin routes (require the `manage_options` capability and a valid REST nonce):
 *   - `GET  /wp-json/takuhon/v1/admin/profile` — the canonical master profile.
 *   - `POST /wp-json/takuhon/v1/admin/publish` — persist `{ master, public }`.
 */
final class Admin {

	/**
	 * Admin menu slug / REST-nonce-bound page identifier.
	 */
	const MENU_SLUG = 'takuhon';

	/**
	 * Script handle for the admin bundle.
	 */
	const SCRIPT_HANDLE = 'takuhon-admin';

	/**
	 * The data store.
	 *
	 * @var Store
	 */
	private $store;

	/**
	 * The admin page's hook suffix, captured when the menu is added.
	 *
	 * @var string
	 */
	private $page_hook = '';

	/**
	 * @param Store $store The data store.
	 */
	public function __construct( Store $store ) {
		$this->store = $store;
	}

	/**
	 * Register the admin menu, the asset enqueue, and the admin REST routes.
	 */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Add the top-level Takuhon admin page.
	 */
	public function add_menu(): void {
		$this->page_hook = (string) add_menu_page(
			__( 'Takuhon', 'takuhon' ),
			__( 'Takuhon', 'takuhon' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_page' ),
			'dashicons-id'
		);
	}

	/**
	 * Render the admin page shell. The React app mounts into the root node.
	 */
	public function render_page(): void {
		echo '<div class="wrap"><h1>';
		echo esc_html__( 'Takuhon', 'takuhon' );
		echo '</h1><div id="takuhon-admin-root"></div></div>';
	}

	/**
	 * Enqueue the admin bundle on the Takuhon page only, and hand it the REST
	 * base URL and a nonce.
	 *
	 * @param string $hook The current admin page hook suffix.
	 */
	public function enqueue( $hook ): void {
		if ( $hook !== $this->page_hook ) {
			return;
		}

		wp_enqueue_script(
			self::SCRIPT_HANDLE,
			TAKUHON_PLUGIN_URL . 'build/admin.js',
			array(),
			TAKUHON_VERSION,
			true
		);

		wp_localize_script(
			self::SCRIPT_HANDLE,
			'TAKUHON_ADMIN',
			array(
				'restUrl' => esc_url_raw( rest_url( Public_Api::NAMESPACE ) ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	/**
	 * Register the authenticated admin routes.
	 */
	public function register_routes(): void {
		$guard = array( $this, 'can_manage' );

		register_rest_route(
			Public_Api::NAMESPACE,
			'/admin/profile',
			array(
				'methods'             => 'GET',
				'permission_callback' => $guard,
				'callback'            => array( $this, 'rest_get_master' ),
			)
		);
		register_rest_route(
			Public_Api::NAMESPACE,
			'/admin/publish',
			array(
				'methods'             => 'POST',
				'permission_callback' => $guard,
				'callback'            => array( $this, 'rest_publish' ),
			)
		);
	}

	/**
	 * Permission callback: only users who can manage options.
	 */
	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * `GET /admin/profile` — return the canonical master profile, or `{}` when
	 * none is saved.
	 *
	 * @param \WP_REST_Request $request The request.
	 * @return \WP_REST_Response
	 */
	public function rest_get_master( $request ) {
		$master = $this->store->get_master();

		return rest_ensure_response( null === $master ? new \stdClass() : $master );
	}

	/**
	 * `POST /admin/publish` — persist the canonical master and its derived
	 * public bundle. The browser has already validated and derived both.
	 *
	 * @param \WP_REST_Request $request The request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_publish( $request ) {
		$master = $request->get_param( 'master' );
		$public = $request->get_param( 'public' );

		if ( ! is_array( $master ) || ! is_array( $public ) ) {
			return new \WP_Error(
				'takuhon_invalid_payload',
				__( 'Expected a JSON object with "master" and "public" properties.', 'takuhon' ),
				array( 'status' => 400 )
			);
		}

		$this->store->save( $master, $public );

		$profiles = ( isset( $public['profiles'] ) && is_array( $public['profiles'] ) ) ? $public['profiles'] : array();

		return rest_ensure_response(
			array(
				'published' => true,
				'locales'   => array_keys( $profiles ),
			)
		);
	}
}
