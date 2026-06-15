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
		add_action( 'init', array( $this, 'init' ) );
	}

	/**
	 * Runtime initialisation.
	 *
	 * Intentionally empty for now. Storage, REST routes, and the block are
	 * registered here in subsequent phases.
	 */
	public function init(): void {
		/* No-op: feature registration is added in later phases. */
	}
}
