<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Solo se acepta POST.']);
    exit;
}

$cfgPath = __DIR__ . DIRECTORY_SEPARATOR . 'config.orders.php';
if (!is_file($cfgPath)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Falta api/config.orders.php (copia desde config.orders.example.php).']);
    exit;
}

/** @var array{adminToken?:string} $cfg */
$cfg = require $cfgPath;
$expected = isset($cfg['adminToken']) ? trim((string) $cfg['adminToken']) : '';
if ($expected === '') {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Define adminToken en config.orders.php.']);
    exit;
}

$hdr = isset($_SERVER['HTTP_X_OLC_ORDERS_ADMIN_TOKEN'])
    ? trim((string) $_SERVER['HTTP_X_OLC_ORDERS_ADMIN_TOKEN'])
    : '';
if ($hdr === '' || !hash_equals($expected, $hdr)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autorizado.']);
    exit;
}

$maxBytes = 16 * 1024;
$raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($raw === false || strlen($raw) > $maxBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'Cuerpo demasiado grande.']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'JSON inválido.']);
    exit;
}

$publicId = isset($data['publicId']) ? trim((string) $data['publicId']) : '';
if ($publicId === '' || !preg_match('/^[a-f0-9]{12}$/', $publicId)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'publicId inválido (12 caracteres hex).']);
    exit;
}

$status = isset($data['paymentStatus']) ? strtolower(trim((string) $data['paymentStatus'])) : '';
$allowed = ['unpaid', 'paid', 'refunded'];
if (!in_array($status, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'paymentStatus debe ser: unpaid, paid o refunded.']);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'db.php';
$pdo = olc_pdo();
if (!$pdo instanceof PDO) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Sin conexión a la base de datos.']);
    exit;
}

if ($status === 'paid') {
    $st = $pdo->prepare(
        'UPDATE orders SET payment_status = ?, paid_at = COALESCE(paid_at, NOW()) WHERE public_id = ? LIMIT 1'
    );
    $st->execute([$status, $publicId]);
} elseif ($status === 'unpaid') {
    $st = $pdo->prepare('UPDATE orders SET payment_status = ?, paid_at = NULL WHERE public_id = ? LIMIT 1');
    $st->execute([$status, $publicId]);
} else {
    $st = $pdo->prepare('UPDATE orders SET payment_status = ? WHERE public_id = ? LIMIT 1');
    $st->execute([$status, $publicId]);
}

if ($st->rowCount() < 1) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Pedido no encontrado.']);
    exit;
}

echo json_encode(['ok' => true, 'publicId' => $publicId, 'paymentStatus' => $status], JSON_UNESCAPED_UNICODE);
