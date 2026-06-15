<?php
/**
 * The public read surface: REST routes and the canonical/well-known JSON paths.
 *
 * @package Takuhon
 */

namespace Takuhon;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Serves the public, unauthenticated read API from the derived bundle.
 *
 * Mirrors the JSON surface of `@takuhon/api`'s public app:
 *
 *   - `GET /wp-json/takuhon/v1/profile`  — locale-resolved, privacy-filtered
 *     profile envelope (`{ data, meta }`).
 *   - `GET /wp-json/takuhon/v1/jsonld`   — locale-resolved JSON-LD.
 *   - `GET /wp-json/takuhon/v1/schema`   — the JSON Schema.
 *   - `GET /takuhon.json`                — the locale-independent canonical
 *     public profile.
 *   - `GET /.well-known/takuhon.json`    — a discovery document of the above.
 *
 * Every response is built from the public bundle only; the private master
 * profile is never read here. The pretty paths (`/takuhon.json` and
 * `/.well-known/takuhon.json`) require pretty permalinks; the `/wp-json/`
 * routes work regardless.
 */
final class Public_Api {

	/**
	 * REST namespace for the public routes.
	 */
	const NAMESPACE = 'takuhon/v1';

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
	 * Register the REST routes and the pretty-path handler.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'parse_request', array( $this, 'handle_pretty_paths' ) );
	}

	/**
	 * Register the `/wp-json/takuhon/v1/*` read routes.
	 */
	public function register_routes(): void {
		$public = array(
			'methods'             => 'GET',
			'permission_callback' => '__return_true',
		);

		register_rest_route(
			self::NAMESPACE,
			'/profile',
			array_merge( $public, array( 'callback' => array( $this, 'rest_profile' ) ) )
		);
		register_rest_route(
			self::NAMESPACE,
			'/jsonld',
			array_merge( $public, array( 'callback' => array( $this, 'rest_jsonld' ) ) )
		);
		register_rest_route(
			self::NAMESPACE,
			'/schema',
			array_merge( $public, array( 'callback' => array( $this, 'rest_schema' ) ) )
		);
	}

	/**
	 * `GET /wp-json/takuhon/v1/profile`.
	 *
	 * @param \WP_REST_Request $request The request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_profile( $request ) {
		$profile = $this->store->get_profile( $this->requested_locale( $request ) );
		if ( null === $profile ) {
			return $this->not_found();
		}

		$response = rest_ensure_response( $profile );
		$response->header( 'Cache-Control', 'public, max-age=300' );

		return $response;
	}

	/**
	 * `GET /wp-json/takuhon/v1/jsonld`.
	 *
	 * @param \WP_REST_Request $request The request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_jsonld( $request ) {
		$jsonld = $this->store->get_jsonld( $this->requested_locale( $request ) );
		if ( null === $jsonld ) {
			return $this->not_found();
		}

		$response = rest_ensure_response( $jsonld );
		$response->header( 'Content-Type', 'application/ld+json; charset=utf-8' );
		$response->header( 'Cache-Control', 'public, max-age=300' );

		return $response;
	}

	/**
	 * `GET /wp-json/takuhon/v1/schema`.
	 *
	 * @param \WP_REST_Request $request The request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_schema( $request ) {
		$schema = $this->store->get_schema();
		if ( null === $schema ) {
			return $this->not_found();
		}

		$response = rest_ensure_response( $schema );
		$response->header( 'Cache-Control', 'public, max-age=3600' );

		return $response;
	}

	/**
	 * Serve `/takuhon.json` and `/.well-known/takuhon.json` from a front-end
	 * request, before WordPress resolves the main query.
	 *
	 * @param \WP $wp The WordPress environment (unused; the path is read from
	 *                the request URI to work regardless of rewrite rules).
	 */
	public function handle_pretty_paths( $wp ): void {
		$resolved = $this->resolve_pretty_path( $this->relative_request_path() );
		if ( null === $resolved ) {
			return;
		}

		$this->send_json( $resolved['body'], $resolved['status'], $resolved['cache'] );
	}

	/**
	 * Resolve a pretty path to a JSON response, or null when the path is not
	 * one this plugin serves. Pure (no output), so it is unit-testable.
	 *
	 * @param string $path The request path relative to home, trimmed of slashes.
	 * @return array{body: array, status: int, cache: string}|null
	 */
	public function resolve_pretty_path( string $path ): ?array {
		if ( 'takuhon.json' === $path ) {
			$canonical = $this->store->get_canonical();
			if ( null === $canonical ) {
				return array(
					'body'   => array( 'error' => 'not_found' ),
					'status' => 404,
					'cache'  => 'no-store',
				);
			}

			return array(
				'body'   => $canonical,
				'status' => 200,
				'cache'  => 'public, max-age=300',
			);
		}

		if ( '.well-known/takuhon.json' === $path ) {
			return array(
				'body'   => $this->discovery_document(),
				'status' => 200,
				'cache'  => 'public, max-age=3600',
			);
		}

		return null;
	}

	/**
	 * Build the `.well-known/takuhon.json` discovery document with absolute
	 * URLs for this site.
	 *
	 * @return array<string, mixed>
	 */
	private function discovery_document(): array {
		$meta = $this->store->get_meta();

		$document = array(
			'schemaUrl' => rest_url( self::NAMESPACE . '/schema' ),
			'profile'   => rest_url( self::NAMESPACE . '/profile' ),
			'jsonld'    => rest_url( self::NAMESPACE . '/jsonld' ),
			'canonical' => home_url( '/takuhon.json' ),
		);

		if ( isset( $meta['schema_version'] ) && is_string( $meta['schema_version'] ) ) {
			$document = array_merge( array( 'schemaVersion' => $meta['schema_version'] ), $document );
		}

		return $document;
	}

	/**
	 * The requested locale: the `locale` query argument, else the first tag of
	 * the `Accept-Language` header, else null.
	 *
	 * @param \WP_REST_Request $request The request.
	 */
	private function requested_locale( $request ): ?string {
		$locale = $request->get_param( 'locale' );
		if ( is_string( $locale ) && '' !== $locale ) {
			return $locale;
		}

		$accept = $request->get_header( 'accept_language' );
		if ( is_string( $accept ) && '' !== $accept ) {
			$first = trim( strtok( $accept, ',;' ) );
			if ( '' !== $first ) {
				return $first;
			}
		}

		return null;
	}

	/**
	 * The request path relative to the WordPress home, without the leading or
	 * trailing slash. Works whether or not the install lives in a subdirectory.
	 */
	private function relative_request_path(): string {
		$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$path        = (string) wp_parse_url( $request_uri, PHP_URL_PATH );

		$home = (string) wp_parse_url( home_url(), PHP_URL_PATH );
		if ( '' !== $home && '/' !== $home && str_starts_with( $path, $home ) ) {
			$path = substr( $path, strlen( $home ) );
		}

		return trim( $path, '/' );
	}

	/**
	 * A 404 for the REST routes.
	 *
	 * @return \WP_Error
	 */
	private function not_found(): \WP_Error {
		return new \WP_Error(
			'takuhon_not_found',
			__( 'No takuhon profile has been published.', 'takuhon' ),
			array( 'status' => 404 )
		);
	}

	/**
	 * Emit a JSON response for a pretty path and stop. Never returns.
	 *
	 * @param array  $body          The response body.
	 * @param int    $status        The HTTP status code.
	 * @param string $cache_control The Cache-Control header value.
	 */
	private function send_json( array $body, int $status, string $cache_control ): void {
		if ( ! headers_sent() ) {
			status_header( $status );
			header( 'Content-Type: application/json; charset=utf-8' );
			header( 'Cache-Control: ' . $cache_control );
		}

		echo wp_json_encode( $body );
		exit;
	}
}
