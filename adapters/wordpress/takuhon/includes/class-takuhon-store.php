<?php
/**
 * Persistence for the takuhon profile and its derived public artifacts.
 *
 * @package Takuhon
 */

namespace Takuhon;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Stores a takuhon profile in two WordPress options.
 *
 * The canonical (private) `takuhon.json` and the derived public artifacts are
 * deliberately kept in separate options:
 *
 *   - {@see Store::OPTION_MASTER} — the canonical profile. Private. Only the
 *     authenticated admin endpoints read it. The public surface must never
 *     read this option.
 *   - {@see Store::OPTION_PUBLIC} — the derived bundle the public surface
 *     serves: per-locale privacy-filtered profiles and JSON-LD, a
 *     server-rendered HTML page per locale, the locale-independent canonical
 *     public profile, the JSON Schema, and metadata.
 *
 * All derivation (validate / normalize / `resolveLocale` /
 * `applyPublicPrivacyFilter` / JSON-LD / HTML rendering) happens in the admin
 * browser using `@takuhon/core` and `@takuhon/api` and is handed to
 * {@see Store::save()} ready to serve. This class performs no takuhon-specific
 * logic; it only stores, selects a locale among the ones already derived, and
 * returns data. Keeping the master in its own option means a bug in public
 * serving cannot structurally reach the private profile.
 *
 * Expected shape of the public bundle handed to {@see save()}:
 *
 *   [
 *     'profiles'  => [ locale => [ 'data' => array, 'meta' => array ] ],
 *     'jsonld'    => [ locale => array ],
 *     'pages'     => [ locale => string (HTML) ],
 *     'canonical' => array,   // applyPublicPrivacyFilter(master), locale-independent
 *     'schema'    => array,   // @takuhon/core schema.json
 *     'meta'      => [ 'locales' => string[], 'default_locale' => string,
 *                      'schema_version' => string, 'generated_at' => string ],
 *   ]
 */
final class Store {

	/**
	 * Option holding the canonical (private) takuhon.json.
	 */
	const OPTION_MASTER = 'takuhon_master';

	/**
	 * Option holding the derived public bundle.
	 */
	const OPTION_PUBLIC = 'takuhon_public';

	/**
	 * Persist the canonical profile and its derived public bundle together.
	 *
	 * @param array $master The canonical takuhon.json (private).
	 * @param array $public The derived public bundle (see the class docblock).
	 */
	public function save( array $master, array $public ): void {
		update_option( self::OPTION_MASTER, $master, false );
		update_option( self::OPTION_PUBLIC, $this->normalize_public( $public ), false );
	}

	/**
	 * Whether a profile has been saved.
	 */
	public function has_profile(): bool {
		return is_array( get_option( self::OPTION_MASTER, null ) );
	}

	/**
	 * Return the canonical (private) profile, or null if none is saved.
	 *
	 * Only the authenticated admin endpoints may call this. The public surface
	 * must not expose the master profile.
	 */
	public function get_master(): ?array {
		$master = get_option( self::OPTION_MASTER, null );

		return is_array( $master ) ? $master : null;
	}

	/**
	 * Return the privacy-filtered, locale-resolved public profile envelope
	 * (`[ 'data' => ..., 'meta' => ... ]`) for the requested locale, or null
	 * when no profile is saved.
	 *
	 * The requested locale is resolved against the locales the admin already
	 * derived ({@see resolve_locale()}); this is selection, not rendering.
	 */
	public function get_profile( ?string $requested = null ): ?array {
		$profiles = $this->public_part( 'profiles' );
		if ( ! is_array( $profiles ) || array() === $profiles ) {
			return null;
		}

		$locale  = $this->resolve_locale( $requested );
		$profile = ( null !== $locale && isset( $profiles[ $locale ] ) ) ? $profiles[ $locale ] : null;

		return is_array( $profile ) ? $profile : null;
	}

	/**
	 * Return the JSON-LD document for the requested locale, or null if absent.
	 */
	public function get_jsonld( ?string $requested = null ): ?array {
		$by_locale = $this->public_part( 'jsonld' );
		if ( ! is_array( $by_locale ) || array() === $by_locale ) {
			return null;
		}

		$locale = $this->resolve_locale( $requested );
		$ld     = ( null !== $locale && isset( $by_locale[ $locale ] ) ) ? $by_locale[ $locale ] : null;

		return is_array( $ld ) ? $ld : null;
	}

