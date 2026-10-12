<?php
/**
 * Plugin Name:       Arachnide Connector
 * Plugin URI:        https://github.com/Jacckisback/arachnide-seo-spider
 * Description:       Lets Arachnide SEO Spider read and apply SEO fixes (SEO title, meta description, canonical, noindex, 301 redirects) through the REST API, using Yoast SEO, Rank Math, All in One SEO, SEOPress or Redirection when they are active.
 * Version:           1.0.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            Thierry Gustin
 * Author URI:        https://thierrygustin.com
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       arachnide-connector
 *
 * @package Arachnide_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Routes REST (namespace arachnide/v1), authentifiées par mot de passe d'application (aucun nonce requis) :
 *   GET  /status                       extension SEO active, Redirection, versions
 *   GET  /resolve?url=…                URL publique → { kind: post|term|home, id, subtype, rest_base, rest_namespace }
 *   GET  /meta?kind=post|term&id=…     { seo_title, meta_description, canonical, noindex }
 *   POST /meta { kind, id, field, value }   value null = retour au défaut
 *   GET  /redirect?source=/chemin      { source, target|null }
 *   POST /redirect { source, target }  target null = suppression
 */
final class Arachnide_Connector {
	const VERSION          = '1.0.0';
	const REST_NS          = 'arachnide/v1';
	const REDIRECTS_OPTION = 'arachnide_redirects';

