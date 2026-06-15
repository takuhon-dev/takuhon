<?php
/**
 * The `takuhon/profile` Gutenberg block.
 *
 * @package Takuhon
 */

namespace Takuhon;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the `takuhon/profile` block and renders it server-side.
 *
 * The profile is a self-contained, full-page document (its own design), so the
 * block embeds it in an isolated iframe rather than injecting it into the host
 * page (which would mix takuhon's design with the theme's CSS):
 *
 *   - **local** — iframes {@see Public_Api}'s `/page` route, which serves the
 *     stored server-rendered HTML for the request's locale. The page-level
 *     JSON-LD is also emitted into the host page so structured data is
 *     discoverable without crawling the iframe.
 *   - **remote** — iframes the `apiUrl` the editor configured (another
 *     takuhon deployment's server-rendered `/`).
 *
 * The HTML the iframe shows is produced entirely by `@takuhon/core` /
 * `@takuhon/api`; this class only wires the block and builds the iframe.
 */
final class Block {

	/**
	 * Editor script handle.
	 */
	const EDITOR_HANDLE = 'takuhon-profile-editor';

	/**
	 * The data store.
	 *
	 * @var Store
	 */
	private $store;

	/**
	 * @param Store $store The data store.
	 */
	public function __construct( Store $store ) {
		$this->store = $store;
	}

	/**
	 * Register the block on `init`.
	 */
	public function register(): void {
		add_action( 'init', array( $this, 'register_block' ) );
	}

	/**
	 * Register the editor script and the block type (server-rendered).
	 */
	public function register_block(): void {
		wp_register_script(
			self::EDITOR_HANDLE,
			TAKUHON_PLUGIN_URL . 'blocks/takuhon-profile/editor.js',
			array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n' ),
			TAKUHON_VERSION,
			true
		);

		register_block_type(
			TAKUHON_PLUGIN_DIR . 'blocks/takuhon-profile',
			array( 'render_callback' => array( $this, 'render' ) )
		);
	}

	/**
	 * Render the block. Returns the markup inserted into the page content.
	 *
	 * @param array $attributes Block attributes (`mode`, `apiUrl`).
	 */
	public function render( $attributes ): string {
		$attributes = is_array( $attributes ) ? $attributes : array();
		$mode       = ( isset( $attributes['mode'] ) && 'remote' === $attributes['mode'] ) ? 'remote' : 'local';

		if ( 'remote' === $mode ) {
			$url = isset( $attributes['apiUrl'] ) ? trim( (string) $attributes['apiUrl'] ) : '';
			if ( '' === $url ) {
				return $this->placeholder( __( 'Set a takuhon API URL for this block.', 'takuhon' ) );
			}

			return $this->iframe( $url );
		}

		if ( ! $this->store->has_profile() ) {
			return $this->placeholder( __( 'No takuhon profile has been published yet.', 'takuhon' ) );
		}

		$src = add_query_arg( 'embed', '1', rest_url( Public_Api::NAMESPACE . '/page' ) );

		return $this->json_ld() . $this->iframe( $src );
	}

	/**
	 * The page-level JSON-LD script for the default locale, for SEO. The visual
	 * profile lives in the iframe; this surfaces the structured data in the host
	 * page itself.
	 */
	private function json_ld(): string {
		$jsonld = $this->store->get_jsonld( null );
		if ( null === $jsonld ) {
			return '';
		}

		return '<script type="application/ld+json">' . wp_json_encode( $jsonld ) . '</script>';
	}

	/**
	 * A responsive, isolated iframe for the given source URL.
	 */
	private function iframe( string $src ): string {
		return sprintf(
			'<iframe src="%s" title="%s" loading="lazy" style="width:100%%;height:80vh;border:0;"></iframe>',
			esc_url( $src ),
			esc_attr__( 'Takuhon profile', 'takuhon' )
		);
	}

	/**
	 * A small message shown when there is nothing to embed yet.
	 */
	private function placeholder( string $message ): string {
		return '<div class="takuhon-block-placeholder"><p>' . esc_html( $message ) . '</p></div>';
	}
}
