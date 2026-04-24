<?php
declare(strict_types=1);

/**
 * Misma validación y armado de payload que save-menu.php (salida compatible con menu.json).
 *
 * @throws InvalidArgumentException mensaje listo para el cliente
 * @return array<string, mixed>
 */
function olc_menu_validate_and_build(array $data): array
{
    if (!isset($data['categories']) || !is_array($data['categories'])) {
        throw new InvalidArgumentException('Falta el arreglo categories.');
    }
    if (isset($data['modifierLibrary']) && !is_array($data['modifierLibrary'])) {
        throw new InvalidArgumentException('modifierLibrary debe ser un arreglo.');
    }

    foreach ($data['categories'] as $i => $cat) {
        if (!is_array($cat) || !is_string($cat['id'] ?? null) || $cat['id'] === '') {
            throw new InvalidArgumentException('Categoría inválida (índice ' . $i . '): id obligatorio.');
        }
        if (!is_string($cat['name'] ?? null) || $cat['name'] === '') {
            throw new InvalidArgumentException('Categoría "' . $cat['id'] . '": nombre obligatorio.');
        }
        if (!isset($cat['products']) || !is_array($cat['products'])) {
            throw new InvalidArgumentException('Categoría "' . $cat['id'] . '": products debe ser un arreglo.');
        }
        foreach ($cat['products'] as $j => $p) {
            if (!is_array($p) || !is_string($p['id'] ?? null) || $p['id'] === '') {
                throw new InvalidArgumentException('Producto inválido en "' . $cat['id'] . '" (fila ' . $j . ').');
            }
            if (!is_string($p['name'] ?? null) || $p['name'] === '') {
                throw new InvalidArgumentException('Producto "' . $p['id'] . '": nombre obligatorio.');
            }
            if (!isset($p['price']) || (!is_numeric($p['price']) && !is_int($p['price']))) {
                throw new InvalidArgumentException('Producto "' . $p['id'] . '": precio obligatorio.');
            }
        }
    }

    $modifierLibrary = sanitize_modifier_library($data['modifierLibrary'] ?? []);
    $validModifierIds = [];
    foreach ($modifierLibrary as $mg) {
        $validModifierIds[$mg['id']] = true;
    }

    $checkoutPayment = sanitize_checkout_payment(
        isset($data['checkoutPayment']) && is_array($data['checkoutPayment']) ? $data['checkoutPayment'] : []
    );

    $out = [
        'logoUrl' => isset($data['logoUrl']) && is_string($data['logoUrl'])
            ? trim(clip_utf8($data['logoUrl'], 600))
            : '',
        'currencySymbol' => isset($data['currencySymbol']) && is_string($data['currencySymbol']) && $data['currencySymbol'] !== ''
            ? $data['currencySymbol']
            : '$',
        'checkoutPayment' => $checkoutPayment,
        'categories' => [],
        'modifierLibrary' => $modifierLibrary,
    ];

    foreach ($data['categories'] as $cat) {
        $entry = [
            'id' => $cat['id'],
            'name' => $cat['name'],
            'products' => [],
        ];
        if (isset($cat['layout']) && $cat['layout'] === 'row') {
            $entry['layout'] = 'row';
        }
        foreach ($cat['products'] as $p) {
            $entry['products'][] = sanitize_product($p, $validModifierIds);
        }
        $out['categories'][] = $entry;
    }

    return $out;
}

function clip_utf8(string $s, int $maxLen): string
{
    if ($maxLen <= 0) {
        return '';
    }
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $maxLen, 'UTF-8');
    }

    return substr($s, 0, $maxLen);
}

/**
 * @return array<string, mixed>|null
 */
function sanitize_modifier_option_row(array $o): ?array
{
    if (!isset($o['name']) || !is_string($o['name']) || $o['name'] === '') {
        return null;
    }
    $oid = isset($o['id']) && is_string($o['id']) && $o['id'] !== ''
        ? $o['id']
        : ('opt-' . bin2hex(random_bytes(5)));
    $row = [
        'id' => $oid,
        'name' => clip_utf8($o['name'], 120),
        'price' => (int) round((float) ($o['price'] ?? 0)),
        'maxQty' => 99,
    ];
    $mq = isset($o['maxQty']) ? (int) $o['maxQty'] : 99;
    if ($mq < 1) {
        $mq = 1;
    }
    if ($mq > 99) {
        $mq = 99;
    }
    $row['maxQty'] = $mq;
    if (isset($o['cost']) && is_numeric($o['cost'])) {
        $row['cost'] = round((float) $o['cost'], 2);
    }
    if (isset($o['discount']) && is_numeric($o['discount'])) {
        $row['discount'] = round((float) $o['discount'], 2);
    }
    if (isset($o['sku']) && is_string($o['sku']) && trim($o['sku']) !== '') {
        $row['sku'] = clip_utf8(trim($o['sku']), 80);
    }
    if (isset($o['status']) && $o['status'] === 'hidden') {
        $row['status'] = 'hidden';
    }

    return $row;
}

