<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . DIRECTORY_SEPARATOR . 'db.php';

$pdo = olc_pdo();
if ($pdo instanceof PDO) {
    require_once __DIR__ . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'menu_repository.php';
    try {
        header('X-Olc-Menu-Source: mysql');
        echo json_encode(menu_repository_load($pdo), JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
        http_response_code(500);
        header('X-Olc-Menu-Source: mysql-error');
        echo json_encode(['error' => 'No se pudo leer el menú desde MySQL: ' . $e->getMessage()]);
    }
    exit;
}

$path = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'menu.json';
if (!is_file($path)) {
    http_response_code(404);
    header('X-Olc-Menu-Source: none');
    echo json_encode(['error' => 'No hay menú en MySQL ni data/menu.json.']);
    exit;
}

$raw = file_get_contents($path);
if ($raw === false) {
    http_response_code(500);
    header('X-Olc-Menu-Source: file-error');
    echo json_encode(['error' => 'No se pudo leer data/menu.json.']);
    exit;
}

header('X-Olc-Menu-Source: file');
echo $raw;
