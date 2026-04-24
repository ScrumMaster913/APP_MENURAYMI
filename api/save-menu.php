<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Solo se acepta POST.']);
    exit;
}

$maxBytes = 2 * 1024 * 1024;
$raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($raw === false || strlen($raw) > $maxBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'JSON demasiado grande.']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'JSON inválido.']);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'menu_validate_and_build.php';

try {
    $out = olc_menu_validate_and_build($data);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'db.php';
$pdo = olc_pdo();
if ($pdo instanceof PDO) {
    require_once __DIR__ . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'menu_repository.php';
    try {
        menu_repository_save($pdo, $out);
        header('X-Olc-Menu-Saved-To: mysql');
        echo json_encode(['ok' => true, 'storage' => 'mysql']);
    } catch (Throwable $e) {
        http_response_code(500);
        header('X-Olc-Menu-Saved-To: mysql-error');
        echo json_encode(['ok' => false, 'error' => 'Error al guardar en MySQL: ' . $e->getMessage()]);
    }
    exit;
}

$dir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
$path = $dir . DIRECTORY_SEPARATOR . 'menu.json';

if (!is_dir($dir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No existe la carpeta data/.']);
    exit;
}

$json = json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($json === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo serializar el menú.']);
    exit;
}

if (file_put_contents($path, $json, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo escribir data/menu.json (permisos o bloqueo).']);
    exit;
}

header('X-Olc-Menu-Saved-To: file');
echo json_encode(['ok' => true, 'storage' => 'file']);
