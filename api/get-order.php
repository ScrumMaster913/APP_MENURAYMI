<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Solo se acepta GET.']);
    exit;
}

$orderId = isset($_GET['order_id']) ? trim((string) $_GET['order_id']) : '';
if ($orderId === '' || !preg_match('/^[a-f0-9]{12}$/', $orderId)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'order_id inválido.']);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'db.php';

$pdo = olc_pdo();
if (!$pdo instanceof PDO) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Sin conexión a la base de datos.']);
    exit;
}

$sql = <<<'SQL'
SELECT o.id, o.public_id, o.status, o.total_clp, o.service_type,
       o.payment_method_slug, o.payment_method_label,
       o.payment_status, o.paid_at,
       o.delivery_name, o.delivery_phone, o.delivery_address_label, o.customer_comment,
       o.order_message, o.created_at,
       (SELECT COUNT(*) FROM order_lines ol WHERE ol.order_id = o.id) AS line_count
FROM orders o
WHERE o.public_id = ?
LIMIT 1
SQL;

$st = $pdo->prepare($sql);
$st->execute([$orderId]);
$row = $st->fetch(PDO::FETCH_ASSOC);
if ($row === false) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Pedido no encontrado.']);
    exit;
}

$order = [
    'id' => (int) $row['id'],
    'publicId' => (string) $row['public_id'],
    'status' => (string) $row['status'],
    'totalClp' => (int) $row['total_clp'],
    'serviceType' => (string) $row['service_type'],
    'paymentMethodSlug' => $row['payment_method_slug'] !== null ? (string) $row['payment_method_slug'] : '',
    'paymentMethodLabel' => $row['payment_method_label'] !== null ? (string) $row['payment_method_label'] : '',
    'paymentStatus' => isset($row['payment_status']) ? (string) $row['payment_status'] : 'unpaid',
    'paidAt' => !empty($row['paid_at']) ? (string) $row['paid_at'] : null,
    'deliveryName' => $row['delivery_name'] !== null ? (string) $row['delivery_name'] : '',
    'deliveryPhone' => $row['delivery_phone'] !== null ? (string) $row['delivery_phone'] : '',
    'deliveryAddressLabel' => $row['delivery_address_label'] !== null ? (string) $row['delivery_address_label'] : '',
    'customerComment' => $row['customer_comment'] !== null ? (string) $row['customer_comment'] : '',
    'orderMessage' => $row['order_message'] !== null ? (string) $row['order_message'] : '',
    'createdAt' => (string) $row['created_at'],
    'lineCount' => (int) $row['line_count'],
];

echo json_encode(['ok' => true, 'order' => $order], JSON_UNESCAPED_UNICODE);
