<?php
/**
 * The main plugin class.
 *
 * @package Takuhon
 */

namespace Takuhon;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Plugin orchestrator.
 *
 * A single instance is created on `plugins_loaded`. It owns the plugin
 * lifecycle and, in later phases, wires up the storage layer, the public and
 * admin REST routes, and the Gutenberg block. This skeleton only establishes
 * the singleton and the `init` hook so the bootstrap is observable and inert.
 */
final class Plugin {

	/**
	 * The single shared instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * The data store.
	 *
	 * @var Store
	 */
	private $store;

	/**
	 * Return the shared instance, creating it on first call.
	 */
	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Wire WordPress hooks. Private so the only entry point is {@see instance()}.
	 */
	private function __construct() {
		require_once TAKUHON_PLUGIN_DIR . 'includes/class-takuhon-store.php';
		require_once TAKUHON_PLUGIN_DIR . 'includes/class-takuhon-public-api.php';
		require_once TAKUHON_PLUGIN_DIR . 'includes/class-takuhon-admin.php';

		$this->store = new Store();

		add_action( 'init', array( $this, 'init' ) );
	}

	/**
	 * The shared data store.
	 */
	public function store(): Store {
		return $this->store;
	}

	/**
	 * Runtime initialisation.
	 *
	 * Registers the public read surface. The admin screen and the Gutenberg
	 * block are wired up in subsequent phases.
	 */
	public function init(): void {
		( new Public_Api( $this->store ) )->register();
		( new Admin( $this->store ) )->register();
	}
}