	/**
	 * Return the server-rendered HTML for the requested locale, or null.
	 */
	public function get_page( ?string $requested = null ): ?string {
		$pages = $this->public_part( 'pages' );
		if ( ! is_array( $pages ) || array() === $pages ) {
			return null;
		}

		$locale = $this->resolve_locale( $requested );
		$html   = ( null !== $locale && isset( $pages[ $locale ] ) ) ? $pages[ $locale ] : null;

		return is_string( $html ) ? $html : null;
	}

	/**
	 * Return the locale-independent canonical public profile (the body served
	 * at `/takuhon.json`), or null if none is saved.
	 */
	public function get_canonical(): ?array {
		$canonical = $this->public_part( 'canonical' );

		return is_array( $canonical ) ? $canonical : null;
	}

	/**
	 * Return the JSON Schema, or null if none is saved.
	 */
	public function get_schema(): ?array {
		$schema = $this->public_part( 'schema' );

		return is_array( $schema ) ? $schema : null;
	}

	/**
	 * Return the public bundle metadata (locales, default locale, etc.).
	 *
	 * @return array<string, mixed>
	 */
	public function get_meta(): array {
		$meta = $this->public_part( 'meta' );

		return is_array( $meta ) ? $meta : array();
	}

	/**
	 * Return the list of available locales, default locale first when known.
	 *
	 * @return string[]
	 */
	public function get_locales(): array {
		$meta    = $this->get_meta();
		$locales = isset( $meta['locales'] ) && is_array( $meta['locales'] ) ? array_values( $meta['locales'] ) : array();

		return array_values( array_filter( $locales, 'is_string' ) );
	}

	/**
	 * Return the default locale, or null if unknown.
	 */
	public function get_default_locale(): ?string {
		$meta = $this->get_meta();

		return isset( $meta['default_locale'] ) && is_string( $meta['default_locale'] ) ? $meta['default_locale'] : null;
	}

	/**
	 * Resolve a requested locale to one the admin already derived.
	 *
	 * Selection only — never falls back to rendering. Tries an exact match,
	 * then a BCP-47 primary-subtag match (e.g. `en-US` -> `en`), then the
	 * default locale, then the first available locale. Returns null when no
	 * locales are available.
	 */
	public function resolve_locale( ?string $requested ): ?string {
		$available = $this->get_locales();
		if ( array() === $available ) {
			return null;
		}

		if ( is_string( $requested ) && '' !== $requested ) {
			$wanted = strtolower( $requested );
			foreach ( $available as $locale ) {
				if ( strtolower( $locale ) === $wanted ) {
					return $locale;
				}
			}

			$primary = strtolower( strtok( $requested, '-' ) );
			foreach ( $available as $locale ) {
				if ( strtolower( strtok( $locale, '-' ) ) === $primary ) {
					return $locale;
				}
			}
		}

		$default = $this->get_default_locale();
		if ( null !== $default && in_array( $default, $available, true ) ) {
			return $default;
		}

		return $available[0];
	}

	/**
	 * Remove both the canonical profile and the derived bundle.
	 */
	public function clear(): void {
		delete_option( self::OPTION_MASTER );
		delete_option( self::OPTION_PUBLIC );
	}

	/**
	 * Read one key from the stored public bundle.
	 *
	 * @return mixed|null The value, or null when no bundle or key is present.
	 */
	private function public_part( string $key ) {
		$public = get_option( self::OPTION_PUBLIC, null );

		if ( ! is_array( $public ) || ! array_key_exists( $key, $public ) ) {
			return null;
		}

		return $public[ $key ];
	}

	/**
	 * Keep only the recognised keys of the public bundle, so an unexpected
	 * payload cannot smuggle extra data into the served surface.
	 *
	 * @param array $public The incoming public bundle.
	 * @return array<string, mixed>
	 */
	private function normalize_public( array $public ): array {
		$allowed    = array( 'profiles', 'jsonld', 'pages', 'canonical', 'schema', 'meta' );
		$normalized = array();

		foreach ( $allowed as $key ) {
			if ( array_key_exists( $key, $public ) ) {
				$normalized[ $key ] = $public[ $key ];
			}
		}

		return $normalized;
	}
}