/**
 * @return array<string, mixed>|null
 */
function sanitize_modifier_group_row(array $m): ?array
{
    if (!is_array($m) || !isset($m['name']) || !is_string($m['name']) || $m['name'] === '') {
        return null;
    }
    $mid = isset($m['id']) && is_string($m['id']) && $m['id'] !== ''
        ? $m['id']
        : ('mod-' . bin2hex(random_bytes(4)));
    $optional = array_key_exists('optional', $m) ? (bool) $m['optional'] : false;
    $multiSelect = array_key_exists('multiSelect', $m) ? (bool) $m['multiSelect'] : true;
    $minSel = isset($m['minSelect']) ? max(0, min(40, (int) $m['minSelect'])) : 0;
    $maxSel = isset($m['maxSelect']) ? max(0, min(40, (int) $m['maxSelect'])) : 0;
    $entry = [
        'id' => $mid,
        'name' => clip_utf8($m['name'], 150),
        'optional' => $optional,
        'multiSelect' => $multiSelect,
        'minSelect' => $minSel,
        'maxSelect' => $maxSel,
        'options' => [],
    ];
    $seenOpt = [];
    $oi = 0;
    foreach ($m['options'] ?? [] as $o) {
        if ($oi++ > 40) {
            break;
        }
        if (!is_array($o)) {
            continue;
        }
        $opt = sanitize_modifier_option_row($o);
        if ($opt === null) {
            continue;
        }
        if (isset($seenOpt[$opt['id']])) {
            continue;
        }
        $seenOpt[$opt['id']] = true;
        $entry['options'][] = $opt;
    }

    return $entry;
}

/**
 * @return list<array<string, mixed>>
 */
function sanitize_modifier_library($raw): array
{
    if (!is_array($raw)) {
        return [];
    }
    $out = [];
    $seenIds = [];
    $gi = 0;
    foreach ($raw as $m) {
        if ($gi++ > 60) {
            break;
        }
        if (!is_array($m)) {
            continue;
        }
        $g = sanitize_modifier_group_row($m);
        if ($g === null) {
            continue;
        }
        if (isset($seenIds[$g['id']])) {
            continue;
        }
        $seenIds[$g['id']] = true;
        $out[] = $g;
    }

    return $out;
}

/**
 * @return array{methods: list<array{id: string, label: string, enabled: bool, instructions: string}>}
 */
function sanitize_checkout_payment(array $raw): array
{
    $catalog = [
        'efectivo' => 'Efectivo',
        'pago_online' => 'Pago Online',
        'transferencia' => 'Transferencia',
        'pluxee_sodexo' => 'Pluxee (Sodexo)',
        'ticket_edenred' => 'Ticket Restaurant (Edenred)',
        'tarjeta' => 'Tarjeta',
    ];
    $enabledFrom = [];
    $labelsFrom = [];
    $instructionsFrom = [];
    if (isset($raw['methods']) && is_array($raw['methods'])) {
        foreach ($raw['methods'] as $row) {
            if (!is_array($row) || !isset($row['id']) || !is_string($row['id'])) {
                continue;
            }
            $id = $row['id'];
            if (!isset($catalog[$id])) {
                continue;
            }
            $enabledFrom[$id] = array_key_exists('enabled', $row) ? (bool) $row['enabled'] : true;
            if (isset($row['label']) && is_string($row['label']) && trim($row['label']) !== '') {
                $labelsFrom[$id] = clip_utf8(trim($row['label']), 80);
            }
            if (isset($row['instructions']) && is_string($row['instructions'])) {
                $instructionsFrom[$id] = clip_utf8($row['instructions'], 800);
            }
        }
    }
    $methods = [];
    foreach ($catalog as $id => $defaultLabel) {
        $methods[] = [
            'id' => $id,
            'label' => $labelsFrom[$id] ?? $defaultLabel,
            'enabled' => $enabledFrom[$id] ?? true,
            'instructions' => $instructionsFrom[$id] ?? '',
        ];
    }
    if (isset($raw['instructions']) && is_string($raw['instructions']) && trim($raw['instructions']) !== '') {
        $legacy = clip_utf8(trim($raw['instructions']), 800);
        foreach ($methods as $i => $m) {
            if ($m['id'] === 'efectivo' && ($m['instructions'] === '' || $m['instructions'] === null)) {
                $methods[$i]['instructions'] = $legacy;
                break;
            }
        }
    }

    return ['methods' => $methods];
}