	/** Méta natives utilisées quand aucune extension SEO n'est active. */
	const NATIVE_KEYS = array(
		'seo_title'        => '_arachnide_seo_title',
		'meta_description' => '_arachnide_meta_description',
		'canonical'        => '_arachnide_canonical',
		'noindex'          => '_arachnide_noindex',
	);

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		if ( null === self::seo_plugin() ) {
			add_filter( 'pre_get_document_title', array( __CLASS__, 'filter_title' ), 20 );
			add_filter( 'get_canonical_url', array( __CLASS__, 'filter_canonical' ), 20, 2 );
			add_action( 'wp_head', array( __CLASS__, 'head' ), 1 );
			if ( function_exists( 'wp_robots' ) ) {
				add_filter( 'wp_robots', array( __CLASS__, 'filter_robots' ), 20 );
			}
		}
		if ( ! self::redirection_active() ) {
			add_action( 'template_redirect', array( __CLASS__, 'maybe_redirect' ), 1 );
		}
	}

	// ---------------------------------------------------------------- Détection

	/** @return string|null yoast | rankmath | aioseo | seopress */
	public static function seo_plugin() {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return 'yoast';
		}
		if ( defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath' ) ) {
			return 'rankmath';
		}
		if ( defined( 'AIOSEO_VERSION' ) || function_exists( 'aioseo' ) ) {
			return 'aioseo';
		}
		if ( defined( 'SEOPRESS_VERSION' ) ) {
			return 'seopress';
		}
		return null;
	}

	public static function redirection_active() {
		return defined( 'REDIRECTION_VERSION' );
	}

	// ---------------------------------------------------------------- Routes

	public static function register_routes() {
		register_rest_route(
			self::REST_NS,
			'/status',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'rest_status' ),
				'permission_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
		register_rest_route(
			self::REST_NS,
			'/resolve',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'rest_resolve' ),
				'permission_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
				'args'                => array(
					'url' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
		$object_args = array(
			'kind' => array(
				'type'     => 'string',
				'enum'     => array( 'post', 'term' ),
				'required' => true,
			),
			'id'   => array(
				'type'     => 'integer',
				'minimum'  => 1,
				'required' => true,
			),
		);
		register_rest_route(
			self::REST_NS,
			'/meta',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'rest_get_meta' ),
					'permission_callback' => array( __CLASS__, 'can_edit_object' ),
					'args'                => $object_args,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'rest_set_meta' ),
					'permission_callback' => array( __CLASS__, 'can_edit_object' ),
					'args'                => array_merge(
						$object_args,
						array(
							'field' => array(
								'type'     => 'string',
								'enum'     => array_keys( self::NATIVE_KEYS ),
								'required' => true,
							),
						)
					),
				),
			)
		);
		register_rest_route(
			self::REST_NS,
			'/redirect',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'rest_get_redirect' ),
					'permission_callback' => array( __CLASS__, 'can_manage_redirects' ),
					'args'                => array(
						'source' => array(
							'type'     => 'string',
							'required' => true,
						),
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'rest_set_redirect' ),
					'permission_callback' => array( __CLASS__, 'can_manage_redirects' ),
				),
			)
		);
	}

	public static function can_edit_object( WP_REST_Request $request ) {
		$id = (int) $request['id'];
		if ( 'term' === $request['kind'] ) {
			return current_user_can( 'edit_term', $id );
		}
		return current_user_can( 'edit_post', $id );
	}

	public static function can_manage_redirects() {
		return current_user_can( 'manage_options' );
	}

	public static function rest_status() {
		global $wp_version;
		$seo     = self::seo_plugin();
		$version = null;
		$map     = array(
			'yoast'    => 'WPSEO_VERSION',
			'rankmath' => 'RANK_MATH_VERSION',
			'aioseo'   => 'AIOSEO_VERSION',
			'seopress' => 'SEOPRESS_VERSION',
		);
		if ( $seo && defined( $map[ $seo ] ) ) {
			$version = constant( $map[ $seo ] );
		}
		return rest_ensure_response(
			array(
				'version'              => self::VERSION,
				'wp_version'           => $wp_version,
				'php_version'          => PHP_VERSION,
				'seo_plugin'           => $seo,
				'seo_plugin_version'   => $version,
				'redirects'            => self::redirection_active() ? 'redirection' : 'native',
				'can_manage_redirects' => current_user_can( 'manage_options' ),
				'term_meta'            => 'aioseo' !== $seo || class_exists( '\AIOSEO\Plugin\Pro\Models\Term' ),
			)
		);
	}

	// ---------------------------------------------------------------- Résolution URL → contenu

	private static function normalize_url( $url ) {
		$p = wp_parse_url( (string) $url );
		if ( ! $p ) {
			return '';
		}
		$host = isset( $p['host'] ) ? strtolower( preg_replace( '/^www\./i', '', $p['host'] ) ) : '';
		$path = isset( $p['path'] ) ? rawurldecode( $p['path'] ) : '';
		$path = untrailingslashit( $path );
		$q    = isset( $p['query'] ) ? '?' . $p['query'] : '';
		return $host . $path . $q;
	}

	public static function rest_resolve( WP_REST_Request $request ) {
		$url = esc_url_raw( (string) $request['url'] );
		$n   = self::normalize_url( $url );
		if ( '' === $n ) {
			return new WP_Error( 'arachnide_bad_url', 'Invalid URL.', array( 'status' => 400 ) );
		}

		if ( self::normalize_url( home_url( '/' ) ) === $n ) {
			$front = (int) get_option( 'page_on_front' );
			if ( 'page' === get_option( 'show_on_front' ) && $front ) {
				return rest_ensure_response( self::post_payload( $front ) );
			}
			return rest_ensure_response(
				array(
					'kind' => 'home',
					'id'   => 0,
				)
			);
		}

		$post_id = url_to_postid( $url );
		if ( $post_id ) {
			return rest_ensure_response( self::post_payload( $post_id ) );
		}

		// Termes : dernier segment du chemin = slug, confirmé par le lien canonique du terme.
		$p    = wp_parse_url( $url );
		$segs = array_values( array_filter( explode( '/', isset( $p['path'] ) ? $p['path'] : '' ), 'strlen' ) );
		if ( $segs ) {
			$slug = sanitize_title( rawurldecode( end( $segs ) ) );
			foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $tax ) {
				$term = get_term_by( 'slug', $slug, $tax->name );
				if ( ! $term || is_wp_error( $term ) ) {
					continue;
				}
				$link = get_term_link( $term );
				if ( ! is_wp_error( $link ) && self::normalize_url( $link ) === $n ) {
					return rest_ensure_response(
						array(
							'kind'           => 'term',
							'id'             => (int) $term->term_id,
							'subtype'        => $tax->name,
							'rest_base'      => $tax->show_in_rest ? ( $tax->rest_base ? $tax->rest_base : $tax->name ) : null,
							'rest_namespace' => ! empty( $tax->rest_namespace ) ? $tax->rest_namespace : 'wp/v2',
							'link'           => $link,
						)
					);
				}
			}
		}
		return new WP_Error( 'arachnide_not_found', 'No post, page or term matches this URL.', array( 'status' => 404 ) );
	}

	private static function post_payload( $post_id ) {
		$type = get_post_type_object( get_post_type( $post_id ) );
		return array(
			'kind'           => 'post',
			'id'             => (int) $post_id,
			'subtype'        => $type ? $type->name : null,
			'rest_base'      => ( $type && $type->show_in_rest ) ? ( $type->rest_base ? $type->rest_base : $type->name ) : null,
			'rest_namespace' => ( $type && ! empty( $type->rest_namespace ) ) ? $type->rest_namespace : 'wp/v2',
			'link'           => get_permalink( $post_id ),
		);
	}

	// ---------------------------------------------------------------- Méta SEO

	private static function check_object( $kind, $id ) {
		if ( 'term' === $kind ) {
			$term = get_term( $id );
			if ( ! $term || is_wp_error( $term ) ) {
				return new WP_Error( 'arachnide_not_found', 'Term not found.', array( 'status' => 404 ) );
			}
			return $term;
		}
		$post = get_post( $id );
		if ( ! $post ) {
			return new WP_Error( 'arachnide_not_found', 'Post not found.', array( 'status' => 404 ) );
		}
		return $post;
	}

	public static function rest_get_meta( WP_REST_Request $request ) {
		$kind = (string) $request['kind'];
		$id   = (int) $request['id'];
		$obj  = self::check_object( $kind, $id );
		if ( is_wp_error( $obj ) ) {
			return $obj;
		}
		$out = array();
		foreach ( array_keys( self::NATIVE_KEYS ) as $field ) {
			$v = self::read( $kind, $obj, $field );
			if ( is_wp_error( $v ) ) {
				return $v;
			}
			$out[ $field ] = $v;
		}
		$out['seo_plugin'] = self::seo_plugin();
		return rest_ensure_response( $out );
	}

	public static function rest_set_meta( WP_REST_Request $request ) {
		$kind  = (string) $request['kind'];
		$id    = (int) $request['id'];
		$field = (string) $request['field'];
		$obj   = self::check_object( $kind, $id );
		if ( is_wp_error( $obj ) ) {
			return $obj;
		}
		$params = $request->get_json_params();
		$raw    = is_array( $params ) && array_key_exists( 'value', $params ) ? $params['value'] : $request['value'];
		$value  = self::sanitize( $field, $raw );
		if ( is_wp_error( $value ) ) {
			return $value;
		}
		$res = self::write( $kind, $obj, $field, $value );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		if ( 'term' === $kind ) {
			clean_term_cache( $id );
		} else {
			clean_post_cache( $id );
		}
		return rest_ensure_response( array( $field => self::read( $kind, $obj, $field ) ) );
	}

	private static function sanitize( $field, $value ) {
		if ( null === $value ) {
			return null;
		}
		if ( 'noindex' === $field ) {
			if ( is_bool( $value ) ) {
				return $value;
			}
			if ( in_array( $value, array( 'true', '1', 1 ), true ) ) {
				return true;
			}
			if ( in_array( $value, array( 'false', '0', 0 ), true ) ) {
				return false;
			}
			return new WP_Error( 'arachnide_bad_value', 'noindex must be true, false or null.', array( 'status' => 400 ) );
		}
		if ( ! is_scalar( $value ) ) {
			return new WP_Error( 'arachnide_bad_value', 'Value must be a string or null.', array( 'status' => 400 ) );
		}
		if ( 'canonical' === $field ) {
			$url = esc_url_raw( trim( (string) $value ), array( 'http', 'https' ) );
			if ( '' === $url ) {
				return new WP_Error( 'arachnide_bad_value', 'Canonical must be an absolute http(s) URL.', array( 'status' => 400 ) );
			}
			return $url;
		}
		$text = sanitize_text_field( (string) $value );
		return '' === $text ? null : $text;
	}

	/** Lit get_post_meta / get_term_meta ; chaîne vide → null. */
	private static function meta( $kind, $id, $key ) {
		$v = 'term' === $kind ? get_term_meta( $id, $key, true ) : get_post_meta( $id, $key, true );
		return ( '' === $v || false === $v ) ? null : $v;
	}

	private static function update_meta( $kind, $id, $key, $value ) {
		if ( null === $value ) {
			return 'term' === $kind ? delete_term_meta( $id, $key ) : delete_post_meta( $id, $key );
		}
		// wp_slash : update_*_meta retire les antislashs.
		return 'term' === $kind ? update_term_meta( $id, $key, wp_slash( $value ) ) : update_post_meta( $id, $key, wp_slash( $value ) );
	}

	private static function obj_id( $kind, $obj ) {
		return 'term' === $kind ? (int) $obj->term_id : (int) $obj->ID;
	}

	private static function unsupported( $message ) {
		return new WP_Error( 'arachnide_unsupported', $message, array( 'status' => 501 ) );
	}

	private static function read( $kind, $obj, $field ) {
		$id = self::obj_id( $kind, $obj );
		switch ( self::seo_plugin() ) {
			case 'yoast':
				return self::yoast_read( $kind, $obj, $field );
			case 'rankmath':
				$keys = array(
					'seo_title'        => 'rank_math_title',
					'meta_description' => 'rank_math_description',
					'canonical'        => 'rank_math_canonical_url',
				);
				if ( 'noindex' === $field ) {
					$robots = self::meta( $kind, $id, 'rank_math_robots' );
					if ( ! is_array( $robots ) ) {
						return null;
					}
					if ( in_array( 'noindex', $robots, true ) ) {
						return true;
					}
					return in_array( 'index', $robots, true ) ? false : null;
				}
				return self::meta( $kind, $id, $keys[ $field ] );
			case 'aioseo':
				return self::aioseo_read( $kind, $id, $field );
			case 'seopress':
				$keys = array(
					'seo_title'        => '_seopress_titles_title',
					'meta_description' => '_seopress_titles_desc',
					'canonical'        => '_seopress_robots_canonical',
				);
				if ( 'noindex' === $field ) {
					$v = self::meta( $kind, $id, '_seopress_robots_index' );
					if ( null === $v ) {
						return null;
					}
					return 'yes' === $v;
				}
				return self::meta( $kind, $id, $keys[ $field ] );
			default:
				$v = self::meta( $kind, $id, self::NATIVE_KEYS[ $field ] );
				if ( 'noindex' === $field ) {
					return null === $v ? null : '1' === (string) $v;
				}
				return $v;
		}
	}

	private static function write( $kind, $obj, $field, $value ) {
		$id = self::obj_id( $kind, $obj );
		switch ( self::seo_plugin() ) {
			case 'yoast':
				return self::yoast_write( $kind, $obj, $field, $value );
			case 'rankmath':
				if ( 'noindex' === $field ) {
					$robots = self::meta( $kind, $id, 'rank_math_robots' );
					$robots = is_array( $robots ) ? array_values( array_diff( $robots, array( 'index', 'noindex' ) ) ) : array();
					if ( null !== $value ) {
						array_unshift( $robots, $value ? 'noindex' : 'index' );
					}
					return self::update_meta( $kind, $id, 'rank_math_robots', $robots ? $robots : null );
				}
				$keys = array(
					'seo_title'        => 'rank_math_title',
					'meta_description' => 'rank_math_description',
					'canonical'        => 'rank_math_canonical_url',
				);
				return self::update_meta( $kind, $id, $keys[ $field ], $value );
			case 'aioseo':
				return self::aioseo_write( $kind, $id, $field, $value );
			case 'seopress':
				$keys = array(
					'seo_title'        => '_seopress_titles_title',
					'meta_description' => '_seopress_titles_desc',
					'canonical'        => '_seopress_robots_canonical',
					'noindex'          => '_seopress_robots_index',
				);
				if ( 'noindex' === $field && null !== $value ) {
					// SEOPress ne connaît que « yes » (noindex) ; « no » marque un index explicite pour l'aller-retour.
					$value = $value ? 'yes' : 'no';
				}
				return self::update_meta( $kind, $id, $keys[ $field ], $value );
			default:
				if ( 'noindex' === $field && null !== $value ) {
					$value = $value ? '1' : '0';
				}
				return self::update_meta( $kind, $id, self::NATIVE_KEYS[ $field ], $value );
		}
	}

	// Yoast SEO : méta _yoast_wpseo_* pour les contenus, option wpseo_taxonomy_meta pour les termes.
	// https://github.com/Yoast/wordpress-seo/blob/trunk/src/builders/indexable-post-builder.php
	private static function yoast_read( $kind, $obj, $field ) {
		if ( 'term' === $kind ) {
			$all  = get_option( 'wpseo_taxonomy_meta' );
			$meta = isset( $all[ $obj->taxonomy ][ $obj->term_id ] ) ? $all[ $obj->taxonomy ][ $obj->term_id ] : array();
			$keys = array(
				'seo_title'        => 'wpseo_title',
				'meta_description' => 'wpseo_desc',
				'canonical'        => 'wpseo_canonical',
				'noindex'          => 'wpseo_noindex',
			);
			$v    = isset( $meta[ $keys[ $field ] ] ) ? $meta[ $keys[ $field ] ] : '';
			if ( 'noindex' === $field ) {
				return 'noindex' === $v ? true : ( 'index' === $v ? false : null );
			}
			return '' === $v ? null : $v;
		}
		$keys = array(
			'seo_title'        => '_yoast_wpseo_title',
			'meta_description' => '_yoast_wpseo_metadesc',
			'canonical'        => '_yoast_wpseo_canonical',
			'noindex'          => '_yoast_wpseo_meta-robots-noindex',
		);
		$v    = self::meta( 'post', $obj->ID, $keys[ $field ] );
		if ( 'noindex' === $field ) {
			return '1' === (string) $v ? true : ( '2' === (string) $v ? false : null );
		}
		return $v;
	}

	private static function yoast_write( $kind, $obj, $field, $value ) {
		if ( 'term' === $kind ) {
			$all = get_option( 'wpseo_taxonomy_meta' );
			$all = is_array( $all ) ? $all : array();
			$key = array(
				'seo_title'        => 'wpseo_title',
				'meta_description' => 'wpseo_desc',
				'canonical'        => 'wpseo_canonical',
				'noindex'          => 'wpseo_noindex',
			)[ $field ];
			if ( 'noindex' === $field ) {
				$value = null === $value ? 'default' : ( $value ? 'noindex' : 'index' );
			}
			if ( ! isset( $all[ $obj->taxonomy ][ $obj->term_id ] ) || ! is_array( $all[ $obj->taxonomy ][ $obj->term_id ] ) ) {
				$all[ $obj->taxonomy ][ $obj->term_id ] = array();
			}
			if ( null === $value ) {
				unset( $all[ $obj->taxonomy ][ $obj->term_id ][ $key ] );
			} else {
				$all[ $obj->taxonomy ][ $obj->term_id ][ $key ] = $value;
			}
			update_option( 'wpseo_taxonomy_meta', $all );
			self::yoast_rebuild( $obj->term_id, 'term' );
			return true;
		}
		$keys = array(
			'seo_title'        => '_yoast_wpseo_title',
			'meta_description' => '_yoast_wpseo_metadesc',
			'canonical'        => '_yoast_wpseo_canonical',
			'noindex'          => '_yoast_wpseo_meta-robots-noindex',
		);
		if ( 'noindex' === $field && null !== $value ) {
			$value = $value ? '1' : '2';
		}
		self::update_meta( 'post', $obj->ID, $keys[ $field ], $value );
		self::yoast_rebuild( $obj->ID, 'post' );
		return true;
	}

	/** Yoast lit les indexables (table wp_yoast_indexable) : on reconstruit celui de l'objet modifié. */
	private static function yoast_rebuild( $id, $type ) {
		if ( ! function_exists( 'YoastSEO' ) ) {
			return;
		}
		try {
			$repo      = YoastSEO()->classes->get( 'Yoast\WP\SEO\Repositories\Indexable_Repository' );
			$builder   = YoastSEO()->classes->get( 'Yoast\WP\SEO\Builders\Indexable_Builder' );
			$indexable = $repo->find_by_id_and_type( $id, $type, false );
			$builder->build_for_id_and_type( $id, $type, $indexable ? $indexable : false );
		} catch ( \Throwable $e ) {
			// L'indexable sera reconstruit par Yoast à la prochaine sauvegarde ; les méta sont déjà écrites.
			unset( $e );
		}
	}

	// All in One SEO : tables aioseo_posts / aioseo_terms (Pro) via ses modèles.
	// https://github.com/awesomemotive/all-in-one-seo-pack/blob/master/app/Common/Models/Post.php
	private static function aioseo_model( $kind, $id ) {
		if ( 'term' === $kind ) {
			if ( ! class_exists( '\AIOSEO\Plugin\Pro\Models\Term' ) ) {
				return self::unsupported( 'All in One SEO Lite does not store SEO data for terms (AIOSEO Pro required).' );
			}
			return \AIOSEO\Plugin\Pro\Models\Term::getTerm( $id );
		}
		if ( ! class_exists( '\AIOSEO\Plugin\Common\Models\Post' ) ) {
			return self::unsupported( 'All in One SEO models are not available (unsupported AIOSEO version).' );
		}
		return \AIOSEO\Plugin\Common\Models\Post::getPost( $id );
	}

	private static function aioseo_read( $kind, $id, $field ) {
		$m = self::aioseo_model( $kind, $id );
		if ( is_wp_error( $m ) ) {
			return $m;
		}
		if ( 'noindex' === $field ) {
			if ( ! empty( $m->robots_default ) || ! isset( $m->robots_noindex ) ) {
				return null;
			}
			return (bool) $m->robots_noindex;
		}
		$col = array(
			'seo_title'        => 'title',
			'meta_description' => 'description',
			'canonical'        => 'canonical_url',
		)[ $field ];
		$v   = isset( $m->$col ) ? $m->$col : null;
		return ( null === $v || '' === $v ) ? null : (string) $v;
	}

	private static function aioseo_write( $kind, $id, $field, $value ) {
		$m = self::aioseo_model( $kind, $id );
		if ( is_wp_error( $m ) ) {
			return $m;
		}
		if ( 'term' === $kind ) {
			$m->term_id = $id;
		} else {
			$m->post_id = $id;
		}
		if ( 'noindex' === $field ) {
			$m->robots_default = null === $value ? 1 : 0;
			$m->robots_noindex = $value ? 1 : 0;
		} else {
			$col      = array(
				'seo_title'        => 'title',
				'meta_description' => 'description',
				'canonical'        => 'canonical_url',
			)[ $field ];
			$m->$col = $value;
		}
		$m->save();
		if ( ! empty( $m->lastError ) ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName
			return new WP_Error( 'arachnide_aioseo', 'All in One SEO could not save: ' . $m->lastError, array( 'status' => 500 ) ); // phpcs:ignore WordPress.NamingConventions.ValidVariableName
		}
		return true;
	}

	// ---------------------------------------------------------------- Sortie front (sans extension SEO)

	/** @return array|null [ kind, id ] de l'objet affiché. */
	private static function current_object() {
		if ( is_singular() ) {
			return array( 'post', (int) get_queried_object_id() );
		}
		if ( is_category() || is_tag() || is_tax() ) {
			return array( 'term', (int) get_queried_object_id() );
		}
		return null;
	}

	private static function current_value( $field ) {
		$o = self::current_object();
		if ( ! $o || ! $o[1] ) {
			return null;
		}
		$v = self::meta( $o[0], $o[1], self::NATIVE_KEYS[ $field ] );
		if ( 'noindex' === $field ) {
			return null === $v ? null : '1' === (string) $v;
		}
		return $v;
	}

	public static function filter_title( $title ) {
		$v = self::current_value( 'seo_title' );
		return null !== $v ? $v : $title;
	}

	public static function filter_canonical( $url, $post ) {
		if ( is_singular() && (int) get_queried_object_id() === (int) $post->ID ) {
			$v = self::meta( 'post', $post->ID, self::NATIVE_KEYS['canonical'] );
			if ( null !== $v ) {
				return $v;
			}
		}
		return $url;
	}

	public static function filter_robots( array $robots ) {
		if ( true === self::current_value( 'noindex' ) ) {
			unset( $robots['index'] );
			$robots['noindex'] = true;
			$robots['follow']  = true;
		}
		return $robots;
	}

	public static function head() {
		$desc = self::current_value( 'meta_description' );
		if ( null !== $desc ) {
			echo '<meta name="description" content="' . esc_attr( $desc ) . '" />' . "\n";
		}
		$o = self::current_object();
		// Le cœur n'émet rel=canonical que pour les contenus singuliers (filtré ci-dessus).
		if ( $o && 'term' === $o[0] ) {
			$canonical = self::current_value( 'canonical' );
			if ( null !== $canonical ) {
				echo '<link rel="canonical" href="' . esc_url( $canonical ) . '" />' . "\n";
			}
		}
		if ( ! function_exists( 'wp_robots' ) && true === self::current_value( 'noindex' ) ) {
			echo '<meta name="robots" content="noindex, follow" />' . "\n";
		}
	}

	// ---------------------------------------------------------------- Redirections

	/** Chemin (avec requête) relatif à la racine du domaine, décodé, sans / final. */
	private static function normalize_source( $source ) {
		$source = trim( (string) $source );
		$p      = wp_parse_url( $source );
		if ( false === $p ) {
			return '';
		}
		$path = isset( $p['path'] ) ? $p['path'] : '/';
		$path = '/' . ltrim( rawurldecode( $path ), '/' );
		$path = '/' === $path ? '/' : untrailingslashit( $path );
		return $path . ( isset( $p['query'] ) && '' !== $p['query'] ? '?' . $p['query'] : '' );
	}

	public static function rest_get_redirect( WP_REST_Request $request ) {
		$source = self::normalize_source( $request['source'] );
		if ( '' === $source ) {
			return new WP_Error( 'arachnide_bad_value', 'Invalid source.', array( 'status' => 400 ) );
		}
		if ( self::redirection_active() ) {
			$row = self::redirection_find( $source );
			return rest_ensure_response(
				array(
					'source'  => $source,
					'target'  => $row ? $row->action_data : null,
					'backend' => 'redirection',
				)
			);
		}
		$all = get_option( self::REDIRECTS_OPTION, array() );
		return rest_ensure_response(
			array(
				'source'  => $source,
				'target'  => isset( $all[ $source ] ) ? $all[ $source ] : null,
				'backend' => 'native',
			)
		);
	}

	public static function rest_set_redirect( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		$source = self::normalize_source( isset( $params['source'] ) ? $params['source'] : '' );
		$target = isset( $params['target'] ) ? $params['target'] : null;
		if ( '' === $source || '/' === $source ) {
			return new WP_Error( 'arachnide_bad_value', 'Invalid source (the home page cannot be redirected).', array( 'status' => 400 ) );
		}
		if ( null !== $target ) {
			$target = esc_url_raw( trim( (string) $target ), array( 'http', 'https' ) );
			if ( '' === $target ) {
				return new WP_Error( 'arachnide_bad_value', 'Target must be an absolute http(s) URL.', array( 'status' => 400 ) );
			}
		}

		if ( self::redirection_active() ) {
			$res = self::redirection_write( $source, $target );
			if ( is_wp_error( $res ) ) {
				return $res;
			}
		} else {
			$all = get_option( self::REDIRECTS_OPTION, array() );
			$all = is_array( $all ) ? $all : array();
			if ( null === $target ) {
				unset( $all[ $source ] );
			} else {
				$all[ $source ] = $target;
			}
			update_option( self::REDIRECTS_OPTION, $all, true );
		}
		$r = new WP_REST_Request( 'GET', '/' . self::REST_NS . '/redirect' );
		$r->set_param( 'source', $source );
		return self::rest_get_redirect( $r );
	}

	// Redirection (John Godley) : lecture dans sa table, écriture par son API REST interne.
	// https://redirection.me/developer/rest-api/
	private static function redirection_find( $source ) {
		global $wpdb;
		$table = $wpdb->prefix . 'redirection_items';
		$alt   = '/' === $source ? $source : $source . '/';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT id, url, action_data, group_id FROM {$table} WHERE regex = 0 AND match_type = 'url' AND action_type = 'url' AND status = 'enabled' AND (url = %s OR url = %s) ORDER BY id DESC LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$source,
				$alt
			)
		);
	}

	private static function redirection_write( $source, $target ) {
		global $wpdb;
		$row = self::redirection_find( $source );
		if ( null === $target ) {
			if ( ! $row ) {
				return true;
			}
			$req = new WP_REST_Request( 'POST', '/redirection/v1/bulk/redirect/delete' );
			$req->set_header( 'content-type', 'application/json' );
			$req->set_body( wp_json_encode( array( 'items' => array( (int) $row->id ) ) ) );
			return self::rest_ok( rest_do_request( $req ) );
		}
		$group = $row ? (int) $row->group_id : 0;
		if ( ! $group ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$group = (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}redirection_groups WHERE status = 'enabled' AND module_id = 1 ORDER BY id ASC LIMIT 1" );
		}
		if ( ! $group ) {
			return new WP_Error( 'arachnide_redirection', 'Redirection has no enabled group: finish the Redirection setup first.', array( 'status' => 500 ) );
		}
		$body = array(
			'status'      => 'enabled',
			'url'         => $source,
			'regex'       => false,
			'match_type'  => 'url',
			'match_data'  => array( 'source' => array( 'flag_query' => 'exact' ) ),
			'title'       => 'Arachnide SEO Spider',
			'group_id'    => $group,
			'action_type' => 'url',
			'action_code' => 301,
			'action_data' => array( 'url' => $target ),
		);
		$route = $row ? '/redirection/v1/redirect/' . (int) $row->id : '/redirection/v1/redirect';
		$req   = new WP_REST_Request( 'POST', $route );
		$req->set_header( 'content-type', 'application/json' );
		$req->set_body( wp_json_encode( $body ) );
		return self::rest_ok( rest_do_request( $req ) );
	}

	private static function rest_ok( $response ) {
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		if ( $response->is_error() ) {
			$err = $response->as_error();
			return new WP_Error( 'arachnide_redirection', 'Redirection: ' . $err->get_error_message(), array( 'status' => 500 ) );
		}
		return true;
	}

	public static function maybe_redirect() {
		$all = get_option( self::REDIRECTS_OPTION, array() );
		if ( ! $all || ! is_array( $all ) || ! isset( $_SERVER['REQUEST_URI'] ) ) {
			return;
		}
		$uri    = wp_unslash( $_SERVER['REQUEST_URI'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$source = self::normalize_source( $uri );
		$path   = self::normalize_source( strtok( $uri, '?' ) );
		$target = isset( $all[ $source ] ) ? $all[ $source ] : ( isset( $all[ $path ] ) ? $all[ $path ] : null );
		if ( $target && self::normalize_source( $target ) !== $source ) {
			wp_redirect( esc_url_raw( $target ), 301, 'Arachnide' ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
			exit;
		}
	}
}

add_action( 'plugins_loaded', array( 'Arachnide_Connector', 'init' ), 20 );
