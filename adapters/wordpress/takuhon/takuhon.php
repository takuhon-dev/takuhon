<?php
/**
 * Plugin Name:       Takuhon
 * Plugin URI:        https://github.com/takuhon-dev/takuhon
 * Description:       Host a takuhon profile on WordPress — edit your takuhon.json and serve the public profile via a Gutenberg block and REST API.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            Takuhon contributors
 * Author URI:        https://github.com/takuhon-dev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       takuhon
 *
 * Takuhon — a self-hosted, portable profile/links site.
 * Copyright (C) 2026 Takuhon contributors
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * @package Takuhon
 */

// Refuse to run outside of WordPress: a direct request to this file must not
// execute any logic.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( defined( 'TAKUHON_VERSION' ) ) {
	// Another copy of the plugin is already loaded; do nothing.
	return;
}

define( 'TAKUHON_VERSION', '0.1.0' );
define( 'TAKUHON_PLUGIN_FILE', __FILE__ );
define( 'TAKUHON_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'TAKUHON_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once TAKUHON_PLUGIN_DIR . 'includes/class-takuhon-plugin.php';

// Boot the plugin once WordPress has loaded. Feature wiring (storage, REST
// routes, and the Gutenberg block) is added in later phases; this skeleton
// only establishes the bootstrap and the singleton.
add_action( 'plugins_loaded', array( \Takuhon\Plugin::class, 'instance' ) );
