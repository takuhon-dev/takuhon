<?php
/**
 * Local developer harness for the WordPress adapter's store and public read
 * surface. Run with `php tests/run.php` (or `pnpm --filter @takuhon/wordpress
 * test:php`). Not a CI gate — PHP integration testing is wp-env based and
 * deferred per the adapter design.
 *
 * @package Takuhon
 */

require_once __DIR__ . '/wp-stubs.php';
require_once __DIR__ . '/../takuhon/includes/class-takuhon-store.php';
require_once __DIR__ . '/../takuhon/includes/class-takuhon-public-api.php';
require_once __DIR__ . '/../takuhon/includes/class-takuhon-admin.php';

use Takuhon\Admin;
use Takuhon\Public_Api;
use Takuhon\Store;

$failures = 0;
$count    = 0;

function check( string $label, bool $ok ): void {
	global $failures, $count;
	++$count;
	if ( $ok ) {
		echo "  PASS  {$label}\n";
	} else {
		++$failures;
		echo "  FAIL  {$label}\n";
	}
}

/** Reset the in-memory option store between cases. */
function reset_options(): void {
	$GLOBALS['__takuhon_options'] = array();
}

// A private field that exists in the master but is absent from every derived
// public artifact. It must never appear in the public option.
const PRIVATE_MARKER = 'TOP_SECRET_PRIVATE_NOTE';

function sample_master(): array {
	return array(
		'schemaVersion' => '0.6.0',
		'profile'       => array( 'name' => 'Ada Lovelace' ),
		'private_note'  => PRIVATE_MARKER,
		'meta'          => array( 'updatedAt' => '2026-06-15T00:00:00Z' ),
	);
}

function sample_public(): array {
	return array(
		'profiles'  => array(
			'en' => array(
				'data' => array(
					'schemaVersion'  => '0.6.0',
					'resolvedLocale' => 'en',
					'profile'        => array( 'name' => 'Ada Lovelace' ),
				),
				'meta' => array(
					'schemaVersion' => '0.6.0',
					'locale'        => 'en',
					'updatedAt'     => '2026-06-15T00:00:00Z',
				),
			),
			'ja' => array(
				'data' => array(
					'schemaVersion'  => '0.6.0',
					'resolvedLocale' => 'ja',
					'profile'        => array( 'name' => 'エイダ・ラブレス' ),
				),
				'meta' => array(
					'schemaVersion' => '0.6.0',
					'locale'        => 'ja',
					'updatedAt'     => '2026-06-15T00:00:00Z',
				),
			),
		),
		'jsonld'    => array(
			'en' => array(
				'@context' => 'https://schema.org',
				'@type'    => 'Person',
				'name'     => 'Ada Lovelace',
			),
			'ja' => array(
				'@context' => 'https://schema.org',
				'@type'    => 'Person',
				'name'     => 'エイダ・ラブレス',
			),
		),
		'pages'     => array(
			'en' => '<!DOCTYPE html><html lang="en"><body>Ada Lovelace</body></html>',
			'ja' => '<!DOCTYPE html><html lang="ja"><body>エイダ・ラブレス</body></html>',
		),
		'canonical' => array(
			'schemaVersion' => '0.6.0',
			'profile'       => array( 'name' => 'Ada Lovelace' ),
		),
		'schema'    => array(
			'$id'  => 'https://takuhon.dev/schema/0.6.0',
			'type' => 'object',
		),
		'meta'      => array(
			'locales'        => array( 'en', 'ja' ),
			'default_locale' => 'en',
			'schema_version' => '0.6.0',
			'generated_at'   => '2026-06-15T00:00:00Z',
		),
	);
}

echo "Empty store\n";
reset_options();
$store = new Store();
$api   = new Public_Api( $store );
check( 'has_profile() is false', false === $store->has_profile() );
check( 'get_master() is null', null === $store->get_master() );
check( 'get_profile() is null', null === $store->get_profile( 'en' ) );
check( 'get_jsonld() is null', null === $store->get_jsonld( 'en' ) );
check( 'get_schema() is null', null === $store->get_schema() );
check( 'get_canonical() is null', null === $store->get_canonical() );
check( 'get_page() is null', null === $store->get_page( 'en' ) );
check( 'resolve_locale() is null with no locales', null === $store->resolve_locale( 'en' ) );

$empty_req = new WP_REST_Request();
check( 'rest_profile() is a WP_Error', $api->rest_profile( $empty_req ) instanceof WP_Error );
check( 'rest_profile() 404 status', 404 === ( $api->rest_profile( $empty_req )->get_error_data()['status'] ?? 0 ) );
$pretty = $api->resolve_pretty_path( 'takuhon.json' );
check( '/takuhon.json is 404 when empty', is_array( $pretty ) && 404 === $pretty['status'] );

echo "\nAfter save()\n";
reset_options();
$store = new Store();
$api   = new Public_Api( $store );
$store->save( sample_master(), sample_public() );

check( 'has_profile() is true', true === $store->has_profile() );
check( 'get_master() returns the master', PRIVATE_MARKER === ( $store->get_master()['private_note'] ?? null ) );

// The single strongest invariant: nothing the public surface can read may
// contain the private master field.
$public_blob = json_encode( get_option( Store::OPTION_PUBLIC ) );
check( 'PRIVACY: private field absent from the public option', false === strpos( $public_blob, PRIVATE_MARKER ) );

