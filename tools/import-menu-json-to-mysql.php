#!/usr/bin/env php
<?php
/**
 * Importa data/menu.json a MySQL (mismo formato que el admin).
 * Uso: php tools/import-menu-json-to-mysql.php
 * Requiere api/config.database.php y el esquema database/schema.sql ya aplicado.
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/api/db.php';
require_once $root . '/api/lib/menu_validate_and_build.php';
require_once $root . '/api/lib/menu_repository.php';

if (!olc_db_configured()) {
    fwrite(STDERR, "Crea api/config.database.php (copia de config.database.example.php).\n");
    exit(1);
}

$pdo = olc_pdo();
if (!$pdo instanceof PDO) {
    fwrite(STDERR, "No se pudo conectar a MySQL. Revisa DSN, usuario y contraseña.\n");
    exit(1);
}

$path = $root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'menu.json';
if (!is_file($path)) {
    fwrite(STDERR, "No existe data/menu.json\n");
    exit(1);
}

$raw = file_get_contents($path);
if ($raw === false) {
    fwrite(STDERR, "No se pudo leer data/menu.json\n");
    exit(1);
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    fwrite(STDERR, "JSON inválido\n");
    exit(1);
}

try {
    $out = olc_menu_validate_and_build($data);
    menu_repository_save($pdo, $out);
} catch (Throwable $e) {
    fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
    exit(1);
}

echo "Importación correcta a MySQL.\n";
