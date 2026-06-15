<?php
/**
 * Minimal WordPress stubs for running the plugin's store and public-API logic
 * under the plain PHP CLI, without a WordPress install.
 *
 * This is a local developer harness, not a CI gate (PHP testing is wp-env based
 * and deferred per the adapter design). It exists so the store's master/public
 * separation and the public read surface can be exercised quickly while
 * iterating.
 *
 * @package Takuhon
 */

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** In-memory option store. */
$GLOBALS['__takuhon_options'] = array();

function get_option( $name, $default = false ) {
	return array_key_exists( $name, $GLOBALS['__takuhon_options'] )
		? $GLOBALS['__takuhon_options'][ $name ]
		: $default;
}

function update_option( $name, $value, $autoload = null ) {
	$GLOBALS['__takuhon_options'][ $name ] = $value;

	return true;
}

function delete_option( $name ) {
	unset( $GLOBALS['__takuhon_options'][ $name ] );

	return true;
}

function add_action( $hook, $callback, $priority = 10, $args = 1 ) {
	// No-op: the harness invokes callbacks directly.
}

function register_rest_route( $namespace, $route, $args = array() ) {
	// No-op: the harness invokes the route callbacks directly.
	return true;
}

function __return_true() {
	return true;
}

function current_user_can( $capability, ...$args ) {
	return $GLOBALS['__takuhon_can'] ?? true;
}

function __( $text, $domain = 'default' ) {
	return $text;
}

function rest_ensure_response( $data ) {
	return new WP_REST_Response( $data );
}

function status_header( $code ) {
	// No-op in the harness.
}

function wp_json_encode( $data, $options = 0, $depth = 512 ) {
	return json_encode( $data, $options, $depth );
}

function wp_unslash( $value ) {
	return $value;
}

function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}

function home_url( $path = '' ) {
	return 'https://example.test' . $path;
}

function rest_url( $path = '' ) {
	return 'https://example.test/wp-json/' . ltrim( $path, '/' );
}

function add_query_arg( $key, $value, $url ) {
	$separator = ( false === strpos( $url, '?' ) ) ? '?' : '&';

	return $url . $separator . rawurlencode( $key ) . '=' . rawurlencode( $value );
}

function esc_url( $url ) {
	return $url;
}

function esc_attr( $text ) {
	return $text;
}

function esc_attr__( $text, $domain = 'default' ) {
	return $text;
}

function esc_html( $text ) {
	return $text;
}

function esc_html__( $text, $domain = 'default' ) {
	return $text;
}

function register_block_type( $name, $args = array() ) {
	return true;
}

function wp_register_script( $handle, $src = '', $deps = array(), $ver = false, $args = array() ) {
	return true;
}

class WP_REST_Response {
	private $data;
	private $headers = array();

	public function __construct( $data = null ) {
		$this->data = $data;
	}

	public function header( $key, $value ) {
		$this->headers[ $key ] = $value;
	}

	public function get_data() {
		return $this->data;
	}

	public function get_headers() {
		return $this->headers;
	}
}

class WP_Error {
	private $code;
	private $message;
	private $data;

	public function __construct( $code = '', $message = '', $data = '' ) {
		$this->code    = $code;
		$this->message = $message;
		$this->data    = $data;
	}

	public function get_error_code() {
		return $this->code;
	}

	public function get_error_message() {
		return $this->message;
	}

	public function get_error_data() {
		return $this->data;
	}
}

class WP_REST_Request {
	private $params  = array();
	private $headers = array();

	public function set_param( $key, $value ) {
		$this->params[ $key ] = $value;
	}

	public function get_param( $key ) {
		return $this->params[ $key ] ?? null;
	}

	public function set_header( $key, $value ) {
		$this->headers[ $key ] = $value;
	}

	public function get_header( $key ) {
		return $this->headers[ $key ] ?? null;
	}
}
