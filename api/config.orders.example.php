<?php
/**
 * Copia como config.orders.php (no lo subas si contiene un token real).
 * Sirve para api/set-order-payment-status.php (marcar pedido pagado / no pagado / reembolsado).
 */
return [
    /** Token largo y aleatorio; enviarlo en cabecera X-Olc-Orders-Admin-Token en cada POST. */
    'adminToken' => '',
];