/**
 * @param array<string, true> $validModifierIds
 * @return array<string, mixed>
 */
function sanitize_product(array $p, array $validModifierIds): array
{
    $prod = [
        'id' => (string) $p['id'],
        'name' => (string) $p['name'],
        'price' => (int) round((float) ($p['price'] ?? 0)),
    ];

    if (isset($p['description']) && is_string($p['description']) && $p['description'] !== '') {
        $prod['description'] = $p['description'];
    }
    if (isset($p['imageUrl']) && is_string($p['imageUrl']) && $p['imageUrl'] !== '') {
        $prod['imageUrl'] = $p['imageUrl'];
    }
    if (isset($p['sku']) && is_string($p['sku']) && $p['sku'] !== '') {
        $prod['sku'] = $p['sku'];
    }
    if (isset($p['kitchen']) && is_string($p['kitchen']) && $p['kitchen'] !== '') {
        $prod['kitchen'] = $p['kitchen'];
    }

    if (isset($p['status']) && in_array($p['status'], ['available', 'hidden'], true)) {
        $prod['status'] = $p['status'];
    }

    if (isset($p['pricingMode']) && $p['pricingMode'] === 'variants') {
        $prod['pricingMode'] = 'variants';
        $vars = [];
        if (!empty($p['variants']) && is_array($p['variants'])) {
            foreach ($p['variants'] as $v) {
                if (!is_array($v) || !isset($v['name']) || !is_string($v['name']) || $v['name'] === '') {
                    continue;
                }
                $vars[] = [
                    'name' => $v['name'],
                    'price' => (int) round((float) ($v['price'] ?? 0)),
                ];
            }
        }
        $prod['variants'] = $vars;
        if ($vars !== []) {
            $prices = array_column($vars, 'price');
            $prod['price'] = min($prices);
        }
    }

    foreach (['discount', 'cost', 'packaging'] as $key) {
        if (isset($p[$key]) && is_numeric($p[$key])) {
            $prod[$key] = round((float) $p[$key], 2);
        }
    }

    if (!empty($p['stockEnabled'])) {
        $prod['stockEnabled'] = true;
        $stock = isset($p['stock']) && is_numeric($p['stock']) ? (int) round((float) $p['stock']) : 0;
        $minStock = isset($p['minStock']) && is_numeric($p['minStock']) ? (int) round((float) $p['minStock']) : 0;
        if ($stock < 0) {
            $stock = 0;
        }
        if ($minStock < 0) {
            $minStock = 0;
        }
        if ($stock > 9999999) {
            $stock = 9999999;
        }
        if ($minStock > 9999999) {
            $minStock = 9999999;
        }
        $prod['stock'] = $stock;
        $prod['minStock'] = $minStock;
    }

    if (!empty($p['modifiers']) && is_array($p['modifiers'])) {
        $mods = [];
        $gi = 0;
        $seenG = [];
        foreach ($p['modifiers'] as $m) {
            if ($gi++ > 30) {
                break;
            }
            if (!is_array($m)) {
                continue;
            }
            $g = sanitize_modifier_group_row($m);
            if ($g === null) {
                continue;
            }
            if (isset($seenG[$g['id']])) {
                continue;
            }
            $seenG[$g['id']] = true;
            $mods[] = $g;
        }
        if ($mods !== []) {
            $prod['modifiers'] = $mods;
        }
    }

    if ($validModifierIds !== [] && !empty($p['modifierIds']) && is_array($p['modifierIds'])) {
        $ordered = [];
        $seen = [];
        foreach ($p['modifierIds'] as $mid) {
            if (!is_string($mid) || $mid === '' || isset($seen[$mid])) {
                continue;
            }
            if (!isset($validModifierIds[$mid])) {
                continue;
            }
            $seen[$mid] = true;
            $ordered[] = $mid;
            if (count($ordered) >= 24) {
                break;
            }
        }
        if ($ordered !== []) {
            $prod['modifierIds'] = $ordered;
        }
    }

    return $prod;
}