check( 'get_profile("en") returns the en envelope', 'en' === ( $store->get_profile( 'en' )['data']['resolvedLocale'] ?? null ) );
check( 'get_profile("ja") returns the ja envelope', 'ja' === ( $store->get_profile( 'ja' )['data']['resolvedLocale'] ?? null ) );
check( 'get_profile("en-US") resolves to en (primary subtag)', 'en' === ( $store->get_profile( 'en-US' )['data']['resolvedLocale'] ?? null ) );
check( 'get_profile("fr") falls back to default en', 'en' === ( $store->get_profile( 'fr' )['data']['resolvedLocale'] ?? null ) );
check( 'get_profile(null) uses default en', 'en' === ( $store->get_profile( null )['data']['resolvedLocale'] ?? null ) );

check( 'get_locales() is [en, ja]', array( 'en', 'ja' ) === $store->get_locales() );
check( 'get_default_locale() is en', 'en' === $store->get_default_locale() );
check( 'get_page("ja") returns ja HTML', is_string( $store->get_page( 'ja' ) ) && str_contains( $store->get_page( 'ja' ), 'lang="ja"' ) );

// REST callbacks.
$req_ja = new WP_REST_Request();
$req_ja->set_param( 'locale', 'ja' );
$resp = $api->rest_profile( $req_ja );
check( 'rest_profile(ja) is a WP_REST_Response', $resp instanceof WP_REST_Response );
check( 'rest_profile(ja) returns the ja profile', 'ja' === ( $resp->get_data()['data']['resolvedLocale'] ?? null ) );
check( 'PRIVACY: rest_profile data has no private field', false === strpos( json_encode( $resp->get_data() ), PRIVATE_MARKER ) );

$req_accept = new WP_REST_Request();
$req_accept->set_header( 'accept_language', 'ja,en;q=0.8' );
check( 'rest_profile resolves locale from Accept-Language', 'ja' === ( $api->rest_profile( $req_accept )->get_data()['data']['resolvedLocale'] ?? null ) );

$ld = $api->rest_jsonld( ( function () {
	$r = new WP_REST_Request();
	$r->set_param( 'locale', 'en' );
	return $r;
} )() );
check( 'rest_jsonld(en) returns the en JSON-LD', 'Ada Lovelace' === ( $ld->get_data()['name'] ?? null ) );

$schema_resp = $api->rest_schema( new WP_REST_Request() );
check( 'rest_schema() returns the schema', 'object' === ( $schema_resp->get_data()['type'] ?? null ) );

// Pretty paths.
$canonical = $api->resolve_pretty_path( 'takuhon.json' );
check( '/takuhon.json is 200 after save', is_array( $canonical ) && 200 === $canonical['status'] );
check( '/takuhon.json body is the canonical profile', 'Ada Lovelace' === ( $canonical['body']['profile']['name'] ?? null ) );
check( 'PRIVACY: /takuhon.json has no private field', false === strpos( json_encode( $canonical['body'] ), PRIVATE_MARKER ) );

$well_known = $api->resolve_pretty_path( '.well-known/takuhon.json' );
check( '/.well-known/takuhon.json is 200', is_array( $well_known ) && 200 === $well_known['status'] );
check( 'well-known advertises schemaVersion', '0.6.0' === ( $well_known['body']['schemaVersion'] ?? null ) );
check( 'well-known advertises a profile URL', str_contains( (string) ( $well_known['body']['profile'] ?? '' ), '/takuhon/v1/profile' ) );
check( 'unknown pretty path is null', null === $api->resolve_pretty_path( 'something/else' ) );

echo "\nnormalize_public() drops unknown keys\n";
reset_options();
$store = new Store();
$store->save( sample_master(), array_merge( sample_public(), array( 'master_leak' => PRIVATE_MARKER ) ) );
$stored_keys = array_keys( get_option( Store::OPTION_PUBLIC ) );
check( 'unknown key not stored', ! in_array( 'master_leak', $stored_keys, true ) );
check( 'PRIVACY: leaked key value absent from public option', false === strpos( json_encode( get_option( Store::OPTION_PUBLIC ) ), PRIVATE_MARKER ) );

echo "\nAdmin REST\n";
reset_options();
$store = new Store();
$admin = new Admin( $store );

$get_empty = $admin->rest_get_master( new WP_REST_Request() );
check( 'admin GET master is empty object when unset', $get_empty->get_data() instanceof stdClass );

$bad = $admin->rest_publish( new WP_REST_Request() );
check( 'admin publish rejects a missing payload', $bad instanceof WP_Error );
check( 'admin publish 400 on bad payload', 400 === ( $bad->get_error_data()['status'] ?? 0 ) );

$publish_req = new WP_REST_Request();
$publish_req->set_param( 'master', sample_master() );
$publish_req->set_param( 'public', sample_public() );
$ok = $admin->rest_publish( $publish_req );
check( 'admin publish returns a response', $ok instanceof WP_REST_Response );
check( 'admin publish reports published locales', array( 'en', 'ja' ) === ( $ok->get_data()['locales'] ?? null ) );
check( 'admin publish persisted the profile', true === $store->has_profile() );
check( 'admin GET master returns the saved master after publish', PRIVATE_MARKER === ( $admin->rest_get_master( new WP_REST_Request() )->get_data()['private_note'] ?? null ) );

// The just-published profile is now served publicly, privacy-filtered.
$public_api = new Public_Api( $store );
$served      = $public_api->rest_profile( new WP_REST_Request() );
check( 'published profile is served publicly', $served instanceof WP_REST_Response );
check( 'PRIVACY: served profile has no private field', false === strpos( json_encode( $served->get_data() ), PRIVATE_MARKER ) );

echo "\nclear()\n";
$store->clear();
check( 'has_profile() false after clear', false === $store->has_profile() );
check( 'public option removed after clear', null === get_option( Store::OPTION_PUBLIC, null ) );

echo "\n" . ( 0 === $failures ? "All {$count} checks passed.\n" : "{$failures} of {$count} checks FAILED.\n" );
exit( 0 === $failures ? 0 : 1 );
