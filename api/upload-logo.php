<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Solo se acepta POST.']);
    exit;
}

if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Falta el archivo (file).']);
    exit;
}

$f = $_FILES['file'];
if (!is_array($f) || !isset($f['error'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Archivo inválido.']);
    exit;
}

if ($f['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Error al subir archivo (code ' . (int)$f['error'] . ').']);
    exit;
}

$maxBytes = 2 * 1024 * 1024; // 2MB
if (!isset($f['size']) || (int)$f['size'] <= 0 || (int)$f['size'] > $maxBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'El logo debe pesar hasta 2MB.']);
    exit;
}

$tmp = $f['tmp_name'] ?? '';
if (!is_string($tmp) || $tmp === '' || !is_uploaded_file($tmp)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'No se pudo leer el archivo temporal.']);
    exit;
}

$mime = @mime_content_type($tmp);
if (!is_string($mime) || $mime === '') {
    $mime = 'application/octet-stream';
}

$allowed = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
    'image/svg+xml' => 'svg',
];

if (!isset($allowed[$mime])) {
    http_response_code(415);
    echo json_encode(['ok' => false, 'error' => 'Formato no permitido. Usa PNG, JPG, WEBP, GIF o SVG.']);
    exit;
}

// En SVG, valida que sea texto y no gigantesco (ya validamos size, pero evitamos binarios raros).
if ($mime === 'image/svg+xml') {
    $raw = file_get_contents($tmp);
    if ($raw === false || stripos($raw, '<svg') === false) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'SVG inválido.']);
        exit;
    }
}

$root = dirname(__DIR__);
$destDir = $root . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'uploads';
if (!is_dir($destDir)) {
    if (!mkdir($destDir, 0775, true) && !is_dir($destDir)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo crear assets/uploads.']);
        exit;
    }
}

$ext = $allowed[$mime];
$name = 'logo-' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
$destPath = $destDir . DIRECTORY_SEPARATOR . $name;

if (!move_uploaded_file($tmp, $destPath)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo guardar el archivo en el servidor.']);
    exit;
}

// URL relativa para el frontend
$url = 'assets/uploads/' . $name;
echo json_encode(['ok' => true, 'url' => $url]);

