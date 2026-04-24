<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Solo se acepta POST.']);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'db.php';

$pdo = olc_pdo();
if (!$pdo instanceof PDO) {
    header('X-Olc-Order-Storage: skipped');
    echo json_encode(['ok' => true, 'skipped' => true, 'storage' => 'none']);
    exit;
}

$maxBytes = 256 * 1024;
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

$serviceType = isset($data['serviceType']) && is_string($data['serviceType']) ? trim($data['serviceType']) : '';
if ($serviceType === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Falta serviceType.']);
    exit;
}

$items = $data['items'] ?? null;
if (!is_array($items) || $items === []) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'El pedido no tiene ítems.']);
    exit;
}

$total = isset($data['total']) && is_numeric($data['total']) ? (int) round((float) $data['total']) : 0;
if ($total < 0 || $total > 50000000) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Total inválido.']);
    exit;
}

$sum = 0;
foreach ($items as $it) {
    if (!is_array($it)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Ítem inválido.']);
        exit;
    }
    $name = isset($it['name']) && is_string($it['name']) ? trim($it['name']) : '';
    if ($name === '' || strlen($name) > 240) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Nombre de producto inválido.']);
        exit;
    }
    $qty = isset($it['qty']) && is_numeric($it['qty']) ? max(1, min(99, (int) $it['qty'])) : 1;
    $lineTotal = isset($it['total']) && is_numeric($it['total']) ? (int) round((float) $it['total']) : 0;
    if ($lineTotal < 0 || $lineTotal > 50000000) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Subtotal de línea inválido.']);
        exit;
    }
    $sum += $lineTotal;
}

if (abs($sum - $total) > 2) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'El total no coincide con las líneas.']);
    exit;
}

$deliveryName = isset($data['deliveryName']) && is_string($data['deliveryName']) ? trim($data['deliveryName']) : null;
$deliveryPhone = isset($data['deliveryPhone']) && is_string($data['deliveryPhone']) ? trim($data['deliveryPhone']) : null;
$deliveryAddress = $data['deliveryAddress'] ?? null;
$deliveryAddressJson = null;
if (is_array($deliveryAddress)) {
    $deliveryAddressJson = json_encode($deliveryAddress, JSON_UNESCAPED_UNICODE);
}
$deliveryLabel = isset($data['deliveryAddressLabel']) && is_string($data['deliveryAddressLabel'])
    ? trim($data['deliveryAddressLabel'])
    : null;
if ($deliveryLabel !== null && strlen($deliveryLabel) > 4000) {
    $deliveryLabel = substr($deliveryLabel, 0, 4000);
}

$comment = isset($data['customerComment']) && is_string($data['customerComment']) ? trim($data['customerComment']) : null;
$coupon = isset($data['coupon']) && is_string($data['coupon']) ? trim($data['coupon']) : null;
$paySlug = isset($data['paymentMethodSlug']) && is_string($data['paymentMethodSlug']) ? trim($data['paymentMethodSlug']) : null;
$payLabel = isset($data['paymentMethodLabel']) && is_string($data['paymentMethodLabel']) ? trim($data['paymentMethodLabel']) : null;
$cashTender = isset($data['cashTender']) && is_numeric($data['cashTender']) ? (int) round((float) $data['cashTender']) : null;
$changeCl = isset($data['changeCl']) && is_numeric($data['changeCl']) ? (int) round((float) $data['changeCl']) : null;
$orderMessage = isset($data['orderMessage']) && is_string($data['orderMessage']) ? $data['orderMessage'] : null;
if ($orderMessage !== null && strlen($orderMessage) > 65000) {
    $orderMessage = substr($orderMessage, 0, 65000);
}

$publicId = bin2hex(random_bytes(6));

$pdo->beginTransaction();
try {
    $insO = $pdo->prepare(
        'INSERT INTO orders (public_id, service_type, status, subtotal_clp, total_clp, delivery_name, delivery_phone, delivery_address_json, delivery_address_label, customer_comment, coupon, payment_method_slug, payment_method_label, payment_status, paid_at, cash_tender_clp, change_clp, order_message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $insO->execute([
        $publicId,
        clip_order_str($serviceType, 40),
        'confirmed',
        $sum,
        $total,
        $deliveryName !== '' ? clip_order_str($deliveryName, 200) : null,
        $deliveryPhone !== '' ? clip_order_str($deliveryPhone, 64) : null,
        $deliveryAddressJson,
        $deliveryLabel !== '' ? $deliveryLabel : null,
        $comment !== '' ? clip_order_str($comment, 4000) : null,
        $coupon !== '' ? clip_order_str($coupon, 160) : null,
        $paySlug !== '' ? clip_order_str($paySlug, 40) : null,
        $payLabel !== '' ? clip_order_str($payLabel, 120) : null,
        'unpaid',
        null,
        $cashTender,
        $changeCl,
        $orderMessage,
    ]);
    $orderId = (int) $pdo->lastInsertId();

    $insL = $pdo->prepare(
        'INSERT INTO order_lines (order_id, sort_order, product_id, product_name, variant_name, qty, unit_price_clp, line_total_clp, notes, modifiers_json) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    $i = 0;
    foreach ($items as $it) {
        $productId = isset($it['productId']) && is_string($it['productId']) ? clip_order_str($it['productId'], 80) : null;
        $name = trim((string) $it['name']);
        $variant = isset($it['variantName']) && is_string($it['variantName']) ? trim($it['variantName']) : null;
        $qty = isset($it['qty']) && is_numeric($it['qty']) ? max(1, min(99, (int) $it['qty'])) : 1;
        $unit = isset($it['unit']) && is_numeric($it['unit']) ? (int) round((float) $it['unit']) : (int) round(((float) $it['total']) / max(1, $qty));
        $lineTotal = (int) round((float) $it['total']);
        $notes = isset($it['notes']) && is_string($it['notes']) ? trim($it['notes']) : null;
        $mods = $it['mods'] ?? null;
        $modsJson = null;
        if (is_array($mods) && $mods !== []) {
            $modsJson = json_encode($mods, JSON_UNESCAPED_UNICODE);
        }
        $insL->execute([
            $orderId,
            $i,
            $productId,
            clip_order_str($name, 255),
            $variant !== '' && $variant !== null ? clip_order_str($variant, 160) : null,
            $qty,
            $unit,
            $lineTotal,
            $notes !== '' && $notes !== null ? clip_order_str($notes, 2000) : null,
            $modsJson,
        ]);
        ++$i;
    }

    $pdo->commit();
    header('X-Olc-Order-Storage: mysql');
    echo json_encode(['ok' => true, 'storage' => 'mysql', 'orderId' => $orderId, 'publicId' => $publicId]);
} catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    header('X-Olc-Order-Storage: mysql-error');
    echo json_encode(['ok' => false, 'error' => 'No se pudo guardar el pedido: ' . $e->getMessage()]);
}

function clip_order_str(string $s, int $max): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max, 'UTF-8');
    }

    return substr($s, 0, $max);
}
